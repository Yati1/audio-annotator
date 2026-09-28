import { describe, it, expect } from 'vitest';
import { parseBundle } from '../../src/features/bundle/bundle';
import { buildManifest, exportBundle } from '../../src/features/bundle/bundle';
import type { FullProject } from '../../src/features/types';
import { SCHEMA_VERSION } from '../../src/features/types';
import { nowIso } from '../../src/lib/time';
import { zipSync, strToU8 } from 'fflate';

const audioBytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);

function baseProject(): FullProject {
  const now = nowIso();
  return {
    project: {
      id: 'p1',
      title: 'T',
      audioId: 'a1',
      schemaVersion: SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    },
    audio: {
      id: 'a1',
      fileName: 'test.mp3',
      mimeType: 'audio/mpeg',
      durationSec: 10,
      byteSize: 4,
    },
    annotations: [],
    replies: [],
  };
}

describe('bundle import errors', () => {
  it('E_NOT_ZIP: non-zip file', () => {
    const r = parseBundle(new Uint8Array([1, 2, 3, 4]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E_NOT_ZIP');
  });

  it('E_NO_MANIFEST: zip missing annotations.json', async () => {
    const blob = new Blob([zipSync({ 'other.txt': strToU8('hi') }) as BlobPart]);
    const r = parseBundle(new Uint8Array(await blob.arrayBuffer()));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E_NO_MANIFEST');
  });

  it('E_SCHEMA: annotations.json invalid JSON', async () => {
    const blob = new Blob([zipSync({ 'annotations.json': strToU8('{bad json') }) as BlobPart]);
    const r = parseBundle(new Uint8Array(await blob.arrayBuffer()));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E_SCHEMA');
  });

  it('E_SCHEMA: annotations.json missing required fields', async () => {
    const blob = new Blob([
      zipSync({ 'annotations.json': strToU8('{"schemaVersion":1}') }) as BlobPart,
    ]);
    const r = parseBundle(new Uint8Array(await blob.arrayBuffer()));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E_SCHEMA');
  });

  it('E_VERSION: newer schemaVersion', async () => {
    const now = nowIso();
    const zip = zipSync({
      'annotations.json': strToU8(
        JSON.stringify({
          schemaVersion: 9999,
          project: { id: 'p1', title: 'T', createdAt: now, updatedAt: now },
          audio: {
            id: 'a1',
            fileName: 'test.mp3',
            mimeType: 'audio/mpeg',
            durationSec: 10,
            byteSize: 4,
            path: 'audio/test.mp3',
          },
          annotations: [],
        }),
      ),
      'audio/test.mp3': audioBytes,
    });
    const r = parseBundle(new Uint8Array(zip.buffer));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E_VERSION');
  });

  it('E_VERSION: older schemaVersion is rejected, not upgraded', async () => {
    const manifest = { ...buildManifest(baseProject()), schemaVersion: SCHEMA_VERSION - 1 };
    const zip = zipSync({
      'annotations.json': strToU8(JSON.stringify(manifest)),
      'audio/test.mp3': audioBytes,
    });
    const r = parseBundle(zip);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('E_VERSION');
      expect(r.error.message).toContain('older app version');
    }
  });

  it('E_SCHEMA: an annotation or reply without an authorId', async () => {
    const full = baseProject();
    const now = nowIso();
    full.annotations.push({
      id: 'an-1',
      projectId: 'p1',
      kind: 'point',
      startSec: 1,
      endSec: null,
      note: 'n',
      authorName: 'Sam',
      authorColor: '#3987e5',
      authorId: 'device-sam',
      createdAt: now,
      updatedAt: now,
    });
    full.replies.push({
      id: 'rp-1',
      annotationId: 'an-1',
      text: 't',
      authorName: 'Jo',
      authorColor: '#d95926',
      authorId: 'device-jo',
      createdAt: now,
      updatedAt: now,
    });

    const noAnnotationAuthor = buildManifest(full);
    delete (noAnnotationAuthor.annotations[0] as { authorId?: string }).authorId;
    const noReplyAuthor = buildManifest(full);
    delete (noReplyAuthor.annotations[0].replies[0] as { authorId?: string }).authorId;

    for (const manifest of [noAnnotationAuthor, noReplyAuthor]) {
      const zip = zipSync({
        'annotations.json': strToU8(JSON.stringify(manifest)),
        'audio/test.mp3': audioBytes,
      });
      const r = parseBundle(zip);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('E_SCHEMA');
    }
  });

  it('E_NO_AUDIO: zip missing audio entry', async () => {
    const now = nowIso();
    const zip = zipSync({
      'annotations.json': strToU8(
        JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          project: { id: 'p1', title: 'T', createdAt: now, updatedAt: now },
          audio: {
            id: 'a1',
            fileName: 'test.mp3',
            mimeType: 'audio/mpeg',
            durationSec: 10,
            byteSize: 4,
            path: 'audio/test.mp3',
          },
          annotations: [],
        }),
      ),
    });
    const r = parseBundle(new Uint8Array(zip.buffer));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E_NO_AUDIO');
  });

  it('valid bundle parses successfully', async () => {
    const full = baseProject();
    const blob = exportBundle(full, audioBytes);
    const r = parseBundle(new Uint8Array(await blob.arrayBuffer()));
    expect(r.ok).toBe(true);
  });
});
