import { test as base, expect } from '@playwright/test';
import { AppPage } from '../pages/AppPage';

/** Adds an `app` fixture that navigates to the app root and wires up the page objects.
 *  Deliberately does not auto-dismiss the display-name prompt or auto-open audio — specs
 *  that need a fully-loaded session call `app.ensureSession()`/`app.openAudioFixture()`
 *  explicitly, since some specs (errors, roundtrip) need to control that sequence. */
export const test = base.extend<{ app: AppPage }>({
  app: async ({ page }, use) => {
    await page.goto('/');
    await use(new AppPage(page));
  },
});

export { expect };
