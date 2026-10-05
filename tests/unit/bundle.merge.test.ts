import { describe, it, expect } from 'vitest';
import { merge } from '../../src/features/bundle/merge';
import type { FullProject } from '../../src/features/types';
import { SCHEMA_VERSION } from '../../src/features/types';
import { nowIso } from '../../src/lib/time';

// One fixed time, so two separately built bases carry identical timestamps.
const BASE_TIME = nowIso();

function makeBase(): FullProject {
  const now = BASE_TIME;
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
        authorId: 'device-sam',
        authorColor: '#3987e5',
        createdAt: now,
        updatedAt: now,
        deleted: false,
      },
    ],
    replies: [],
  };
}

/** An ISO timestamp one second after `iso`. */
function later(iso: string): string {
  return new Date(new Date(iso).getTime() + 1000).toISOString();
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
      authorId: 'device-jo',
      authorColor: '#d95926',
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

  it('takes the incoming version when it is newer', () => {
    const local = makeBase();
    const incoming = makeBase();
    incoming.annotations[0] = {
      ...incoming.annotations[0],
      note: 'Edited later',
      updatedAt: later(local.annotations[0].updatedAt),
    };
    const outcome = merge(local, incoming);
    expect(outcome.project.annotations[0].note).toBe('Edited later');
    expect(outcome.updated.annotations).toBe(1);
  });

  it('keeps the local version when the incoming one is older', () => {
    const incoming = makeBase();
    const local = makeBase();
    local.annotations[0] = {
      ...local.annotations[0],
      note: 'Edited later',
      updatedAt: later(incoming.annotations[0].updatedAt),
    };
    const outcome = merge(local, incoming);
    expect(outcome.project.annotations[0].note).toBe('Edited later');
    expect(outcome.updated.annotations).toBe(0);
  });

  it('keeps the local version when timestamps tie, even if content differs', () => {
    const local = makeBase();
    const incoming = makeBase();
    incoming.annotations[0] = { ...local.annotations[0], note: 'Hand-edited' };
    const outcome = merge(local, incoming);
    expect(outcome.project.annotations[0].note).toBe('Original');
    expect(outcome.updated.annotations).toBe(0);
  });

  it('compares times, not strings, when a stored timestamp has an offset', () => {
    // An import from before timestamps were rewritten in UTC could have stored this.
    const local = makeBase();
    local.annotations[0] = { ...local.annotations[0], updatedAt: '2026-09-29T10:30:00+01:00' };
    const incoming = makeBase();
    incoming.annotations[0] = {
      ...incoming.annotations[0],
      note: 'Edited later',
      updatedAt: '2026-09-29T10:00:00.000Z',
    };
    const outcome = merge(local, incoming);
    expect(outcome.project.annotations[0].note).toBe('Edited later');
    expect(outcome.updated.annotations).toBe(1);
  });

  it('ignores a newer copy that claims a different author', () => {
    const local = makeBase();
    const edited = makeBase();
    edited.annotations[0] = {
      ...edited.annotations[0],
      note: 'Taken over',
      authorId: 'device-other',
      updatedAt: later(local.annotations[0].updatedAt),
    };
    const deleted = makeBase();
    deleted.annotations[0] = { ...edited.annotations[0], deleted: true };

    for (const incoming of [edited, deleted]) {
      const outcome = merge(local, incoming);
      expect(outcome.project.annotations[0]).toEqual(local.annotations[0]);
      expect(outcome.updated.annotations).toBe(0);
    }
  });

  it('a local tombstone survives a newer incoming copy', () => {
    const local = makeBase();
    local.annotations[0] = { ...local.annotations[0], deleted: true };
    const incoming = makeBase();
    incoming.annotations[0] = {
      ...incoming.annotations[0],
      note: 'Edited later',
      updatedAt: later(local.annotations[0].updatedAt),
    };
    const outcome = merge(local, incoming);
    expect(outcome.project.annotations[0].deleted).toBe(true);
  });

  it('takes a newer reply edit too', () => {
    const now = nowIso();
    const reply = {
      id: 'rp-1',
      annotationId: 'an-1',
      text: 'First draft',
      authorName: 'Jo',
      authorId: 'device-jo',
      authorColor: '#d95926',
      createdAt: now,
      updatedAt: now,
    };
    const local = { ...makeBase(), replies: [reply] };
    const incoming = {
      ...makeBase(),
      replies: [{ ...reply, text: 'Second draft', updatedAt: later(now) }],
    };
    const outcome = merge(local, incoming);
    expect(outcome.project.replies[0].text).toBe('Second draft');
    expect(outcome.updated.replies).toBe(1);
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
      authorId: 'device-jo',
      authorColor: '#d95926',
      createdAt: now,
      updatedAt: now,
      deleted: false,
    });
    const outcome = merge(local, incoming);
    expect(outcome.project.replies).toHaveLength(1);
    expect(outcome.added.replies).toBe(1);
  });

  it('identical annotations on both sides change nothing', () => {
    const local = makeBase();
    const incoming = makeBase();
    const outcome = merge(local, incoming);
    expect(outcome.updated).toEqual({ annotations: 0, replies: 0 });
    expect(outcome.project.annotations).toHaveLength(1);
  });
});
