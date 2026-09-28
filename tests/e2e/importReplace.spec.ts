import fs from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { makeWavFile } from './fixtures/wav';
import { makeFullProject, buildValidBundle } from './fixtures/bundle';
import { newId } from '../../src/lib/id';

/** A bundle for a project this browser has never seen, holding one of Ben's points. */
async function otherProjectBundle() {
  const full = makeFullProject();
  full.audio = { ...full.audio, durationSec: 2, byteSize: makeWavFile().buffer.length };
  full.annotations = [
    {
      id: newId(),
      projectId: full.project.id,
      kind: 'point',
      startSec: 1,
      endSec: null,
      note: "Ben's point",
      authorName: 'Ben',
      authorId: 'device-ben',
      authorColor: '#d95926',
      createdAt: full.project.createdAt,
      updatedAt: full.project.updatedAt,
    },
  ];
  return {
    name: 'from-ben.aaz',
    mimeType: 'application/zip',
    buffer: await buildValidBundle(full, makeWavFile().buffer),
  };
}

/** Number of projects stored in this browser's IndexedDB. */
function storedProjectCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('audio-annotator');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('projects').objectStore('projects').count();
          req.onsuccess = () => {
            open.result.close();
            resolve(req.result);
          };
        };
      }),
  );
}

test.describe('importing a bundle over a different open project (FR-023)', () => {
  test.beforeEach(async ({ app }) => {
    await app.ensureSession('Ava');
    await app.openAudioFixture(makeWavFile({ name: 'my-clip.wav', durationSec: 4 }));
    await app.transport.addPoint();
    await app.draftDialog.createWithNote('Local work');
  });

  test('warns first, then replaces the project and deletes the old one', async ({ app }) => {
    const message = app.acceptNextConfirm();
    await app.importExport.importBundle(await otherProjectBundle());

    expect(await message).toContain('replace "my-clip"');
    await expect(app.annotations.itemByNote("Ben's point").locator()).toBeVisible();
    await expect(app.annotations.itemByNote('Local work').locator()).toHaveCount(0);
    expect(await storedProjectCount(app.page)).toBe(1);

    await app.page.reload();
    await app.waveform.waitUntilReady();
    await expect(app.annotations.itemByNote("Ben's point").locator()).toBeVisible();
  });

  test('changes nothing when the warning is dismissed', async ({ app }) => {
    const message = app.dismissNextConfirm();
    await app.importExport.importBundle(await otherProjectBundle());
    await message;

    await expect(app.annotations.itemByNote('Local work').locator()).toBeVisible();
    await expect(app.annotations.itemByNote("Ben's point").locator()).toHaveCount(0);
    await expect(app.importExport.message()).toHaveCount(0);
    expect(await storedProjectCount(app.page)).toBe(1);
  });

  test('does not warn when re-importing the same project', async ({ app }) => {
    const download = await app.importExport.exportBundle();
    const path = await download.path();
    if (!path) throw new Error('download did not complete');
    const bytes = await fs.readFile(path);

    let prompted = false;
    app.page.on('dialog', (d) => {
      prompted = true;
      void d.dismiss();
    });
    await app.importExport.importBundle({
      name: 'mine.aaz',
      mimeType: 'application/zip',
      buffer: bytes,
    });

    await expect(app.importExport.message()).toContainText('Imported.');
    expect(prompted).toBe(false);
    await expect(app.annotations.itemByNote('Local work').locator()).toBeVisible();
  });
});
