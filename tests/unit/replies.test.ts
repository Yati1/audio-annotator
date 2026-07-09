import { describe, it, expect, beforeEach } from 'vitest';
import { storage, _resetDbForTests } from '../../src/features/storage/storage';
import { replyService } from '../../src/features/replies/replies';

describe('reply service', () => {
  it('creates a valid reply', () => {
    const r = replyService.add({
      annotationId: 'a1',
      text: 'hello',
      authorName: 'Sam',
    });
    expect(r.ok).toBe(true);
  });

  it('rejects empty text', () => {
    const r = replyService.add({ annotationId: 'a1', text: '  ', authorName: 'Sam' });
    expect(r.ok).toBe(false);
  });

  it('soft-deletes without removing', () => {
    const r = replyService.add({ annotationId: 'a1', text: 'x', authorName: 'Sam' });
    if (!r.ok) throw new Error('failed');
    const deleted = replyService.remove(r.value);
    expect(deleted.deleted).toBe(true);
    expect(deleted.id).toBe(r.value.id);
  });

  it('ordered excludes tombstones and sorts chronologically', () => {
    const r1 = replyService.add({ annotationId: 'a1', text: 'first', authorName: 'A' });
    const r2 = replyService.add({ annotationId: 'a1', text: 'second', authorName: 'B' });
    if (!r1.ok || !r2.ok) throw new Error('failed');
    // r2-deleted is the tombstoned version — its id matches r2, so only r1 and r2 (non-deleted) survive.
    const r2Deleted = replyService.remove(r2.value);
    const ordered = replyService.ordered([r2Deleted, r1.value]);
    expect(ordered).toHaveLength(1);
    expect(ordered[0].text).toBe('first');
  });
});

describe('reply persistence', () => {
  beforeEach(() => {
    _resetDbForTests();
  });

  it('persists and reloads replies in order', async () => {
    await storage.init();
    const r1 = replyService.add({ annotationId: 'a1', text: 'first', authorName: 'A' });
    const r2 = replyService.add({ annotationId: 'a1', text: 'second', authorName: 'B' });
    if (!r1.ok || !r2.ok) throw new Error('failed');
    await storage.putReplies([r1.value, r2.value]);
    const loaded = await storage.listReplies('a1');
    expect(loaded).toHaveLength(2);
    expect(loaded[0].createdAt <= loaded[1].createdAt).toBe(true);
  });
});
