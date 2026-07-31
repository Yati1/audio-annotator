import type { Locator, Page } from '@playwright/test';

/** The inline note-entry dialog used to create both point and region annotations. */
export class DraftDialog {
  constructor(private readonly page: Page) {}

  private root() {
    return this.page.getByTestId('draft-dialog');
  }

  locator(): Locator {
    return this.root();
  }

  async fillNote(note: string): Promise<void> {
    await this.root().getByTestId('draft-note-textarea').fill(note);
  }

  async save(): Promise<void> {
    await this.root().getByRole('button', { name: 'Save' }).click();
  }

  async cancel(): Promise<void> {
    await this.root().getByRole('button', { name: 'Cancel' }).click();
  }

  async createWithNote(note: string): Promise<void> {
    await this.fillNote(note);
    await this.save();
  }
}
