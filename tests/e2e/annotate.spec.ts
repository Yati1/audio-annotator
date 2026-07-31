import { test, expect } from './fixtures/base';
import { makeWavFile } from './fixtures/wav';

test.describe('annotate', () => {
  test.beforeEach(async ({ app }) => {
    await app.ensureSession('Ava');
    await app.openAudioFixture(makeWavFile({ durationSec: 4 }));
  });

  test('creates a point annotation via the + Point button', async ({ app }) => {
    await app.transport.addPoint();
    await app.draftDialog.createWithNote('Point via button');

    await expect(app.annotations.itemByNote('Point via button').locator()).toBeVisible();
    expect(await app.annotations.count()).toBe(1);
  });

  test('creates a point annotation via the p key', async ({ app }) => {
    await app.page.keyboard.press('p');
    await app.draftDialog.createWithNote('Point via key');

    await expect(app.annotations.itemByNote('Point via key').locator()).toBeVisible();
  });

  test('creates a region annotation via the + Region button', async ({ app }) => {
    await app.transport.startRegion();
    await app.draftDialog.createWithNote('Region via button');

    await expect(app.annotations.itemByNote('Region via button').locator()).toBeVisible();
  });

  test('creates a region annotation via drag-select on the waveform', async ({ app }) => {
    await app.waveform.dragSelectRegion(0.2, 0.6);
    await expect(app.draftDialog.locator()).toBeVisible();

    await app.draftDialog.createWithNote('Region via drag');

    await expect(app.annotations.itemByNote('Region via drag').locator()).toBeVisible();
  });

  test('region playback stops at the end of the region (FR-003)', async ({ app }) => {
    // Fixture is 4s; + Region at playhead 0 creates a start=0..end=min(0+5,4)=4 region.
    await app.transport.startRegion();
    await app.draftDialog.createWithNote('Bounded region');

    await app.annotations.itemByNote('Bounded region').play();
    await expect.poll(() => app.transport.isPlaying()).toBe(true);
    await expect.poll(() => app.transport.isPlaying(), { timeout: 10_000 }).toBe(false);

    const current = await app.transport.currentSeconds();
    expect(current).toBeGreaterThanOrEqual(3.5);
    expect(current).toBeLessThanOrEqual(4);
  });

  test('annotations persist across reload', async ({ app }) => {
    await app.transport.addPoint();
    await app.draftDialog.createWithNote('Reload me');
    const before = await app.annotations.itemByNote('Reload me').id();

    await app.page.reload();
    await app.waveform.waitUntilReady();

    const after = app.annotations.itemByNote('Reload me');
    await expect(after.locator()).toBeVisible();
    expect(await after.id()).toBe(before);
  });
});
