import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storage, _resetDbForTests } from '../../src/features/storage/storage';
import { useStore } from '../../src/state/store';
import { exportBundle } from '../../src/features/bundle/bundle';
import { nowIso } from '../../src/lib/time';
import type { FullProject } from '../../src/features/types';
import { SCHEMA_VERSION } from '../../src/features/types';

function makeFull(projectId: string, audioId: string, title: string): FullProject {
  const now = nowIso();
  return {
    project: {
      id: projectId,
      title,
      audioId,
      schemaVersion: SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    },
    audio: { id: audioId, fileName: 't.mp3', mimeType: 'audio/mpeg', durationSec: 60, byteSize: 4 },
    annotations: [
      {
        id: `an-${projectId}`,
        projectId,
        kind: 'point',
        startSec: 1,
        endSec: null,
        note: title,
        authorName: 'Sam',
        authorColor: '#3987e5',
        authorId: 'device-sam',
        createdAt: now,
        updatedAt: now,
      },
    ],
    replies: [],
  };
}

async function bundleFile(full: FullProject): Promise<File> {
  const blob = exportBundle(full, new Uint8Array([0xff, 0xfb, 0x90, 0x00]));
  return new File([await blob.arrayBuffer()], 'b.aaz', { type: 'application/zip' });
}

describe('store: importing a different project over the open one (FR-023)', () => {
  const open = makeFull('p-open', 'a-open', 'Open project');

  beforeEach(async () => {
    _resetDbForTests();
    await storage.init();
    await storage.putProject(open.project);
    await storage.putAudio({ ...open.audio, blob: new Blob(['x']) });
    await storage.putAnnotations(open.annotations);
    useStore.setState({ status: 'ready', authorId: 'device-sam', authorColor: '#3987e5' });
    useStore.getState().setLoadedProject(open, 'blob:open');
    URL.createObjectURL = vi.fn(() => 'blob:new');
    URL.revokeObjectURL = vi.fn();
  });

  it('asks with the open title, and changes nothing when declined', async () => {
    const confirmReplace = vi.fn(() => false);

    const result = await useStore
      .getState()
      .importBundle(await bundleFile(makeFull('p-new', 'a-new', 'New project')), confirmReplace);

    expect(confirmReplace).toHaveBeenCalledWith('Open project');
    expect(result).toBeNull();
    expect(useStore.getState().status).toBe('ready');
    expect(useStore.getState().project?.id).toBe('p-open');
    expect(await storage.getProject('p-open')).toBeDefined();
  });

  it('deletes the old project from storage when accepted', async () => {
    const result = await useStore
      .getState()
      .importBundle(await bundleFile(makeFull('p-new', 'a-new', 'New project')), () => true);

    expect(result).not.toBeNull();
    expect(useStore.getState().project?.id).toBe('p-new');
    expect(await storage.getProject('p-open')).toBeUndefined();
    expect(await storage.listAnnotations('p-open')).toEqual([]);
    expect((await storage.listProjects()).map((p) => p.id)).toEqual(['p-new']);
  });

  it('keeps the old project when saving the new one fails (FR-026)', async () => {
    vi.spyOn(storage, 'putAnnotations').mockRejectedValueOnce(new Error('QuotaExceededError'));

    const result = await useStore
      .getState()
      .importBundle(await bundleFile(makeFull('p-new', 'a-new', 'New project')), () => true);

    expect(result).toBeNull();
    expect(useStore.getState().status).toBe('ready');
    expect(useStore.getState().error).toBe('Could not save the imported project.');
    expect(useStore.getState().project?.id).toBe('p-open');
    expect(await storage.getProject('p-open')).toBeDefined();
    expect(await storage.listAnnotations('p-open')).toHaveLength(1);
    // Nothing half-written is left for the next start to open.
    expect((await storage.listProjects()).map((p) => p.id)).toEqual(['p-open']);
  });

  it('keeps shared audio when the replaced project used the same audio id', async () => {
    const result = await useStore
      .getState()
      .importBundle(await bundleFile(makeFull('p-new', 'a-open', 'New project')), () => true);

    expect(result).not.toBeNull();
    expect(await storage.getProject('p-open')).toBeUndefined();
    expect(await storage.getAudio('a-open')).toBeDefined();
  });

  it('does not ask when the bundle is the same project', async () => {
    const confirmReplace = vi.fn(() => false);

    const result = await useStore.getState().importBundle(await bundleFile(open), confirmReplace);

    expect(confirmReplace).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(useStore.getState().project?.id).toBe('p-open');
  });

  describe('when storage already holds the incoming project, not open', () => {
    // An older copy of 'p-stored' in the bundle; storage has a newer edit of one note
    // and a deletion of the other, as left when the user opened another file.
    const older = '2026-09-01T00:00:00.000Z';
    const newer = '2026-09-02T00:00:00.000Z';
    const bundled = makeFull('p-stored', 'a-stored', 'Stored project');
    bundled.annotations = [
      { ...bundled.annotations[0], id: 'an-edited', note: 'Old note', updatedAt: older },
      { ...bundled.annotations[0], id: 'an-deleted', note: 'Deleted note', updatedAt: older },
    ];

    beforeEach(async () => {
      await storage.putProject(bundled.project);
      await storage.putAudio({ ...bundled.audio, blob: new Blob(['x']) });
      await storage.putAnnotations([
        { ...bundled.annotations[0], note: 'New note', updatedAt: newer },
        { ...bundled.annotations[1], deleted: true, updatedAt: newer },
      ]);
    });

    it('merges with the stored copy, keeping its newer edit and its deletion', async () => {
      const result = await useStore.getState().importBundle(await bundleFile(bundled), () => true);

      expect(result).toEqual({ added: 0, updated: 0 });
      const stored = await storage.listAnnotations('p-stored');
      expect(stored.find((a) => a.id === 'an-edited')?.note).toBe('New note');
      expect(stored.find((a) => a.id === 'an-deleted')?.deleted).toBe(true);
    });

    it('keeps the stored copy when saving fails (FR-026)', async () => {
      vi.spyOn(storage, 'putAnnotations').mockRejectedValueOnce(new Error('QuotaExceededError'));

      const result = await useStore.getState().importBundle(await bundleFile(bundled), () => true);

      expect(result).toBeNull();
      expect(await storage.getProject('p-stored')).toBeDefined();
      expect(await storage.listAnnotations('p-stored')).toHaveLength(2);
    });
  });
});
