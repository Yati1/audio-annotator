import fs from 'node:fs/promises';
import { test, expect } from './fixtures/base';
import { AppPage } from './pages/AppPage';
import type { AnnotationItemHandle } from './pages/AnnotationPanel';
import { makeWavFile } from './fixtures/wav';
import { makeFullProject, buildValidBundle } from './fixtures/bundle';
import { newId } from '../../src/lib/id';
import { SCHEMA_VERSION } from '../../src/features/types';

/** What a recipient should see for one annotation, read from the list item. */
async function snapshot(item: AnnotationItemHandle) {
  return {
    id: await item.id(),
    badge: await item.badge().innerText(),
    author: await item.author().innerText(),
    color: await item.locator().evaluate((el) => getComputedStyle(el).borderLeftColor),
    replies: await item.replies().evaluateAll((els) =>
      els.map((el) => ({
        id: el.getAttribute('data-reply-id'),
        text: el.querySelector('.reply-body span')?.textContent,
        author: el.querySelector('.author')?.textContent,
        postedAt: el.querySelector('time')?.getAttribute('datetime'),
      })),
    ),
  };
}

test.describe('roundtrip', () => {
  test('exports a bundle and restores it faithfully in a fresh browser context (SC-003)', async ({
    app,
    browser,
  }) => {
    await app.ensureSession('Ava');
    await app.openAudioFixture(makeWavFile({ durationSec: 4 }));
    await app.waveform.seekToFraction(0.5);
    await app.transport.addPoint();
    await app.draftDialog.createWithNote('Exported point');
    await app.waveform.seekToFraction(0);
    await app.transport.startRegion();
    await app.draftDialog.createWithNote('Exported region');
    const point = app.annotations.itemByNote('Exported point');
    await point.addReply('Exported reply');
    // Reply submission is fire-and-forget from the UI's perspective; wait for it to render
    // before exporting so the store's in-memory state (what exportBundle reads) reflects it.
    await expect(point.replies()).toHaveCount(1);

    const expectedPoint = await snapshot(point);
    const expectedRegion = await snapshot(app.annotations.itemByNote('Exported region'));
    expect(expectedPoint.badge).not.toBe(expectedRegion.badge);

    const download = await app.importExport.exportBundle();
    // The project title comes from the audio file name, minus its extension.
    expect(download.suggestedFilename()).toBe('clip-a.aaz');
    const downloadPath = await download.path();
    if (!downloadPath) throw new Error('download did not complete');
    const bytes = await fs.readFile(downloadPath);

    const freshContext = await browser.newContext();
    try {
      const freshPage = await freshContext.newPage();
      const freshApp = new AppPage(freshPage);
      await freshPage.goto('/');
      await freshApp.ensureSession('Ben');
      await freshApp.importExport.importBundle({
        name: 'export.aaz',
        mimeType: 'application/zip',
        buffer: bytes,
      });

      const restoredPoint = freshApp.annotations.itemByNote('Exported point');
      await expect(restoredPoint.replies()).toHaveCount(1);
      await freshApp.waveform.waitUntilReady();

      // Same ids, times, authors (not Ben, the recipient), colors and reply timestamps.
      expect(await snapshot(restoredPoint)).toEqual(expectedPoint);
      expect(await snapshot(freshApp.annotations.itemByNote('Exported region'))).toEqual(
        expectedRegion,
      );
      expect(await freshApp.annotations.count()).toBe(2);
      expect(await freshApp.transport.durationSeconds()).toBe(4);

      // The audio came through intact enough to play.
      await freshApp.transport.playPause();
      await expect.poll(() => freshApp.transport.isPlaying()).toBe(true);
    } finally {
      await freshContext.close();
    }
  });

  test.describe('re-importing a bundle derived from the same original (FR-028)', () => {
    const projectId = newId();
    const audioId = newId();
    const originalId = newId();
    const now = new Date().toISOString();
    const audioBytes = makeWavFile({ durationSec: 2 }).buffer;

    const original = makeFullProject({
      project: {
        id: projectId,
        title: 'Merge project',
        audioId,
        schemaVersion: SCHEMA_VERSION,
        createdAt: now,
        updatedAt: now,
      },
      audio: {
        id: audioId,
        fileName: 'clip-a.wav',
        mimeType: 'audio/wav',
        durationSec: 2,
        byteSize: 2044,
      },
      annotations: [
        {
          id: originalId,
          projectId,
          kind: 'point',
          startSec: 1,
          endSec: null,
          note: 'Original note',
          authorName: 'Ava',
          authorColor: '#3987e5',
          createdAt: now,
          updatedAt: now,
        },
      ],
      replies: [],
    });

    test.beforeEach(async ({ app }) => {
      await app.ensureSession('Ava');
      await app.importExport.importBundle({
        name: 'a.aaz',
        mimeType: 'application/zip',
        buffer: await buildValidBundle(original, audioBytes),
      });
      await expect(app.annotations.itemByNote('Original note').locator()).toBeVisible();
    });

    test('adds new annotations and replies by id, keeping originals (Scenario D)', async ({
      app,
    }) => {
      const modified = makeFullProject({
        project: original.project,
        audio: original.audio,
        annotations: [
          ...original.annotations,
          {
            id: newId(),
            projectId,
            kind: 'point',
            startSec: 1.5,
            endSec: null,
            note: 'Added remotely',
            authorName: 'Ben',
            authorColor: '#d95926',
            createdAt: now,
            updatedAt: now,
          },
        ],
        replies: [
          {
            id: newId(),
            annotationId: originalId,
            text: 'Remote reply',
            authorName: 'Ben',
            authorColor: '#d95926',
            createdAt: now,
            updatedAt: now,
          },
        ],
      });

      await app.importExport.importBundle({
        name: 'b.aaz',
        mimeType: 'application/zip',
        buffer: await buildValidBundle(modified, audioBytes),
      });

      await expect(app.importExport.message()).toContainText('2 new item(s)');
      const originalItem = app.annotations.itemByNote('Original note');
      await expect(originalItem.locator()).toBeVisible();
      await expect(originalItem.replies()).toHaveCount(1);
      await expect(originalItem.reply(0)).toContainText('Remote reply');
      await expect(app.annotations.itemByNote('Added remotely').locator()).toBeVisible();
      expect(await app.annotations.count()).toBe(2);
    });

    test('an annotation deleted in the incoming bundle is removed locally', async ({ app }) => {
      const modified = makeFullProject({
        project: original.project,
        audio: original.audio,
        annotations: original.annotations.map((a) => ({ ...a, deleted: true })),
        replies: [],
      });

      await app.importExport.importBundle({
        name: 'b.aaz',
        mimeType: 'application/zip',
        buffer: await buildValidBundle(modified, audioBytes),
      });

      await expect(app.importExport.message()).toContainText('Imported.');
      await expect(app.annotations.items()).toHaveCount(0);

      await app.page.reload();
      await app.waveform.waitUntilReady();
      await expect(app.page.getByText('No annotations yet.')).toBeVisible();
    });
  });
});
