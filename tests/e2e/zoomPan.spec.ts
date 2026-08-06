import { test, expect } from './fixtures/base';
import { makeWavFile } from './fixtures/wav';

test.describe('waveform zoom and pan', () => {
  test.beforeEach(async ({ app }) => {
    await app.ensureSession('Ava');
    await app.openAudioFixture(makeWavFile({ durationSec: 10 }));
    await app.waveform.waitUntilReady();
  });

  test('wheel zooms in, both-button drag pans, and double-click resets', async ({ app }) => {
    expect(await app.waveform.isZoomedIn()).toBe(false);

    await app.waveform.wheelZoom(-200, 20);
    expect(await app.waveform.isZoomedIn()).toBe(true);

    const before = await app.waveform.scrollLeft();
    await app.waveform.panBy(-150);
    expect(await app.waveform.scrollLeft()).toBeGreaterThan(before);

    await app.waveform.resetView();
    expect(await app.waveform.isZoomedIn()).toBe(false);
    expect(await app.waveform.scrollLeft()).toBe(0);
  });

  test('panning with both buttons does not create a region, unlike a single-button drag', async ({
    app,
  }) => {
    await app.waveform.wheelZoom(-200, 20);

    await app.waveform.panBy(-150);
    await expect(app.draftDialog.locator()).toBeHidden();

    await app.waveform.dragSelectRegion(0.1, 0.3);
    await expect(app.draftDialog.locator()).toBeVisible();
  });

  test('panning does not seek the playhead to the release position', async ({ app }) => {
    await app.waveform.wheelZoom(-200, 20);
    const before = await app.transport.currentSeconds();

    await app.waveform.panBy(-150);

    expect(await app.transport.currentSeconds()).toBeCloseTo(before, 1);
  });

  test('zooms relative to the current fit after the container is resized following a reset', async ({
    app,
    page,
  }) => {
    // Reset while narrow, so a zoom-level reference keyed off "fit-to-width" captures
    // this narrow width's fit value.
    await page.setViewportSize({ width: 380, height: 800 });
    await page.waitForTimeout(300);
    await app.waveform.wheelZoom(-200, 5);
    await app.waveform.resetView();
    expect(await app.waveform.isZoomedIn()).toBe(false);

    // Grow the container; wavesurfer's own debounced ResizeObserver re-renders at the
    // new, wider fit-to-width automatically, without any zoom()/reset() call from us.
    await page.setViewportSize({ width: 1400, height: 800 });
    await page.waitForTimeout(300);
    expect(await app.waveform.isZoomedIn()).toBe(false);

    // A single zoom-in step now should scale relative to the *current* (wide) fit, not
    // a value cached from before the resize — otherwise this lands far short of the
    // zoom level a wheel step of this size is supposed to reach.
    await app.waveform.wheelZoom(-700, 1);
    expect(await app.waveform.zoomRatio()).toBeGreaterThan(4);
  });
});
