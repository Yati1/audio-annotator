import { test, expect } from './fixtures/base';
import { makeWavFile } from './fixtures/wav';

test.describe('new project', () => {
  test.beforeEach(async ({ app }) => {
    await app.ensureSession('Ava');
    await app.openAudioFixture(makeWavFile({ durationSec: 4 }));
    await app.transport.addPoint();
    await app.draftDialog.createWithNote('Keep me?');
  });

  test('clears the workspace and does not come back after reload', async ({ app }) => {
    app.acceptNextConfirm();
    await app.newProjectButton().click();

    await expect(app.emptyState()).toBeVisible();
    await expect(app.waveform.canvas()).not.toBeVisible();
    expect(await app.annotations.count()).toBe(0);

    await app.page.reload();
    await expect(app.emptyState()).toBeVisible();
    await expect(app.waveform.canvas()).not.toBeVisible();
  });

  test('does nothing when the confirmation is dismissed', async ({ app }) => {
    app.dismissNextConfirm();
    await app.newProjectButton().click();

    await expect(app.annotations.itemByNote('Keep me?').locator()).toBeVisible();
  });
});
