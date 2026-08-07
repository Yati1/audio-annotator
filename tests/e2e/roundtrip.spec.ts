import fs from 'node:fs/promises';
import { test, expect } from './fixtures/base';
import { AppPage } from './pages/AppPage';
import { makeWavFile } from './fixtures/wav';
import { makeFullProject, buildValidBundle } from './fixtures/bundle';
import { newId } from '../../src/lib/id';
import { SCHEMA_VERSION } from '../../src/features/types';

test.describe('roundtrip', () => {
  test('exports a bundle and restores it in a fresh browser context', async ({ app, browser }) => {
    await app.ensureSession('Ava');
    await app.openAudioFixture(makeWavFile({ durationSec: 4 }));
    await app.transport.addPoint();
    await app.draftDialog.createWithNote('Exported point');
    const exportedItem = app.annotations.itemByNote('Exported point');
    await exportedItem.addReply('Exported reply');
    // Reply submission is fire-and-forget from the UI's perspective; wait for it to render
    // before exporting so the store's in-memory state (what exportBundle reads) reflects it.
    await expect(exportedItem.replies()).toHaveCount(1);

    const download = await app.importExport.exportBundle();
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

      const restored = freshApp.annotations.itemByNote('Exported point');
      await expect(restored.locator()).toBeVisible();
      await expect(restored.replies()).toHaveCount(1);
      await expect(restored.replies().first()).toContainText('Exported reply');
    } finally {
      await freshContext.close();
    }
  });

  test('re-importing a modified bundle merges new items by id, keeping originals (Scenario D)', async ({
    app,
  }) => {
    await app.ensureSession('Ava');

    const projectId = newId();
    const audioId = newId();
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
          id: newId(),
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
    const bundleA = await buildValidBundle(original, audioBytes);

    await app.importExport.importBundle({
      name: 'a.aaz',
      mimeType: 'application/zip',
      buffer: bundleA,
    });
    await expect(app.annotations.itemByNote('Original note').locator()).toBeVisible();

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
      replies: [],
    });
    const bundleB = await buildValidBundle(modified, audioBytes);

    await app.importExport.importBundle({
      name: 'b.aaz',
      mimeType: 'application/zip',
      buffer: bundleB,
    });

    await expect(app.importExport.message()).toContainText('1 new item');
    await expect(app.annotations.itemByNote('Original note').locator()).toBeVisible();
    await expect(app.annotations.itemByNote('Added remotely').locator()).toBeVisible();
    expect(await app.annotations.count()).toBe(2);
  });
});
