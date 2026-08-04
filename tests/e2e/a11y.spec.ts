import { test, expect } from './fixtures/base';
import { makeWavFile } from './fixtures/wav';
import { tabUntilFocused } from './fixtures/keyboard';

test.describe('accessibility (keyboard-only)', () => {
  test('completes the display-name prompt via keyboard only', async ({ app }) => {
    // #dn-input is autoFocus'd on mount, so no pointer interaction is needed to reach it —
    // but wait for it to actually mount before typing (goto() resolves before React does).
    await app.page.locator('#dn-input').waitFor();
    await app.page.keyboard.type('Kay');
    await app.page.keyboard.press('Enter');

    await expect(app.displayNamePrompt.locator()).toBeHidden();
  });

  test('toggles play/pause via the Space shortcut, keyboard only', async ({ app }) => {
    await app.ensureSession('Kay');
    await app.openAudioFixture(makeWavFile({ durationSec: 4 }));

    await app.page.keyboard.press('Space');
    await expect.poll(() => app.transport.isPlaying()).toBe(true);
    await app.page.keyboard.press('Space');
    await expect.poll(() => app.transport.isPlaying()).toBe(false);
  });

  test('creates a point annotation via the p shortcut, keyboard only', async ({ app }) => {
    await app.ensureSession('Kay');
    await app.openAudioFixture(makeWavFile({ durationSec: 4 }));

    await app.page.keyboard.press('p');
    await expect(app.draftDialog.locator()).toBeVisible();
    // The note textarea is autoFocus'd, so typing lands there without extra Tabbing.
    await app.page.keyboard.type('Point via keyboard');
    await tabUntilFocused(app.page, app.page.getByRole('button', { name: 'Save' }));
    await app.page.keyboard.press('Enter');

    await expect(app.annotations.itemByNote('Point via keyboard').locator()).toBeVisible();
  });

  test('creates a region annotation via the r shortcut, keyboard only', async ({ app }) => {
    await app.ensureSession('Kay');
    await app.openAudioFixture(makeWavFile({ durationSec: 4 }));

    await app.page.keyboard.press('r');
    await expect(app.draftDialog.locator()).toBeVisible();
    await app.page.keyboard.type('Region via keyboard');
    await tabUntilFocused(app.page, app.page.getByRole('button', { name: 'Save' }));
    await app.page.keyboard.press('Enter');

    await expect(app.annotations.itemByNote('Region via keyboard').locator()).toBeVisible();
  });

  test('changes the display name via keyboard only', async ({ app }) => {
    await app.ensureSession('Kay');
    await app.openAudioFixture(makeWavFile({ durationSec: 4 }));

    await tabUntilFocused(app.page, app.page.getByRole('button', { name: 'Change name' }));
    await app.page.keyboard.press('Enter');

    // #edn-input is autoFocus'd on mount; select-all before typing to replace the prefilled value.
    await app.page.locator('#edn-input').waitFor();
    await app.page.keyboard.press('ControlOrMeta+a');
    await app.page.keyboard.type('Kay Summers');
    await app.page.keyboard.press('Enter');

    await expect(app.displayNameControl.label()).toContainText('Kay Summers');
  });
});
