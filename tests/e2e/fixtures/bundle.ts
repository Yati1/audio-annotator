/**
 * Bundle (.aannz zip) fixtures for E2E tests. Valid bundles reuse the app's own
 * `buildManifest`/`exportBundle` so fixtures never drift from the real schema; only the
 * deliberately-broken cases are hand-built.
 */
import { zipSync, strToU8 } from 'fflate';
import { buildManifest, exportBundle } from '../../../src/features/bundle/bundle';
import { newId } from '../../../src/lib/id';
import { nowIso } from '../../../src/lib/time';
import { SCHEMA_VERSION, type FullProject } from '../../../src/features/types';

export function makeFullProject(overrides: Partial<FullProject> = {}): FullProject {
  const now = nowIso();
  const audioId = newId();
  return {
    project: {
      id: newId(),
      title: 'Fixture project',
      audioId: audioId,
      schemaVersion: SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    },
    audio: {
      id: audioId,
      fileName: 'clip-a.wav',
      mimeType: 'audio/wav',
      durationSec: 2,
      byteSize: 2044,
    },
    annotations: [],
    replies: [],
    ...overrides,
  };
}

export async function buildValidBundle(full: FullProject, audioBytes: Uint8Array): Promise<Buffer> {
  const blob = exportBundle(full, audioBytes);
  return Buffer.from(await blob.arrayBuffer());
}

export function buildBundleMissingAudio(full: FullProject): Buffer {
  const manifest = buildManifest(full);
  return Buffer.from(zipSync({ 'annotations.json': strToU8(JSON.stringify(manifest)) }));
}

export function buildBundleWithNewerSchema(full: FullProject, audioBytes: Uint8Array): Buffer {
  const manifest = { ...buildManifest(full), schemaVersion: SCHEMA_VERSION + 1 };
  return Buffer.from(
    zipSync({
      'annotations.json': strToU8(JSON.stringify(manifest)),
      [`audio/${full.audio.fileName}`]: audioBytes,
    }),
  );
}

export function corruptZipBytes(): Buffer {
  return Buffer.from('not a zip file, just truncated garbage bytes');
}
