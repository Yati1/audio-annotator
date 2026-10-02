import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../src/state/store';
import { storage, _resetDbForTests } from '../../src/features/storage/storage';
import { annotationService } from '../../src/features/annotations/annotations';
import { replyService } from '../../src/features/replies/replies';
import { nowIso } from '../../src/lib/time';
import { SCHEMA_VERSION } from '../../src/features/types';

const projectId = 'p1';
const myAuthorId = 'device-mine';
const otherAuthorId = 'device-theirs';

function point(authorId: string, note: string) {
  const res = annotationService.createPoint(
    { projectId, startSec: 1, note, authorName: 'X', authorColor: '#3987e5', authorId },
    120,
  );
  if (!res.ok) throw new Error('setup failed');
  return res.value;
}

function reply(annotationId: string, authorId: string, text: string) {
  const res = replyService.add({
    annotationId,
    text,
    authorName: 'X',
    authorColor: '#3987e5',
    authorId,
  });
  if (!res.ok) throw new Error('setup failed');
  return res.value;
}

describe('store: only the author may edit or delete (FR-015)', () => {
  beforeEach(async () => {
    _resetDbForTests();
    await storage.init();
    const now = nowIso();
    useStore.setState({
      authorId: myAuthorId,
      authorColor: '#3987e5',
      displayName: 'Me',
      project: {
        id: projectId,
        title: 'Test',
        audioId: 'a1',
        schemaVersion: SCHEMA_VERSION,
        createdAt: now,
        updatedAt: now,
      },
      audio: { id: 'a1', fileName: 't.mp3', mimeType: 'audio/mpeg', durationSec: 120, byteSize: 4 },
      annotations: [],
      repliesByAnnotation: {},
    });
  });

  it("ignores edits and deletes on someone else's annotation", async () => {
    const theirs = point(otherAuthorId, 'theirs');
    useStore.setState({ annotations: [theirs] });

    await useStore.getState().editAnnotation(theirs.id, { note: 'changed' });
    await useStore.getState().deleteAnnotation(theirs.id);

    expect(useStore.getState().annotations).toEqual([theirs]);
  });

  it('still edits and deletes my own annotation', async () => {
    const mine = point(myAuthorId, 'mine');
    useStore.setState({ annotations: [mine] });

    await useStore.getState().editAnnotation(mine.id, { note: 'changed' });
    expect(useStore.getState().annotations[0].note).toBe('changed');

    await useStore.getState().deleteAnnotation(mine.id);
    expect(useStore.getState().annotations).toEqual([]);
  });

  it("ignores edits and deletes on someone else's reply, but not on mine", async () => {
    const anchor = point(otherAuthorId, 'anchor');
    const theirs = reply(anchor.id, otherAuthorId, 'theirs');
    const mine = reply(anchor.id, myAuthorId, 'mine');
    useStore.setState({
      annotations: [anchor],
      repliesByAnnotation: { [anchor.id]: [theirs, mine] },
    });

    await useStore.getState().editReply(anchor.id, theirs.id, 'changed');
    await useStore.getState().deleteReply(anchor.id, theirs.id);
    await useStore.getState().editReply(anchor.id, mine.id, 'mine, edited');

    const [afterTheirs, afterMine] = useStore.getState().repliesByAnnotation[anchor.id];
    expect(afterTheirs).toEqual(theirs);
    expect(afterMine.text).toBe('mine, edited');
  });
});
