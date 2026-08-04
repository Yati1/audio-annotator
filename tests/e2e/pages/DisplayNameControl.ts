import { expect, type Locator, type Page } from '@playwright/test';

export class DisplayNameControl {
  constructor(private readonly page: Page) {}

  private dialog() {
    return this.page.getByRole('dialog', { name: 'Change your display name' });
  }

  label(): Locator {
    return this.page.getByTestId('display-name-label');
  }

  async rename(name: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Change name' }).click();
    await this.page.locator('#edn-input').fill(name);
    await this.dialog().getByRole('button', { name: 'Save' }).click();
    await expect(this.dialog()).toBeHidden();
  }
}
