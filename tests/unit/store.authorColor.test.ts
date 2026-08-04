import { describe, it, expect, beforeEach } from 'vitest';
import { storage, _resetDbForTests } from '../../src/features/storage/storage';
import { useStore } from '../../src/state/store';
import { annotationService } from '../../src/features/annotations/annotations';
import { AUTHOR_COLORS } from '../../src/lib/color';
import { nowIso } from '../../src/lib/time';
import type { AudioMeta, Project } from '../../src/features/types';

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

const audio: AudioMeta = {
  id: 'a1',
  fileName: 'test.mp3',
  mimeType: 'audio/mpeg',
  durationSec: 120,
  byteSize: 4,
};

describe('store: author color assignment', () => {
  beforeEach(async () => {
    _resetDbForTests();
    await storage.init();
    useStore.setState({
      status: 'ready',
      error: null,
      notice: null,
      displayName: 'Sam',
      authorId: myAuthorId,
      authorColor: '',
      project: makeProject(),
      audio,
      objectUrl: null,
      annotations: [],
      repliesByAnnotation: {},
    });
  });

  it('assigns the first palette color on the very first authored write', async () => {
    await useStore.getState().addPoint(1, 'first note');
    const state = useStore.getState();
    expect(state.authorColor).toBe(AUTHOR_COLORS[0]);
    expect(state.annotations[0].authorColor).toBe(AUTHOR_COLORS[0]);
    expect(await storage.getSession('authorColor')).toBe(AUTHOR_COLORS[0]);
  });

  it('avoids colors already used by collaborators visible in an imported project', async () => {
    const theirs = annotationService.createPoint(
      {
        projectId,
        startSec: 2,
        note: 'theirs',
        authorName: 'Alex',
        authorColor: AUTHOR_COLORS[0],
        authorId: otherAuthorId,
      },
      audio.durationSec,
    );
    if (!theirs.ok) throw new Error('setup failed');
    useStore.setState({ annotations: [theirs.value] });

    await useStore.getState().addPoint(1, 'my note');

    const state = useStore.getState();
    expect(state.authorColor).toBe(AUTHOR_COLORS[1]);
    expect(state.annotations.find((a) => a.note === 'my note')?.authorColor).toBe(AUTHOR_COLORS[1]);
  });

  it('reuses the already-assigned color for subsequent writes instead of picking again', async () => {
    await useStore.getState().addPoint(1, 'first');
    const firstColor = useStore.getState().authorColor;
    await useStore.getState().addPoint(2, 'second');
    const state = useStore.getState();
    expect(state.authorColor).toBe(firstColor);
    expect(state.annotations.every((a) => a.authorColor === firstColor)).toBe(true);
  });
});
