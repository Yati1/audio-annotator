import { describe, it, expect, beforeEach } from 'vitest';
import { openDB } from 'idb';
import { storage, _resetDbForTests, DB_BLOCKED_MESSAGE } from '../../src/features/storage/storage';
import { nowIso } from '../../src/lib/time';
import type { AudioRecord, Project } from '../../src/features/types';
import { SCHEMA_VERSION } from '../../src/features/types';

describe('StoragePort', () => {
  beforeEach(() => {
    _resetDbForTests();
  });

  it('init succeeds', async () => {
    await expect(storage.init()).resolves.toBeUndefined();
  });

  it('puts and gets a project', async () => {
    await storage.init();
    const p: Project = {
      id: 'p1',
      title: 'Test',
      audioId: 'a1',
      schemaVersion: SCHEMA_VERSION,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await storage.putProject(p);
    const got = await storage.getProject('p1');
    expect(got?.title).toBe('Test');
  });

  it('listProjects returns summaries newest first', async () => {
    await storage.init();
    const now = nowIso();
    const p1: Project = {
      id: 'p1',
      title: 'Old',
      audioId: 'a1',
      schemaVersion: SCHEMA_VERSION,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const p2: Project = {
      id: 'p2',
      title: 'New',
      audioId: 'a2',
      schemaVersion: SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    };
    await storage.putProject(p1);
    await storage.putProject(p2);
    const list = await storage.listProjects();
    expect(list[0].id).toBe('p2');
  });

  it('puts and gets audio blob', async () => {
    await storage.init();
    const blob = new Blob(['audio'], { type: 'audio/mpeg' });
    const audio: AudioRecord = {
      id: 'a1',
      fileName: 'test.mp3',
      mimeType: 'audio/mpeg',
      durationSec: 60,
      byteSize: 5,
      blob,
    };
    await storage.putAudio(audio);
    const got = await storage.getAudioBlob('a1');
    expect(got).toBeDefined();
  });

  it('deleteProject cascades audio + annotations + replies', async () => {
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
      fileName: 'f.mp3',
      mimeType: 'audio/mpeg',
      durationSec: 10,
      byteSize: 1,
      blob: new Blob(['']),
    };
    await storage.putProject(project);
    await storage.putAudio(audio);
    await storage.putAnnotations([
      {
        id: 'an-1',
        projectId: 'p1',
        kind: 'point',
        startSec: 5,
        endSec: null,
        note: 'x',
        authorName: 'A',
        authorId: 'device-a',
        authorColor: '#3987e5',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await storage.putReplies([
      {
        id: 'rp-1',
        annotationId: 'an-1',
        text: 'y',
        authorName: 'B',
        authorId: 'device-b',
        authorColor: '#d95926',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await storage.deleteProject('p1');
    expect(await storage.getProject('p1')).toBeUndefined();
    expect(await storage.getAudioBlob('a1')).toBeUndefined();
    expect(await storage.listAnnotations('p1')).toHaveLength(0);
    expect(await storage.listReplies('an-1')).toHaveLength(0);
  });
});

/** Builds a version 1 database by hand, the way the old app left it. */
function openV1(name: string) {
  return openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore('projects', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
      db.createObjectStore('audio', { keyPath: 'id' });
      db.createObjectStore('annotations', { keyPath: 'id' }).createIndex('projectId', 'projectId');
      db.createObjectStore('replies', { keyPath: 'id' }).createIndex(
        'annotationId',
        'annotationId',
      );
      db.createObjectStore('sessionMeta', { keyPath: 'key' });
    },
  });
}

describe('StoragePort upgrade from version 1', () => {
  it('wipes stored projects but keeps session values', async () => {
    const name = _resetDbForTests();
    const v1 = await openV1(name);
    const now = nowIso();
    await v1.put('projects', {
      id: 'old',
      title: 'Old',
      audioId: 'a-old',
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
    await v1.put('annotations', { id: 'an-old', projectId: 'old', note: 'no author id' });
    await v1.put('sessionMeta', { key: 'displayName', value: 'Sam' });
    v1.close();

    expect(await storage.listProjects()).toEqual([]);
    expect(await storage.listAnnotations('old')).toEqual([]);
    expect(await storage.getSession<string>('displayName')).toBe('Sam');
  });
});

describe('StoragePort with another tab open', () => {
  it('fails with a clear message while an older version blocks the upgrade', async () => {
    const name = _resetDbForTests();
    // An old tab: version 1, and no handler to close when a newer version asks.
    const oldTab = await openV1(name);

    await expect(storage.init()).rejects.toThrow(DB_BLOCKED_MESSAGE);

    oldTab.close();
    // Once the old tab is gone, trying again works.
    await expect(storage.init()).resolves.toBeUndefined();
  });

  it('closes its connection when a newer version wants to upgrade', async () => {
    const name = _resetDbForTests();
    await storage.init();

    let blocked = false;
    const newTab = await openDB(name, 3, {
      blocked() {
        blocked = true;
      },
    });

    expect(blocked).toBe(false);
    newTab.close();
  });
});
