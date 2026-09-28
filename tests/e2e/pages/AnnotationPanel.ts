import type { Locator, Page } from '@playwright/test';

export class AnnotationPanel {
  constructor(private readonly page: Page) {}

  list(): Locator {
    return this.page.getByTestId('annotation-list');
  }

  items(): Locator {
    return this.list().getByTestId('annotation-item');
  }

  async count(): Promise<number> {
    return this.items().count();
  }

  /** Locates the (assumed unique) annotation item containing the given note text. */
  itemByNote(note: string): AnnotationItemHandle {
    return new AnnotationItemHandle(this.items().filter({ hasText: note }));
  }

  /** Locates an annotation item by its stable id, which survives note edits. */
  itemById(id: string): AnnotationItemHandle {
    return new AnnotationItemHandle(this.list().locator(`[data-annotation-id="${id}"]`));
  }

  itemAt(index: number): AnnotationItemHandle {
    return new AnnotationItemHandle(this.items().nth(index));
  }
}

export class AnnotationItemHandle {
  constructor(private readonly root: Locator) {}

  locator(): Locator {
    return this.root;
  }

  async id(): Promise<string | null> {
    return this.root.getAttribute('data-annotation-id');
  }

  async play(): Promise<void> {
    await this.playButton().click();
  }

  async stop(): Promise<void> {
    await this.stopButton().click();
  }

  playButton(): Locator {
    return this.root.getByRole('button', { name: 'Play this annotation' });
  }

  stopButton(): Locator {
    return this.root.getByRole('button', { name: 'Stop this annotation' });
  }

  async select(): Promise<void> {
    await this.root.getByRole('button', { name: /Select (point|region)/ }).click();
  }

  note(): Locator {
    return this.root.locator('.annotation-note');
  }

  /** Opens the inline editor, replaces the note, and saves. */
  async editNote(note: string): Promise<void> {
    await this.root.getByRole('button', { name: 'Edit note' }).click();
    await this.root.locator('.annotation-edit textarea').fill(note);
    await this.root.locator('.annotation-edit').getByRole('button', { name: 'Save' }).click();
  }

  /** Opens the inline editor, types a note, then cancels. */
  async editNoteAndCancel(note: string): Promise<void> {
    await this.root.getByRole('button', { name: 'Edit note' }).click();
    await this.root.locator('.annotation-edit textarea').fill(note);
    await this.root.locator('.annotation-edit').getByRole('button', { name: 'Cancel' }).click();
  }

  /** Clicks Delete. Arm a confirm handler on the page first (see AppPage). */
  async delete(): Promise<void> {
    await this.root.getByRole('button', { name: 'Delete annotation' }).click();
  }

  async addReply(text: string): Promise<void> {
    await this.root.getByRole('textbox', { name: 'Add a reply' }).fill(text);
    await this.root.getByRole('button', { name: 'Reply', exact: true }).click();
  }

  replies(): Locator {
    return this.root.getByTestId('reply-item');
  }

  reply(index: number): Locator {
    return this.replies().nth(index);
  }

  async editReply(index: number, text: string): Promise<void> {
    const reply = this.reply(index);
    await reply.getByRole('button', { name: 'Edit reply' }).click();
    await reply.locator('.reply-edit input').fill(text);
    await reply.getByRole('button', { name: 'Save' }).click();
  }

  /** Clicks Delete on a reply. Arm a confirm handler on the page first (see AppPage). */
  async deleteReply(index: number): Promise<void> {
    await this.reply(index).getByRole('button', { name: 'Delete reply' }).click();
  }
}
