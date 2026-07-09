/**
 * Shared domain types for the Audio Annotator, derived from data-model.md.
 * These are storage- and framework-agnostic.
 */

export const SCHEMA_VERSION = 1;

export type SupportedMimeType =
  | 'audio/mpeg'
  | 'audio/wav'
  | 'audio/x-wav'
  | 'audio/ogg'
  | 'audio/mp4'
  | 'audio/aac'
  | 'audio/flac'
  | 'audio/x-flac';

export interface Project {
  id: string;
  title: string;
  audioId: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  id: string;
  title: string;
  updatedAt: string;
}

/** Audio metadata as persisted/serialized. The binary Blob is stored separately. */
export interface AudioMeta {
  id: string;
  fileName: string;
  mimeType: string;
  durationSec: number;
  byteSize: number;
}

/** Audio record in storage (metadata + binary). */
export interface AudioRecord extends AudioMeta {
  blob: Blob;
}

export type AnnotationKind = 'point' | 'region';

export interface Annotation {
  id: string;
  projectId: string;
  kind: AnnotationKind;
  startSec: number;
  /** null for point annotations; start < endSec <= duration for regions. */
  endSec: number | null;
  note: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface Reply {
  id: string;
  annotationId: string;
  text: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

/** A project fully loaded into memory, used for export/merge. */
export interface FullProject {
  project: Project;
  audio: AudioMeta;
  annotations: Annotation[];
  replies: Reply[];
}
