import { test, expect } from './fixtures/base';
import { makeWavFile } from './fixtures/wav';
import { makeFullProject, buildValidBundle } from './fixtures/bundle';
import { newId } from '../../src/lib/id';

test.describe('dragging and resizing on the waveform (FR-008)', () => {
  test.beforeEach(async ({ app }) => {
    await app.ensureSession('Ava');
    await app.openAudioFixture(makeWavFile({ durationSec: 10 }));
  });

  test('resizing the selected region saves its new end, and it persists', async ({ app }) => {
    await app.transport.startRegion();
    await app.draftDialog.createWithNote('Resize me');
    const item = app.annotations.itemByNote('Resize me');
    await expect(item.badge()).toContainText('0:00–0:05');
    const id = await item.id();
    if (!id) throw new Error('annotation has no id');

    // A new annotation is selected, so its handles are live.
    await app.waveform.dragTo(app.waveform.rightHandle(id), 0.85);

    await expect(item.badge()).toContainText('0:00–0:08');
    await app.page.reload();
    await app.waveform.waitUntilReady();
    await expect(app.annotations.itemByNote('Resize me').badge()).toContainText('0:00–0:08');
  });

  test('dragging the selected point moves it', async ({ app }) => {
    await app.waveform.seekToFraction(0.25);
    await app.transport.addPoint();
    await app.draftDialog.createWithNote('Move me');
    const item = app.annotations.itemByNote('Move me');
    await expect(item.badge()).toContainText('0:02');
    const id = await item.id();
    if (!id) throw new Error('annotation has no id');

    await app.waveform.dragTo(app.waveform.region(id), 0.65);

    await expect(item.badge()).toContainText('0:06');
    await expect(app.draftDialog.locator()).toBeHidden();
  });

  test('a pan that starts on the selected region leaves it in place', async ({ app }) => {
    await app.waveform.seekToFraction(0.35);
    await app.transport.startRegion();
    await app.draftDialog.createWithNote('Stay put');
    const item = app.annotations.itemByNote('Stay put');
    await expect(item.badge()).toContainText('0:03–0:08');

    const start = await item.startSec();

    await app.waveform.wheelZoom(-200, 1);
    await app.waveform.panBy(-400);

    // Exact seconds, not the badge: at this zoom a moved region can still round the same.
    expect(await item.startSec()).toBe(start);
    await expect(app.draftDialog.locator()).toBeHidden();
  });

  for (const releaseFirst of ['right', 'left'] as const) {
    test(`a pan that ends on one button, then moves, leaves the region in place (${releaseFirst} up first)`, async ({
      app,
    }) => {
      await app.waveform.seekToFraction(0.35);
      await app.transport.startRegion();
      await app.draftDialog.createWithNote('Stay put');
      const item = app.annotations.itemByNote('Stay put');
      await expect(item.badge()).toContainText('0:03–0:08');

      const start = await item.startSec();

      await app.waveform.wheelZoom(-200, 1);
      // The plugin still tracks the drag while one button is held, and would jump the region
      // by the whole pan if it saw this move.
      await app.waveform.panBy(-400, { releaseFirst, moveBetween: 20 });

      expect(await item.startSec()).toBe(start);
    });
  }

  test('a drag that turns into a pan snaps the region back', async ({ app }) => {
    await app.waveform.seekToFraction(0.35);
    await app.transport.startRegion();
    await app.draftDialog.createWithNote('Snap back');
    const item = app.annotations.itemByNote('Snap back');
    await expect(item.badge()).toContainText('0:03–0:08');

    const start = await item.startSec();

    await app.waveform.wheelZoom(-200, 1);
    // The region is already moving when the right button joins, so the pan must undo that.
    await app.waveform.panBy(-400, { dragFirst: 20, pauseBetween: 50 });

    expect(await item.startSec()).toBe(start);
  });

  test('saving a note in an open editor keeps a drag made meanwhile', async ({ app }) => {
    await app.transport.startRegion();
    await app.draftDialog.createWithNote('Drag while editing');
    const id = await app.annotations.itemByNote('Drag while editing').id();
    if (!id) throw new Error('annotation has no id');
    // By id: while the editor is open the note is in a textarea, which a text filter misses.
    const item = app.annotations.itemById(id);
    const editor = await item.openEditor();

    await app.waveform.dragTo(app.waveform.rightHandle(id), 0.85);
    await expect(item.badge()).toContainText('0:00–0:08');
    await editor.fill('Edited after the drag');
    await item.saveEditor();

    await expect(item.note()).toHaveText('Edited after the drag');
    await expect(item.badge()).toContainText('0:00–0:08');
  });

  test("someone else's region can't be dragged, even when selected", async ({ app }) => {
    const full = makeFullProject();
    const regionId = newId();
    const audioBytes = makeWavFile({ durationSec: 10 }).buffer;
    full.audio = { ...full.audio, durationSec: 10, byteSize: audioBytes.length };
    full.annotations = [
      {
        id: regionId,
        projectId: full.project.id,
        kind: 'region',
        startSec: 2,
        endSec: 4,
        note: "Ben's region",
        authorName: 'Ben',
        authorId: 'device-ben',
        authorColor: '#d95926',
        createdAt: full.project.createdAt,
        updatedAt: full.project.updatedAt,
      },
    ];
    app.acceptNextConfirm();
    await app.importExport.importBundle({
      name: 'from-ben.aaz',
      mimeType: 'application/zip',
      buffer: await buildValidBundle(full, audioBytes),
    });
    await app.waveform.waitUntilReady();
    const item = app.annotations.itemByNote("Ben's region");
    await item.select();

    await expect(app.waveform.rightHandle(regionId)).toHaveCount(0);
    await app.waveform.dragTo(app.waveform.region(regionId), 0.8);

    await expect(item.badge()).toContainText('0:02–0:04');
  });
});

test.describe('dragging to the very end of a track (FR-008)', () => {
  // 32005 samples at 8 kHz. Rounded to the millisecond, the end would be 4.001: past the track.
  const durationSec = 4.000625;

  test.beforeEach(async ({ app }) => {
    await app.ensureSession('Ava');
    await app.openAudioFixture(makeWavFile({ durationSec }));
  });

  test('resizing a region to the end saves the exact end', async ({ app }) => {
    await app.transport.startRegion();
    await app.draftDialog.createWithNote('To the end');
    const item = app.annotations.itemByNote('To the end');
    const id = await item.id();
    if (!id) throw new Error('annotation has no id');
    await app.waveform.dragTo(app.waveform.rightHandle(id), 0.5);
    await expect(item.badge()).toContainText('0:00–0:02');

    // Past the canvas, but still over the page, so the plugin clamps rather than cancels.
    await app.waveform.dragTo(app.waveform.rightHandle(id), 1.02);

    await expect(item.badge()).toContainText('0:00–0:04');
    expect(await item.endSec()).toBe(durationSec);
  });
});
