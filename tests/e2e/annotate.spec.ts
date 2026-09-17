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

  test('keeps the selection box visible on the waveform while its comment is typed', async ({
    app,
  }) => {
    await app.waveform.dragSelectRegion(0.2, 0.6);
    const draftBox = app.waveform.canvas().locator('[part~="draft-region"]');
    await expect(draftBox).toBeVisible();

    await app.draftDialog.fillNote('Typing a note…');
    await expect(draftBox).toBeVisible();

    await app.draftDialog.save();
    await expect(draftBox).not.toBeVisible();
  });

  test('discards an in-progress draft when a new audio file is opened', async ({ app }) => {
    await app.waveform.dragSelectRegion(0.2, 0.6);
    await expect(app.draftDialog.locator()).toBeVisible();

    await app.openAudioFixture(makeWavFile({ durationSec: 4 }));

    await expect(app.draftDialog.locator()).not.toBeVisible();
    await expect(app.waveform.canvas().locator('[part~="draft-region"]')).not.toBeVisible();
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

  test('an annotation stop button reverts to play at the end of the track', async ({ app }) => {
    // Fixture is 4s; a point near the end lets playback reach 'finish' quickly.
    await app.waveform.seekToFraction(0.9);
    await app.transport.addPoint();
    await app.draftDialog.createWithNote('Ends with the track');
    const item = app.annotations.itemByNote('Ends with the track');

    await item.play();
    await expect(item.stopButton()).toBeVisible();

    await expect.poll(() => app.transport.isPlaying(), { timeout: 10_000 }).toBe(false);

    await expect(item.playButton()).toBeVisible();
    await expect(item.stopButton()).toHaveCount(0);
  });

  test.describe('annotation play/stop toggle', () => {
    // A longer clip than the outer fixture's 4s: these tests interrupt playback partway
    // through, so the audio has to outlast the interaction.
    test.beforeEach(async ({ app }) => {
      await app.openAudioFixture(makeWavFile({ name: 'clip-long.wav', durationSec: 30 }));
    });

    test('a playing annotation shows stop, and stopping pauses in place', async ({ app }) => {
      await app.transport.startRegion();
      await app.draftDialog.createWithNote('Stop me');
      const item = app.annotations.itemByNote('Stop me');

      await item.play();
      await expect(item.stopButton()).toBeVisible();
      await expect(item.playButton()).toHaveCount(0);

      // The transport clock has 1s granularity, so let it advance past a whole second —
      // that's what makes "paused in place" distinguishable from "rewound to the start".
      await expect.poll(() => app.transport.currentSeconds()).toBeGreaterThanOrEqual(1);
      await item.stop();

      await expect(item.playButton()).toBeVisible();
      await expect(item.stopButton()).toHaveCount(0);
      await expect.poll(() => app.transport.isPlaying()).toBe(false);
      expect(await app.transport.currentSeconds()).toBeGreaterThanOrEqual(1);
    });

    test('stop reverts to play when playback is paused from the transport', async ({ app }) => {
      await app.transport.startRegion();
      await app.draftDialog.createWithNote('Paused elsewhere');
      const item = app.annotations.itemByNote('Paused elsewhere');

      await item.play();
      await expect(item.stopButton()).toBeVisible();

      await app.transport.playPause();

      await expect(item.playButton()).toBeVisible();
      await expect(item.stopButton()).toHaveCount(0);
    });

    test('playing a second annotation moves the stop button to it', async ({ app }) => {
      await app.transport.startRegion();
      await app.draftDialog.createWithNote('First');
      await app.transport.addPoint();
      await app.draftDialog.createWithNote('Second');
      const first = app.annotations.itemByNote('First');
      const second = app.annotations.itemByNote('Second');

      await first.play();
      await expect(first.stopButton()).toBeVisible();

      await second.play();
      await expect(second.stopButton()).toBeVisible();
      await expect(first.playButton()).toBeVisible();
    });

    test('a point annotation plays from its timestamp (not just seeks)', async ({ app }) => {
      // Create the point mid-clip, then seek back to the start — if playFrom ignored
      // the timestamp and just called play(), playback would resume from 0, not ~15s.
      await app.waveform.seekToFraction(0.5);
      await app.transport.addPoint();
      await app.draftDialog.createWithNote('Point plays');
      await app.waveform.seekToFraction(0);
      const item = app.annotations.itemByNote('Point plays');

      await item.play();

      await expect.poll(() => app.transport.isPlaying()).toBe(true);
      await expect(item.stopButton()).toBeVisible();
      expect(await app.transport.currentSeconds()).toBeGreaterThanOrEqual(14);
    });

    test('switching audio files while an annotation plays clears the stale playing state', async ({
      app,
    }) => {
      await app.transport.startRegion();
      await app.draftDialog.createWithNote('Stop me');
      const item = app.annotations.itemByNote('Stop me');

      await item.play();
      await expect(item.stopButton()).toBeVisible();
      await expect.poll(() => app.transport.isPlaying()).toBe(true);

      await app.openAudioFixture(makeWavFile({ name: 'clip-other.wav', durationSec: 5 }));

      await expect.poll(() => app.transport.isPlaying()).toBe(false);
      expect(await app.annotations.count()).toBe(0);
    });
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
