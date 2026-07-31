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
    await this.root.getByRole('button', { name: 'Play this annotation' }).click();
  }

  async select(): Promise<void> {
    await this.root.getByRole('button', { name: /Select (point|region)/ }).click();
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
}
