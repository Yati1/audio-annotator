import type { Locator, Page } from '@playwright/test';

/** The in-app "Using the app" guide, opened from the header's Guide button. */
export class TutorialDialog {
  constructor(private readonly page: Page) {}

  private root() {
    return this.page.getByTestId('tutorial-dialog');
  }

  locator(): Locator {
    return this.root();
  }

  trigger(): Locator {
    return this.page.getByRole('button', { name: 'Guide' });
  }

  async open(): Promise<void> {
    await this.trigger().click();
    await this.root().waitFor();
  }

  section(heading: string): Locator {
    return this.root().getByRole('heading', { name: heading });
  }

  screenshots(): Locator {
    return this.root().locator('img');
  }

  async close(): Promise<void> {
    await this.root().getByRole('button', { name: 'Close' }).click();
  }

  async dismissWithEscape(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  /** Press and release on the panel-free area of the backdrop. */
  async clickBackdrop(): Promise<void> {
    // The backdrop fills the viewport behind the panel; a top-left click misses the panel.
    await this.page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } });
  }

  /** Drag from inside the panel and release out on the backdrop, as a text selection
   *  that overshoots the panel edge does. */
  async dragFromPanelOntoBackdrop(): Promise<void> {
    const box = await this.section('1. Set your display name').boundingBox();
    if (!box) throw new Error('Guide content is not laid out; cannot start a drag from it.');
    await this.page.mouse.move(box.x + 5, box.y + 5);
    await this.page.mouse.down();
    await this.page.mouse.move(5, 5, { steps: 5 });
    await this.page.mouse.up();
  }

  /** Drag from the backdrop and release inside the panel, as a text selection
   *  that starts just outside the panel edge does. */
  async dragFromBackdropOntoPanel(): Promise<void> {
    const box = await this.section('1. Set your display name').boundingBox();
    if (!box) throw new Error('Guide content is not laid out; cannot end a drag on it.');
    await this.page.mouse.move(5, 5);
    await this.page.mouse.down();
    await this.page.mouse.move(box.x + 5, box.y + 5, { steps: 5 });
    await this.page.mouse.up();
  }
}
