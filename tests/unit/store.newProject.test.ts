import { describe, it, expect, beforeEach } from 'vitest';
import { storage, _resetDbForTests } from '../../src/features/storage/storage';
import { useStore } from '../../src/state/store';
import { annotationService } from '../../src/features/annotations/annotations';
import { replyService } from '../../src/features/replies/replies';
import { nowIso } from '../../src/lib/time';
import type { AudioRecord, Project } from '../../src/features/types';
import { SCHEMA_VERSION } from '../../src/features/types';

const projectId = 'p1';
const audioId = 'a1';
const myAuthorId = 'author-me';

function makeProject(): Project {
  const now = nowIso();
  return {
    id: projectId,
    title: 'Test',
    audioId,
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
  };
}

function makeAudioRecord(): AudioRecord {
  return {
    id: audioId,
    fileName: 'test.mp3',
    mimeType: 'audio/mpeg',
    durationSec: 60,
    byteSize: 5,
    blob: new Blob(['audio'], { type: 'audio/mpeg' }),
  };
}

describe('store: newProject', () => {
  beforeEach(async () => {
    _resetDbForTests();
    await storage.init();
    useStore.setState({
      status: 'ready',
      error: 'boom',
      notice: 'hi',
      displayName: 'Sam',
      authorId: myAuthorId,
      authorColor: '#3987e5',
      project: makeProject(),
      audio: {
        id: audioId,
        fileName: 'test.mp3',
        mimeType: 'audio/mpeg',
        durationSec: 60,
        byteSize: 5,
      },
      objectUrl: null,
      annotations: [],
      repliesByAnnotation: {},
    });
  });

  it('clears the current project from state and storage, keeping identity fields', async () => {
    await storage.putProject(makeProject());
    await storage.putAudio(makeAudioRecord());

    const point = annotationService.createPoint(
      {
        projectId,
        startSec: 1,
        note: 'mine',
        authorName: 'Sam',
        authorColor: '#3987e5',
        authorId: myAuthorId,
      },
      60,
    );
    if (!point.ok) throw new Error('setup failed');
    await storage.putAnnotations([point.value]);

    const reply = replyService.add({
      annotationId: point.value.id,
      text: 'reply',
      authorName: 'Sam',
      authorColor: '#3987e5',
      authorId: myAuthorId,
    });
    if (!reply.ok) throw new Error('setup failed');
    await storage.putReplies([reply.value]);

    useStore.setState({
      annotations: [point.value],
      repliesByAnnotation: { [point.value.id]: [reply.value] },
    });

    await useStore.getState().newProject();

    const state = useStore.getState();
    expect(state.status).toBe('idle');
    expect(state.error).toBeNull();
    expect(state.notice).toBeNull();
    expect(state.project).toBeNull();
    expect(state.audio).toBeNull();
    expect(state.objectUrl).toBeNull();
    expect(state.annotations).toEqual([]);
    expect(state.repliesByAnnotation).toEqual({});
    // Device identity is not project-scoped and must survive a reset.
    expect(state.displayName).toBe('Sam');
    expect(state.authorId).toBe(myAuthorId);
    expect(state.authorColor).toBe('#3987e5');

    expect(await storage.getProject(projectId)).toBeUndefined();
    expect(await storage.getAudio(audioId)).toBeUndefined();
    expect(await storage.listAnnotations(projectId)).toEqual([]);
    expect(await storage.listReplies(point.value.id)).toEqual([]);
  });

  it('nulls the project synchronously and stays loading until deletion completes', async () => {
    await storage.putProject(makeProject());
    await storage.putAudio(makeAudioRecord());

    const promise = useStore.getState().newProject();

    // Before the delete has resolved: the write-guard is already up, but the UI
    // must not yet claim the reset succeeded (a reload here would still restore
    // the project from storage, since the delete hasn't landed).
    expect(useStore.getState().project).toBeNull();
    expect(useStore.getState().status).toBe('loading');

    // A write already in flight at this point must see the project gone and bail,
    // rather than writing into a project that's concurrently being deleted.
    const id = await useStore.getState().addPoint(1, 'sneaky');
    expect(id).toBeNull();

    await promise;

    const state = useStore.getState();
    expect(state.status).toBe('idle');
    expect(state.audio).toBeNull();
    expect(await storage.getProject(projectId)).toBeUndefined();
    expect(await storage.listAnnotations(projectId)).toEqual([]);
  });

  it('is a safe no-op when there is no current project', async () => {
    useStore.setState({ project: null, audio: null });

    await expect(useStore.getState().newProject()).resolves.toBeUndefined();

    const state = useStore.getState();
    expect(state.status).toBe('idle');
    expect(state.project).toBeNull();
  });
});
