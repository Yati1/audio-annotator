import { test, expect } from './fixtures/base';
import { makeWavFile } from './fixtures/wav';

test.describe('in-app guide', () => {
  test('opens from the header and shows the walkthrough with its screenshots', async ({ app }) => {
    await app.ensureSession('Kay');
    await app.tutorial.open();

    await expect(app.tutorial.section('Using the app')).toBeVisible();
    await expect(app.tutorial.section('1. Set your display name')).toBeVisible();
    await expect(app.tutorial.section('6. Share your work')).toBeVisible();
    await expect(app.tutorial.section('Keyboard shortcuts')).toBeVisible();

    // Every screenshot must actually resolve — the files live outside src/ and are
    // pulled in as Vite assets, so a broken path would silently render nothing.
    const images = app.tutorial.screenshots();
    await expect(images).toHaveCount(7);
    for (const img of await images.all()) {
      await expect
        .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    }
  });

  test('closes via the Close button, Escape, and the backdrop', async ({ app }) => {
    await app.ensureSession('Kay');

    await app.tutorial.open();
    await app.tutorial.close();
    await expect(app.tutorial.locator()).toBeHidden();

    await app.tutorial.open();
    await app.tutorial.dismissWithEscape();
    await expect(app.tutorial.locator()).toBeHidden();

    await app.tutorial.open();
    await app.tutorial.clickBackdrop();
    await expect(app.tutorial.locator()).toBeHidden();
  });

  test('survives a text-selection drag that ends outside the panel', async ({ app }) => {
    await app.ensureSession('Kay');
    await app.tutorial.open();

    await app.tutorial.dragFromPanelOntoBackdrop();

    await expect(app.tutorial.locator()).toBeVisible();
  });

  test('survives a text-selection drag that starts outside the panel and ends inside it', async ({
    app,
  }) => {
    await app.ensureSession('Kay');
    await app.tutorial.open();

    await app.tutorial.dragFromBackdropOntoPanel();

    await expect(app.tutorial.locator()).toBeVisible();
  });

  test('returns focus to the Guide button on close', async ({ app }) => {
    await app.ensureSession('Kay');
    await app.tutorial.open();
    await app.tutorial.dismissWithEscape();

    await expect(app.tutorial.trigger()).toBeFocused();
  });

  test('suppresses the annotation shortcuts while it is open', async ({ app }) => {
    await app.ensureSession('Kay');
    await app.openAudioFixture(makeWavFile({ durationSec: 4 }));
    await app.tutorial.open();

    await app.page.keyboard.press('p');
    await expect(app.draftDialog.locator()).toBeHidden();
    await app.page.keyboard.press('r');
    await expect(app.draftDialog.locator()).toBeHidden();

    // …and they work again once it's dismissed.
    await app.tutorial.close();
    await app.page.keyboard.press('p');
    await expect(app.draftDialog.locator()).toBeVisible();
  });
});
