import { describe, it, expect, beforeEach } from 'vitest';
import { storage, _resetDbForTests } from '../../src/features/storage/storage';
import { replyService } from '../../src/features/replies/replies';
import { nowIso } from '../../src/lib/time';
import type { Project, AudioRecord } from '../../src/features/types';
import { SCHEMA_VERSION } from '../../src/features/types';

describe('reply storage persistence', () => {
  beforeEach(() => {
    _resetDbForTests();
  });

  it('persists replies and loads them by annotationId', async () => {
    await storage.init();
    const now = nowIso();
    const project: Project = {
      id: 'p1',
      title: 'T',
      audioId: 'a1',
      schemaVersion: SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    };
    const audio: AudioRecord = {
      id: 'a1',
      fileName: 'test.mp3',
      mimeType: 'audio/mpeg',
      durationSec: 60,
      byteSize: 512,
      blob: new Blob([''], { type: 'audio/mpeg' }),
    };
    await storage.putProject(project);
    await storage.putAudio(audio);

    const r1 = replyService.add({ annotationId: 'an-1', text: 'first', authorName: 'A' });
    const r2 = replyService.add({ annotationId: 'an-1', text: 'second', authorName: 'B' });
    if (!r1.ok || !r2.ok) throw new Error('failed');
    await storage.putReplies([r1.value, r2.value]);

    const loaded = await storage.listReplies('an-1');
    expect(loaded).toHaveLength(2);
    const texts = loaded.map((r) => r.text);
    expect(texts).toContain('first');
    expect(texts).toContain('second');
  });

  it('edit persists updated text', async () => {
    await storage.init();
    const r = replyService.add({ annotationId: 'an-1', text: 'original', authorName: 'A' });
    if (!r.ok) throw new Error('failed');
    await storage.putReplies([r.value]);

    const edited = replyService.edit(r.value, 'updated');
    if (!edited.ok) throw new Error('failed');
    await storage.putReplies([edited.value]);

    const loaded = await storage.listReplies('an-1');
    expect(loaded[0].text).toBe('updated');
  });
});
