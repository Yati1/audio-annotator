import { test, expect } from './fixtures/base';
import { makeWavFile } from './fixtures/wav';

test.describe('changing your display name', () => {
  test.beforeEach(async ({ app }) => {
    await app.ensureSession('Ava');
    await app.openAudioFixture(makeWavFile({ durationSec: 4 }));
  });

  test('updates the header label and future annotations', async ({ app }) => {
    await expect(app.displayNameControl.label()).toContainText('Ava');

    await app.displayNameControl.rename('Ava Chen');
    await expect(app.displayNameControl.label()).toContainText('Ava Chen');

    await app.transport.addPoint();
    await app.draftDialog.createWithNote('After rename');
    const item = app.annotations.itemByNote('After rename');
    await expect(item.locator()).toContainText('Ava Chen');
  });

  test('retroactively relabels my own past annotations and replies, and persists', async ({
    app,
  }) => {
    await app.transport.addPoint();
    await app.draftDialog.createWithNote('Before rename');
    const item = app.annotations.itemByNote('Before rename');
    await item.addReply('An early reply');
    await expect(item.replies()).toHaveCount(1);

    await app.displayNameControl.rename('Ava Chen');

    await expect(item.locator()).toContainText('Ava Chen');
    await expect(item.replies().first()).toContainText('Ava Chen');

    await app.page.reload();
    await app.waveform.waitUntilReady();

    const after = app.annotations.itemByNote('Before rename');
    await expect(after.locator()).toContainText('Ava Chen');
    await expect(after.replies().first()).toContainText('Ava Chen');
  });
});
