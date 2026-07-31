import { test, expect } from './fixtures/base';
import { makeWavFile } from './fixtures/wav';

test.describe('replies', () => {
  test.beforeEach(async ({ app }) => {
    await app.ensureSession('Ava');
    await app.openAudioFixture(makeWavFile({ durationSec: 4 }));
    await app.transport.addPoint();
    await app.draftDialog.createWithNote('Anchor annotation');
  });

  test('adds replies in chronological order with author and time', async ({ app }) => {
    const item = app.annotations.itemByNote('Anchor annotation');
    await item.addReply('First reply');
    await item.addReply('Second reply');

    const replies = item.replies();
    await expect(replies).toHaveCount(2);
    await expect(replies.nth(0)).toContainText('First reply');
    await expect(replies.nth(1)).toContainText('Second reply');
    await expect(replies.nth(0)).toContainText('Ava');
  });

  test('replies persist across reload', async ({ app }) => {
    const item = app.annotations.itemByNote('Anchor annotation');
    await item.addReply('Persisted reply');
    // Reply submission is fire-and-forget from the UI's perspective (store.addReply isn't
    // awaited by the click handler); wait for it to render before reloading so the
    // underlying IndexedDB write (awaited inside the store action) has actually completed.
    await expect(item.replies()).toHaveCount(1);

    await app.page.reload();
    await app.waveform.waitUntilReady();

    const after = app.annotations.itemByNote('Anchor annotation');
    await expect(after.replies()).toHaveCount(1);
    await expect(after.replies().first()).toContainText('Persisted reply');
  });
});
