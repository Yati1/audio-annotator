import { test, expect } from './fixtures/base';
import { makeWavFile } from './fixtures/wav';
import {
  makeFullProject,
  buildBundleMissingAudio,
  buildBundleWithNewerSchema,
  corruptZipBytes,
} from './fixtures/bundle';

test.describe('errors', () => {
  test('rejects a region ending at or before its start (FR-010)', async ({ app }) => {
    await app.ensureSession('Ava');

    // A large fixture widens the gap between "audio metadata loaded" (fast, unlocks the
    // toolbar and the keyboard shortcuts) and "waveform finished decoding" (slower, sets
    // App's `duration` state). Pressing 'r' inside that gap computes start = end = 0 —
    // a genuinely invalid, zero-length region — without needing any numeric input field.
    const input = app.page.getByTestId('open-audio-input');
    await input.setInputFiles(makeWavFile({ durationSec: 900 }));
    await input.evaluate((el) => (el as HTMLInputElement).blur());
    await app.page.getByRole('toolbar', { name: 'Playback and annotation controls' }).waitFor();

    await app.page.keyboard.press('r');
    await app.draftDialog.fillNote('Invalid region attempt');
    await app.draftDialog.save();

    await expect(app.errorAlert).toContainText('End time must be after the start time.');
    expect(await app.annotations.count()).toBe(0);
  });

  test('shows an error for a corrupt zip and leaves existing data untouched (FR-026)', async ({
    app,
  }) => {
    await app.ensureSession('Ava');
    await app.openAudioFixture(makeWavFile({ durationSec: 2 }));
    await app.transport.addPoint();
    await app.draftDialog.createWithNote('Existing annotation');

    await app.importExport.importBundle({
      name: 'broken.aaz',
      mimeType: 'application/zip',
      buffer: corruptZipBytes(),
    });

    await expect(app.errorAlert).toContainText('not a valid zip');
    expect(await app.annotations.count()).toBe(1);
    await expect(app.annotations.itemByNote('Existing annotation').locator()).toBeVisible();
  });

  test('shows an error for a bundle missing its audio file', async ({ app }) => {
    await app.ensureSession('Ava');
    const full = makeFullProject();

    await app.importExport.importBundle({
      name: 'no-audio.aaz',
      mimeType: 'application/zip',
      buffer: buildBundleMissingAudio(full),
    });

    await expect(app.errorAlert).toContainText('missing its audio file');
  });

  test('shows an error for a bundle with a newer schema version', async ({ app }) => {
    await app.ensureSession('Ava');
    const full = makeFullProject();
    const audioBytes = makeWavFile({ durationSec: 2 }).buffer;

    await app.importExport.importBundle({
      name: 'newer-schema.aaz',
      mimeType: 'application/zip',
      buffer: buildBundleWithNewerSchema(full, audioBytes),
    });

    await expect(app.errorAlert).toContainText('newer app version');
  });

  test('rejects an unsupported audio format and keeps the open project (FR-030)', async ({
    app,
  }) => {
    await app.ensureSession('Ava');
    await app.openAudioFixture(makeWavFile({ durationSec: 2 }));
    await app.transport.addPoint();
    await app.draftDialog.createWithNote('Existing annotation');

    await app.page.getByTestId('open-audio-input').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not audio'),
    });

    await expect(app.errorAlert).toContainText(
      'Unsupported audio format. Use MP3, WAV, OGG, M4A, or FLAC.',
    );
    await expect(app.annotations.itemByNote('Existing annotation').locator()).toBeVisible();
  });

  test('shows an error for an audio file the browser cannot decode, and keeps the open project', async ({
    app,
  }) => {
    await app.ensureSession('Ava');
    await app.openAudioFixture(makeWavFile({ durationSec: 2 }));
    await app.transport.addPoint();
    await app.draftDialog.createWithNote('Existing annotation');

    // The .wav name passes the format check; only decoding can catch the bad bytes.
    await app.page.getByTestId('open-audio-input').setInputFiles({
      name: 'broken.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.from('these bytes are not a wav file'),
    });

    await expect(app.errorAlert).toContainText('Could not read this audio file.');
    await expect(app.annotations.itemByNote('Existing annotation').locator()).toBeVisible();

    await app.page.reload();
    await app.waveform.waitUntilReady();
    await expect(app.annotations.itemByNote('Existing annotation').locator()).toBeVisible();
  });

  test('dismisses the error banner', async ({ app }) => {
    await app.ensureSession('Ava');
    await app.page.getByTestId('open-audio-input').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not audio'),
    });
    await expect(app.errorAlert).toBeVisible();

    await app.errorAlert.getByRole('button', { name: 'Dismiss error' }).click();

    await expect(app.errorAlert).toBeHidden();
  });
});
