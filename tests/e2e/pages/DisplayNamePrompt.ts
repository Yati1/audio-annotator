import { expect, type Locator, type Page } from '@playwright/test';

export class DisplayNamePrompt {
  constructor(private readonly page: Page) {}

  private root() {
    return this.page.getByRole('dialog', { name: 'Choose a display name' });
  }

  locator(): Locator {
    return this.root();
  }

  async submit(name: string): Promise<void> {
    await this.page.locator('#dn-input').fill(name);
    await this.page.getByRole('button', { name: 'Continue' }).click();
    await expect(this.root()).toBeHidden();
  }
}
