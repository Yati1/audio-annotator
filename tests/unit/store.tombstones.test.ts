import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storage, _resetDbForTests } from '../../src/features/storage/storage';
import { useStore } from '../../src/state/store';
import { exportBundle, parseBundle } from '../../src/features/bundle/bundle';
import { nowIso } from '../../src/lib/time';
import type { FullProject } from '../../src/features/types';
import { SCHEMA_VERSION } from '../../src/features/types';

const earlier = '2026-09-01T00:00:00.000Z';

function makeFull(): FullProject {
  const now = nowIso();
  return {
    project: {
      id: 'p1',
      title: 'Shared',
      audioId: 'a1',
      schemaVersion: SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    },
    audio: { id: 'a1', fileName: 't.mp3', mimeType: 'audio/mpeg', durationSec: 60, byteSize: 4 },
    annotations: [
      {
        id: 'an-1',
        projectId: 'p1',
        kind: 'point',
        startSec: 1,
        endSec: null,
        note: 'Will be deleted',
        authorName: 'Sam',
        authorColor: '#3987e5',
        authorId: 'device-sam',
        createdAt: earlier,
        updatedAt: earlier,
      },
    ],
    replies: [],
  };
}

async function bundleFile(full: FullProject): Promise<File> {
  const blob = exportBundle(full, new Uint8Array([0xff, 0xfb, 0x90, 0x00]));
  return new File([await blob.arrayBuffer()], 'b.aaz', { type: 'application/zip' });
}

describe('store: a deleted annotation stays deleted', () => {
  const original = makeFull();

  beforeEach(async () => {
    _resetDbForTests();
    await storage.init();
    await storage.putProject(original.project);
    await storage.putAudio({ ...original.audio, blob: new Blob(['x']) });
    await storage.putAnnotations(original.annotations);
    useStore.setState({ status: 'ready', authorId: 'device-sam', authorColor: '#3987e5' });
    useStore.getState().setLoadedProject(original, 'blob:open');
    URL.createObjectURL = vi.fn(() => 'blob:new');
    URL.revokeObjectURL = vi.fn();

    await useStore.getState().deleteAnnotation('an-1');
  });

  it('when an older bundle still has it', async () => {
    const result = await useStore.getState().importBundle(await bundleFile(original));

    expect(result).toEqual({ added: 0, updated: 0 });
    expect(useStore.getState().annotations).toEqual([]);
    const [stored] = await storage.listAnnotations('p1');
    expect(stored.deleted).toBe(true);
  });

  it('and the export carries the delete to collaborators', async () => {
    // fake-indexeddb doesn't keep a Blob's methods, so hand back a real one.
    vi.spyOn(storage, 'getAudioBlob').mockResolvedValue(new Blob([new Uint8Array([0xff])]));
    const blob = await useStore.getState().exportBundle();
    if (!blob) throw new Error('export failed');

    const parsed = parseBundle(new Uint8Array(await blob.arrayBuffer()));
    if (!parsed.ok) throw new Error(parsed.error.message);
    expect(parsed.result.full.annotations).toMatchObject([{ id: 'an-1', deleted: true }]);
  });
});
