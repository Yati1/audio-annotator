import { describe, it, expect, beforeEach } from 'vitest';
import { storage, _resetDbForTests } from '../../src/features/storage/storage';
import { useStore } from '../../src/state/store';
import { annotationService } from '../../src/features/annotations/annotations';
import { replyService } from '../../src/features/replies/replies';
import { nowIso } from '../../src/lib/time';
import type { Project } from '../../src/features/types';

const projectId = 'p1';
const myAuthorId = 'author-me';
const otherAuthorId = 'author-other';

function makeProject(): Project {
  const now = nowIso();
  return {
    id: projectId,
    title: 'Test',
    audioId: 'a1',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

describe('store: renaming the display name', () => {
  beforeEach(async () => {
    _resetDbForTests();
    await storage.init();
    useStore.setState({
      status: 'ready',
      error: null,
      notice: null,
      displayName: 'Sam',
      authorId: myAuthorId,
      project: makeProject(),
      audio: null,
      objectUrl: null,
      annotations: [],
      repliesByAnnotation: {},
    });
  });

  it('rewrites authorName on my past annotations and replies in the current project', async () => {
    const mine = annotationService.createPoint(
      { projectId, startSec: 1, note: 'mine', authorName: 'Sam', authorId: myAuthorId },
      120,
    );
    const theirs = annotationService.createPoint(
      { projectId, startSec: 2, note: 'theirs', authorName: 'Alex', authorId: otherAuthorId },
      120,
    );
    if (!mine.ok || !theirs.ok) throw new Error('setup failed');
    await storage.putAnnotations([mine.value, theirs.value]);

    const myReply = replyService.add({
      annotationId: mine.value.id,
      text: 'my reply',
      authorName: 'Sam',
      authorId: myAuthorId,
    });
    if (!myReply.ok) throw new Error('setup failed');
    await storage.putReplies([myReply.value]);

    useStore.setState({
      annotations: [mine.value, theirs.value],
      repliesByAnnotation: { [mine.value.id]: [myReply.value] },
    });
    const updatedAtBefore = useStore.getState().project?.updatedAt;

    await useStore.getState().setDisplayName('Samuel');

    const state = useStore.getState();
    expect(state.displayName).toBe('Samuel');
    expect(state.annotations.find((a) => a.id === mine.value.id)?.authorName).toBe('Samuel');
    expect(state.annotations.find((a) => a.id === theirs.value.id)?.authorName).toBe('Alex');
    expect(state.repliesByAnnotation[mine.value.id][0].authorName).toBe('Samuel');
    expect(state.project?.updatedAt).not.toBe(updatedAtBefore);

    const persisted = await storage.listAnnotations(projectId);
    expect(persisted.find((a) => a.id === mine.value.id)?.authorName).toBe('Samuel');
    expect(persisted.find((a) => a.id === theirs.value.id)?.authorName).toBe('Alex');
    const persistedReplies = await storage.listReplies(mine.value.id);
    expect(persistedReplies[0].authorName).toBe('Samuel');
  });

  it('relabels my content on the very first name set (starting from a blank name)', async () => {
    useStore.setState({ displayName: '' });
    const anonymous = annotationService.createPoint(
      { projectId, startSec: 1, note: 'anon', authorName: 'Anonymous', authorId: myAuthorId },
      120,
    );
    if (!anonymous.ok) throw new Error('setup failed');
    await storage.putAnnotations([anonymous.value]);
    useStore.setState({ annotations: [anonymous.value] });

    await useStore.getState().setDisplayName('Sam');

    expect(useStore.getState().annotations[0].authorName).toBe('Sam');
    const persisted = await storage.listAnnotations(projectId);
    expect(persisted[0].authorName).toBe('Sam');
  });

  it('does not rewrite content authored before authorId existed (no authorId set)', async () => {
    const legacy = annotationService.createPoint(
      { projectId, startSec: 1, note: 'legacy', authorName: 'Sam' },
      120,
    );
    if (!legacy.ok) throw new Error('setup failed');
    await storage.putAnnotations([legacy.value]);
    useStore.setState({ annotations: [legacy.value] });

    await useStore.getState().setDisplayName('Samuel');

    expect(useStore.getState().annotations[0].authorName).toBe('Sam');
  });

  it('does nothing when the name is unchanged or blank', async () => {
    const mine = annotationService.createPoint(
      { projectId, startSec: 1, note: 'mine', authorName: 'Sam', authorId: myAuthorId },
      120,
    );
    if (!mine.ok) throw new Error('setup failed');
    await storage.putAnnotations([mine.value]);
    useStore.setState({ annotations: [mine.value] });
    const updatedAtBefore = useStore.getState().project?.updatedAt;

    await useStore.getState().setDisplayName('Sam');
    await useStore.getState().setDisplayName('   ');

    expect(useStore.getState().displayName).toBe('Sam');
    expect(useStore.getState().annotations[0].authorName).toBe('Sam');
    expect(useStore.getState().project?.updatedAt).toBe(updatedAtBefore);
  });
});
