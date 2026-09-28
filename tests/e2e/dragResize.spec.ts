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
