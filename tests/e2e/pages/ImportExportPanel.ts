import type { Download, Locator, Page } from '@playwright/test';

export class ImportExportPanel {
  constructor(private readonly page: Page) {}

  message(): Locator {
    return this.page.getByTestId('io-message');
  }

  async exportBundle(): Promise<Download> {
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.page.getByRole('button', { name: 'Export bundle' }).click(),
    ]);
    return download;
  }

  async importBundle(file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
    await this.page.getByTestId('import-bundle-input').setInputFiles(file);
  }
}
