import type { Locator, Page } from '@playwright/test';

/** Presses Tab until `target` has focus, for keyboard-only navigation tests. */
export async function tabUntilFocused(page: Page, target: Locator, max = 30): Promise<void> {
  for (let i = 0; i < max; i++) {
    const focused = await target.evaluate((el) => el === document.activeElement).catch(() => false);
    if (focused) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Target element not reached via Tab within max presses');
}
