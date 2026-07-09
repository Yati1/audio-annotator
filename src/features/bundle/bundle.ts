/**
 * Bundle serialization: the interchange format shared between users. A zip containing
 * `annotations.json` (schema-versioned) plus the original audio under `audio/`
 * (contracts/bundle-format.md). Uses `fflate` for small, fast, in-browser zipping.
 */
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import type { Annotation, AudioMeta, FullProject, Project, Reply } from '../types';
import { SCHEMA_VERSION } from '../types';

export interface ManifestReply {
  id: string;
  text: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface ManifestAnnotation {
  id: string;
  kind: 'point' | 'region';
  startSec: number;
  endSec: number | null;
  note: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
  replies: ManifestReply[];
}

export interface Manifest {
  schemaVersion: number;
  project: Pick<Project, 'id' | 'title' | 'createdAt' | 'updatedAt'>;
  audio: AudioMeta & { path: string };
  annotations: ManifestAnnotation[];
}

function stableSort<T extends { createdAt: string; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.createdAt !== b.createdAt
      ? a.createdAt < b.createdAt
        ? -1
        : 1
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0,
  );
}

export function buildManifest(full: FullProject): Manifest {
  const repliesByAnno = new Map<string, Reply[]>();
  for (const r of full.replies) {
    (
      repliesByAnno.get(r.annotationId) ??
      repliesByAnno.set(r.annotationId, []).get(r.annotationId)!
    ).push(r);
  }
  const annotations: ManifestAnnotation[] = stableSort(full.annotations).map((a) => ({
    id: a.id,
    kind: a.kind,
    startSec: a.startSec,
    endSec: a.endSec,
    note: a.note,
    authorName: a.authorName,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    deleted: a.deleted,
    replies: stableSort(repliesByAnno.get(a.id) ?? []).map((r) => ({
      id: r.id,
      text: r.text,
      authorName: r.authorName,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      deleted: r.deleted,
    })),
  }));

  return {
    schemaVersion: SCHEMA_VERSION,
    project: {
      id: full.project.id,
      title: full.project.title,
      createdAt: full.project.createdAt,
      updatedAt: full.project.updatedAt,
    },
    audio: { ...full.audio, path: `audio/${full.audio.fileName}` },
    annotations,
  };
}

/** Serializes a project to a zip Blob (audio + annotations.json). */
export function exportBundle(full: FullProject, audioBytes: Uint8Array): Blob {
  const manifest = buildManifest(full);
  const zipped = zipSync({
    'annotations.json': strToU8(JSON.stringify(manifest, null, 2)),
    [`audio/${full.audio.fileName}`]: audioBytes,
  });
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
}

// ---- Import ----

export type ImportErrorCode =
  'E_NOT_ZIP' | 'E_NO_MANIFEST' | 'E_NO_AUDIO' | 'E_SCHEMA' | 'E_VERSION' | 'E_AUDIO_TYPE';

export interface ImportError {
  code: ImportErrorCode;
  message: string;
}

export interface ImportResult {
  full: FullProject;
  audioBlob: Blob;
}

const SUPPORTED_MIME = new Set<string>([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/aac',
  'audio/flac',
  'audio/x-flac',
]);

function validateManifest(m: unknown): m is Manifest {
  if (!m || typeof m !== 'object') return false;
  const obj = m as Record<string, unknown>;
  if (typeof obj.schemaVersion !== 'number') return false;
  if (!obj.project || typeof obj.project !== 'object') return false;
  if (!obj.audio || typeof obj.audio !== 'object') return false;
  if (!Array.isArray(obj.annotations)) return false;
  return true;
}

/** Parses and validates a bundle file. Never mutates local data. */
export function parseBundle(bytes: Uint8Array):
  | { ok: true; result: ImportResult }
  | {
      ok: false;
      error: ImportError;
    } {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    return { ok: false, error: { code: 'E_NOT_ZIP', message: 'File is not a valid zip.' } };
  }

  const manifestBytes = entries['annotations.json'];
  if (!manifestBytes) {
    return {
      ok: false,
      error: { code: 'E_NO_MANIFEST', message: 'Bundle is missing annotations.json.' },
    };
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes));
  } catch {
    return {
      ok: false,
      error: { code: 'E_SCHEMA', message: 'annotations.json is not valid JSON.' },
    };
  }
  if (!validateManifest(manifest)) {
    return {
      ok: false,
      error: { code: 'E_SCHEMA', message: 'annotations.json failed validation.' },
    };
  }
  if (manifest.schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      error: { code: 'E_VERSION', message: 'This bundle was made with a newer app version.' },
    };
  }
  if (!SUPPORTED_MIME.has(manifest.audio.mimeType)) {
    return {
      ok: false,
      error: { code: 'E_AUDIO_TYPE', message: 'Unsupported audio format in bundle.' },
    };
  }

  const audioBytes = entries[manifest.audio.path];
  if (!audioBytes) {
    return {
      ok: false,
      error: { code: 'E_NO_AUDIO', message: 'Bundle is missing its audio file.' },
    };
  }

  const annotations: Annotation[] = [];
  const replies: Reply[] = [];
  for (const a of manifest.annotations) {
    annotations.push({
      id: a.id,
      projectId: manifest.project.id,
      kind: a.kind,
      startSec: a.startSec,
      endSec: a.endSec,
      note: a.note,
      authorName: a.authorName,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      deleted: a.deleted,
    });
    for (const r of a.replies ?? []) {
      replies.push({
        id: r.id,
        annotationId: a.id,
        text: r.text,
        authorName: r.authorName,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        deleted: r.deleted,
      });
    }
  }

  const full: FullProject = {
    project: {
      id: manifest.project.id,
      title: manifest.project.title,
      audioId: manifest.audio.id,
      schemaVersion: manifest.schemaVersion,
      createdAt: manifest.project.createdAt,
      updatedAt: manifest.project.updatedAt,
    },
    audio: {
      id: manifest.audio.id,
      fileName: manifest.audio.fileName,
      mimeType: manifest.audio.mimeType,
      durationSec: manifest.audio.durationSec,
      byteSize: manifest.audio.byteSize,
    },
    annotations,
    replies,
  };

  const audioBlob = new Blob([audioBytes.buffer as ArrayBuffer], { type: manifest.audio.mimeType });
  return { ok: true, result: { full, audioBlob } };
}
