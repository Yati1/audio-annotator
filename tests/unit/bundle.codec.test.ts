import { describe, it, expect } from 'vitest';
import { buildManifest, exportBundle, parseBundle } from '../../src/features/bundle/bundle';
import type { FullProject } from '../../src/features/types';
import { SCHEMA_VERSION } from '../../src/features/types';
import { nowIso } from '../../src/lib/time';

function makeProject(): FullProject {
  const now = nowIso();
  return {
    project: {
      id: 'proj-1',
      title: 'Test',
      audioId: 'audio-1',
      schemaVersion: SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    },
    audio: {
      id: 'audio-1',
      fileName: 'test.mp3',
      mimeType: 'audio/mpeg',
      durationSec: 120,
      byteSize: 4,
    },
    annotations: [
      {
        id: 'an-1',
        projectId: 'proj-1',
        kind: 'region',
        startSec: 10,
        endSec: 20,
        note: 'Background noise',
        authorName: 'Sam',
        createdAt: now,
        updatedAt: now,
        deleted: false,
      },
    ],
    replies: [
      {
        id: 'rp-1',
        annotationId: 'an-1',
        text: 'Agreed',
        authorName: 'Jo',
        createdAt: now,
        updatedAt: now,
        deleted: false,
      },
    ],
  };
}

describe('bundle codec', () => {
  it('buildManifest nests replies under annotations', () => {
    const full = makeProject();
    const manifest = buildManifest(full);
    expect(manifest.schemaVersion).toBe(SCHEMA_VERSION);
    expect(manifest.annotations[0].replies).toHaveLength(1);
    expect(manifest.annotations[0].replies[0].id).toBe('rp-1');
  });

  it('export→parse round-trip restores project faithfully', async () => {
    const full = makeProject();
    const audioBytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00]); // fake mp3 bytes
    const blob = exportBundle(full, audioBytes);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const result = parseBundle(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { full: restored } = result.result;
    expect(restored.project.id).toBe('proj-1');
    expect(restored.annotations).toHaveLength(1);
    expect(restored.replies).toHaveLength(1);
    expect(restored.replies[0].text).toBe('Agreed');
  });

  it('round-trip preserves tombstoned items', async () => {
    const full = makeProject();
    full.annotations[0].deleted = true;
    const blob = exportBundle(full, new Uint8Array([0xff, 0xfb, 0x90, 0x00]));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const result = parseBundle(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.full.annotations[0].deleted).toBe(true);
  });
});
