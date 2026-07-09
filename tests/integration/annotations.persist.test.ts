import { describe, it, expect, beforeEach } from 'vitest';
import { storage, _resetDbForTests } from '../../src/features/storage/storage';
import { annotationService } from '../../src/features/annotations/annotations';
import { nowIso } from '../../src/lib/time';
import type { Project, AudioRecord } from '../../src/features/types';
import { SCHEMA_VERSION } from '../../src/features/types';

const projectId = 'p1';

async function makeProject(): Promise<void> {
  const now = nowIso();
  const project: Project = {
    id: projectId,
    title: 'Test',
    audioId: 'a1',
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
  };
  const audio: AudioRecord = {
    id: 'a1',
    fileName: 'test.mp3',
    mimeType: 'audio/mpeg',
    durationSec: 120,
    byteSize: 1024,
    blob: new Blob([''], { type: 'audio/mpeg' }),
  };
  await storage.putProject(project);
  await storage.putAudio(audio);
}

describe('annotation persistence', () => {
  beforeEach(() => {
    _resetDbForTests();
  });

  it('persists and reloads a point annotation', async () => {
    await storage.init();
    await makeProject();
    const res = annotationService.createPoint(
      { projectId, startSec: 10, note: 'hello', authorName: 'Sam' },
      120,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    await storage.putAnnotations([res.value]);
    const loaded = await storage.listAnnotations(projectId);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(res.value.id);
    expect(loaded[0].note).toBe('hello');
  });

  it('persists and reloads a region annotation', async () => {
    await storage.init();
    await makeProject();
    const res = annotationService.createRegion(
      { projectId, startSec: 5, endSec: 15, note: 'region', authorName: 'Sam' },
      120,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    await storage.putAnnotations([res.value]);
    const loaded = await storage.listAnnotations(projectId);
    const region = loaded.find((a) => a.kind === 'region');
    expect(region).toBeDefined();
    expect(region?.endSec).toBe(15);
  });

  it('returns annotations in createdAt order', async () => {
    await storage.init();
    await makeProject();
    const r1 = annotationService.createPoint(
      { projectId, startSec: 20, note: 'b', authorName: 'A' },
      120,
    );
    const r2 = annotationService.createPoint(
      { projectId, startSec: 5, note: 'a', authorName: 'A' },
      120,
    );
    if (!r1.ok || !r2.ok) return;
    await storage.putAnnotations([r1.value, r2.value]);
    const loaded = await storage.listAnnotations(projectId);
    expect(loaded[0].createdAt <= loaded[1].createdAt).toBe(true);
  });

  it('session meta round-trips', async () => {
    await storage.init();
    await storage.setSession('displayName', 'Jo');
    const v = await storage.getSession<string>('displayName');
    expect(v).toBe('Jo');
  });
});
