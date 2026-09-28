import { test, expect } from './fixtures/base';
import { makeWavFile } from './fixtures/wav';

test.describe('editing and deleting annotations', () => {
  test.beforeEach(async ({ app }) => {
    await app.ensureSession('Ava');
    await app.openAudioFixture(makeWavFile({ durationSec: 4 }));
    await app.transport.addPoint();
    await app.draftDialog.createWithNote('Original note');
  });

  test('edits a note, and the edit persists across reload (FR-008)', async ({ app }) => {
    // By id, not note text: the edit changes the text we'd filter on.
    const id = await app.annotations.itemByNote('Original note').id();
    if (!id) throw new Error('annotation has no id');
    const item = app.annotations.itemById(id);

    await item.editNote('Edited note');
    await expect(item.note()).toHaveText('Edited note');

    await app.page.reload();
    await app.waveform.waitUntilReady();
    await expect(app.annotations.itemById(id).note()).toHaveText('Edited note');
  });

  test('cancelling an edit keeps the original note', async ({ app }) => {
    // By id: while the editor is open the note is a textarea value, not text to filter on.
    const id = await app.annotations.itemByNote('Original note').id();
    if (!id) throw new Error('annotation has no id');
    const item = app.annotations.itemById(id);
    await item.editNoteAndCancel('Thrown away');

    await expect(item.note()).toHaveText('Original note');
  });

  // Known bug: Cancel hides the editor but keeps the discarded text as its draft, so it
  // comes back the next time the editor opens. Remove test.fail() once that is fixed.
  test('reopening the editor after a cancel shows the saved note, not the discarded one', async ({
    app,
  }) => {
    test.fail();
    const id = await app.annotations.itemByNote('Original note').id();
    if (!id) throw new Error('annotation has no id');
    const item = app.annotations.itemById(id);
    await item.editNoteAndCancel('Thrown away');

    const editor = await item.openEditor();
    await expect(editor).toHaveValue('Original note', { timeout: 2000 });
  });

  test('deletes after confirmation, and stays deleted after reload (FR-009)', async ({ app }) => {
    const message = app.acceptNextConfirm();
    await app.annotations.itemByNote('Original note').delete();

    expect(await message).toBe('Delete this annotation? This cannot be undone.');
    await expect(app.annotations.items()).toHaveCount(0);

    await app.page.reload();
    await app.waveform.waitUntilReady();
    await expect(app.page.getByText('No annotations yet.')).toBeVisible();
  });

  test('keeps the annotation when the confirmation is dismissed', async ({ app }) => {
    const message = app.dismissNextConfirm();
    await app.annotations.itemByNote('Original note').delete();
    await message;

    await expect(app.annotations.itemByNote('Original note').locator()).toBeVisible();
  });

  test('warns how many replies a delete will take with it (FR-023)', async ({ app }) => {
    const item = app.annotations.itemByNote('Original note');
    await item.addReply('First');
    await item.addReply('Second');
    await expect(item.replies()).toHaveCount(2);

    const message = app.dismissNextConfirm();
    await item.delete();

    expect(await message).toBe('Delete this annotation and its 2 replies? This cannot be undone.');
  });
});

test.describe('editing and deleting replies', () => {
  test.beforeEach(async ({ app }) => {
    await app.ensureSession('Ava');
    await app.openAudioFixture(makeWavFile({ durationSec: 4 }));
    await app.transport.addPoint();
    await app.draftDialog.createWithNote('Anchor annotation');
    const item = app.annotations.itemByNote('Anchor annotation');
    await item.addReply('Original reply');
    await expect(item.replies()).toHaveCount(1);
  });

  test('edits a reply, and the edit persists across reload (FR-015)', async ({ app }) => {
    const item = app.annotations.itemByNote('Anchor annotation');
    await item.editReply(0, 'Edited reply');
    await expect(item.reply(0)).toContainText('Edited reply');

    await app.page.reload();
    await app.waveform.waitUntilReady();
    const after = app.annotations.itemByNote('Anchor annotation');
    await expect(after.reply(0)).toContainText('Edited reply');
    await expect(after.reply(0)).not.toContainText('Original reply');
  });

  test('deletes a reply after confirmation, and it stays deleted after reload', async ({ app }) => {
    const item = app.annotations.itemByNote('Anchor annotation');
    const message = app.acceptNextConfirm();
    await item.deleteReply(0);

    expect(await message).toBe('Delete this reply?');
    await expect(item.replies()).toHaveCount(0);

    await app.page.reload();
    await app.waveform.waitUntilReady();
    await expect(app.annotations.itemByNote('Anchor annotation').replies()).toHaveCount(0);
  });

  test('keeps the reply when the confirmation is dismissed', async ({ app }) => {
    const item = app.annotations.itemByNote('Anchor annotation');
    const message = app.dismissNextConfirm();
    await item.deleteReply(0);
    await message;

    await expect(item.replies()).toHaveCount(1);
  });
});
