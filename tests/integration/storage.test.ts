import { describe, it, expect, beforeEach } from 'vitest';
import { storage, _resetDbForTests } from '../../src/features/storage/storage';
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
