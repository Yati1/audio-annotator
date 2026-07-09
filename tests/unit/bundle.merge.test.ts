import { describe, it, expect } from 'vitest';
import { merge } from '../../src/features/bundle/merge';
import type { FullProject } from '../../src/features/types';
import { SCHEMA_VERSION } from '../../src/features/types';
import { nowIso } from '../../src/lib/time';

function makeBase(): FullProject {
  const now = nowIso();
  return {
    project: {
      id: 'proj-1',
      title: 'Test',
      audioId: 'a-1',
      schemaVersion: SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    },
    audio: {
      id: 'a-1',
      fileName: 'test.mp3',
      mimeType: 'audio/mpeg',
      durationSec: 120,
      byteSize: 4,
    },
    annotations: [
      {
        id: 'an-1',
        projectId: 'proj-1',
        kind: 'point',
        startSec: 5,
        endSec: null,
        note: 'Original',
        authorName: 'Sam',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        deleted: false,
      },
    ],
    replies: [],
  };
}

describe('merge', () => {
  it('returns incoming unchanged when local is null', () => {
    const incoming = makeBase();
    const outcome = merge(null, incoming);
    expect(outcome.project.annotations).toHaveLength(1);
    expect(outcome.added.annotations).toBe(1);
  });

  it('adds new annotation from incoming', () => {
    const local = makeBase();
    const incoming = makeBase();
    const now = nowIso();
    incoming.annotations.push({
      id: 'an-2',
      projectId: 'proj-1',
      kind: 'region',
      startSec: 10,
      endSec: 20,
      note: 'New',
      authorName: 'Jo',
      createdAt: now,
      updatedAt: now,
      deleted: false,
    });
    const outcome = merge(local, incoming);
    expect(outcome.project.annotations).toHaveLength(2);
    expect(outcome.added.annotations).toBe(1);
  });

  it('tombstone wins on both sides', () => {
    const local = makeBase();
    const incoming = makeBase();
    incoming.annotations[0] = { ...incoming.annotations[0], deleted: true };
    const outcome = merge(local, incoming);
    expect(outcome.project.annotations[0].deleted).toBe(true);
  });

  it('flags divergent edits as conflict and keeps local', () => {
    const local = makeBase();
    const incoming = makeBase();
    incoming.annotations[0] = { ...incoming.annotations[0], note: 'Different' };
    const outcome = merge(local, incoming);
    expect(outcome.conflicts).toHaveLength(1);
    // local note is preserved
    expect(outcome.project.annotations[0].note).toBe('Original');
  });

  it('adds new replies from incoming', () => {
    const local = makeBase();
    const incoming = makeBase();
    const now = nowIso();
    incoming.replies.push({
      id: 'rp-1',
      annotationId: 'an-1',
      text: 'Reply',
      authorName: 'Jo',
      createdAt: now,
      updatedAt: now,
      deleted: false,
    });
    const outcome = merge(local, incoming);
    expect(outcome.project.replies).toHaveLength(1);
    expect(outcome.added.replies).toBe(1);
  });

  it('identical annotations on both sides produce no conflict', () => {
    const local = makeBase();
    const incoming = makeBase();
    const outcome = merge(local, incoming);
    expect(outcome.conflicts).toHaveLength(0);
    expect(outcome.project.annotations).toHaveLength(1);
  });
});
