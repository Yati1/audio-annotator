/**
 * Central application store (zustand). Orchestrates feature services and persistence and
 * exposes actions to components. Contains no validation/merge/zip logic itself — that lives
 * in `features/*`.
 */
import { create } from 'zustand';
import { audioService } from '../features/audio/audio';
import { annotationService } from '../features/annotations/annotations';
import { replyService } from '../features/replies/replies';
import { storage } from '../features/storage/storage';
import { exportBundle, parseBundle } from '../features/bundle/bundle';
import { merge } from '../features/bundle/merge';
import { isErr } from '../lib/result';
import { newId } from '../lib/id';
import { nowIso } from '../lib/time';
import { pickAuthorColor } from '../lib/color';
import type { Annotation, AudioMeta, FullProject, Project, Reply } from '../features/types';
import { SCHEMA_VERSION } from '../features/types';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AppState {
  status: LoadStatus;
  error: string | null;
  notice: string | null;

  displayName: string;
  authorId: string;
  /** This device's assigned color; empty until first authored (see `ensureAuthorColor`). */
  authorColor: string;

  project: Project | null;
  audio: AudioMeta | null;
  objectUrl: string | null;
  annotations: Annotation[];
  repliesByAnnotation: Record<string, Reply[]>;

  // lifecycle
  init(): Promise<void>;
  setDisplayName(name: string): Promise<void>;
  loadAudioFile(file: File): Promise<void>;
  clearError(): void;
  clearNotice(): void;

  // annotations (US1)
  addPoint(startSec: number, note: string): Promise<string | null>;
  addRegion(startSec: number, endSec: number, note: string): Promise<string | null>;
  editAnnotation(
    id: string,
    patch: Partial<Pick<Annotation, 'note' | 'startSec' | 'endSec'>>,
  ): Promise<void>;
  deleteAnnotation(id: string): Promise<void>;

  // replies (US2)
  addReply(annotationId: string, text: string): Promise<void>;
  editReply(annotationId: string, replyId: string, text: string): Promise<void>;
  deleteReply(annotationId: string, replyId: string): Promise<void>;

  // used by import (US3)
  setLoadedProject(full: FullProject, objectUrl: string): void;
  getCurrentFull(): FullProject | null;
  exportBundle(): Promise<Blob | null>;
  importBundle(file: File): Promise<{ added: number; conflicts: number } | null>;
}

const LARGE_FILE_BYTES = 150 * 1024 * 1024;

export const useStore = create<AppState>((set, get) => ({
  status: 'idle',
  error: null,
  notice: null,
  displayName: '',
  authorId: '',
  authorColor: '',
  project: null,
  audio: null,
  objectUrl: null,
  annotations: [],
  repliesByAnnotation: {},

  async init() {
    set({ status: 'loading' });
    await storage.init();
    const name = (await storage.getSession<string>('displayName')) ?? '';
    let authorId = await storage.getSession<string>('authorId');
    if (!authorId) {
      authorId = newId();
      await storage.setSession('authorId', authorId);
    }
    const authorColor = (await storage.getSession<string>('authorColor')) ?? '';
    set({ displayName: name, authorId, authorColor });

    const restored = await restoreLatestProject();
    if (!restored) {
      set({ status: 'idle' });
      return;
    }
    get().setLoadedProject(restored.full, restored.objectUrl);
    // Resolve now (rather than waiting for the first write) so the waveform has a color
    // to render its drag-selection preview with as soon as it mounts.
    await ensureAuthorColor(get, set);
  },

  async setDisplayName(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const oldName = get().displayName;
    set({ displayName: trimmed });
    await storage.setSession('displayName', trimmed);

    if (oldName === trimmed) return;
    await renameAuthoredContent(get, set, trimmed);
  },

  async loadAudioFile(file) {
    set({ status: 'loading', error: null, notice: null });
    const result = await audioService.load(file);
    if (isErr(result)) {
      set({ status: 'error', error: result.error.message });
      return;
    }
    const { record, objectUrl } = result.value;
    const now = nowIso();
    const project: Project = {
      id: newId(),
      title: file.name.replace(/\.[^.]+$/, ''),
      audioId: record.id,
      schemaVersion: SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    };
    await storage.putAudio(record);
    await storage.putProject(project);

    const audio: AudioMeta = {
      id: record.id,
      fileName: record.fileName,
      mimeType: record.mimeType,
      durationSec: record.durationSec,
      byteSize: record.byteSize,
    };

    const prev = get().objectUrl;
    if (prev) audioService.revoke(prev);

    set({
      status: 'ready',
      project,
      audio,
      objectUrl,
      annotations: [],
      repliesByAnnotation: {},
      notice: file.size > LARGE_FILE_BYTES ? 'Large file — playback may be slow.' : null,
    });
    await ensureAuthorColor(get, set);
  },

  clearError() {
    set({ error: null });
  },

  clearNotice() {
    set({ notice: null });
  },

  async addPoint(startSec, note) {
    // ensureAuthorColor awaits an IndexedDB write on first use; re-read state afterward
    // rather than snapshotting before it, so a concurrent rename/project-switch during
    // that window isn't stamped onto this annotation with stale values.
    const authorColor = await ensureAuthorColor(get, set);
    const { project, audio, displayName, authorId } = get();
    if (!project || !audio) return null;
    const res = annotationService.createPoint(
      {
        projectId: project.id,
        startSec,
        note,
        authorName: displayName || 'Anonymous',
        authorColor,
        authorId,
      },
      audio.durationSec,
    );
    if (isErr(res)) {
      set({ error: res.error.message });
      return null;
    }
    await persistAnnotation(get, set, res.value);
    return res.value.id;
  },

  async addRegion(startSec, endSec, note) {
    const authorColor = await ensureAuthorColor(get, set);
    const { project, audio, displayName, authorId } = get();
    if (!project || !audio) return null;
    const res = annotationService.createRegion(
      {
        projectId: project.id,
        startSec,
        endSec,
        note,
        authorName: displayName || 'Anonymous',
        authorColor,
        authorId,
      },
      audio.durationSec,
    );
    if (isErr(res)) {
      set({ error: res.error.message });
      return null;
    }
    await persistAnnotation(get, set, res.value);
    return res.value.id;
  },

  async editAnnotation(id, patch) {
    const { annotations, audio } = get();
    const current = annotations.find((a) => a.id === id);
    if (!current || !audio) return;
    const res = annotationService.edit(current, patch, audio.durationSec);
    if (isErr(res)) {
      set({ error: res.error.message });
      return;
    }
    await persistAnnotation(get, set, res.value);
  },

  async deleteAnnotation(id) {
    const { annotations } = get();
    const current = annotations.find((a) => a.id === id);
    if (!current) return;
    const tombstoned = annotationService.remove(current);
    await persistAnnotation(get, set, tombstoned);
  },

  async addReply(annotationId, text) {
    const authorColor = await ensureAuthorColor(get, set);
    const { displayName, authorId } = get();
    const res = replyService.add({
      annotationId,
      text,
      authorName: displayName || 'Anonymous',
      authorColor,
      authorId,
    });
    if (isErr(res)) {
      set({ error: res.error.message });
      return;
    }
    await persistReply(get, set, res.value);
  },

  async editReply(annotationId, replyId, text) {
    const list = get().repliesByAnnotation[annotationId] ?? [];
    const current = list.find((r) => r.id === replyId);
    if (!current) return;
    const res = replyService.edit(current, text);
    if (isErr(res)) {
      set({ error: res.error.message });
      return;
    }
    await persistReply(get, set, res.value);
  },

  async deleteReply(annotationId, replyId) {
    const list = get().repliesByAnnotation[annotationId] ?? [];
    const current = list.find((r) => r.id === replyId);
    if (!current) return;
    await persistReply(get, set, replyService.remove(current));
  },

  setLoadedProject(full, objectUrl) {
    const prev = get().objectUrl;
    if (prev) audioService.revoke(prev);
    const repliesByAnnotation: Record<string, Reply[]> = {};
    for (const r of full.replies) {
      (repliesByAnnotation[r.annotationId] ??= []).push(r);
    }
    set({
      status: 'ready',
      error: null,
      project: full.project,
      audio: full.audio,
      objectUrl,
      annotations: full.annotations.filter((a) => !a.deleted),
      repliesByAnnotation,
    });
  },

  getCurrentFull() {
    const { project, audio, annotations, repliesByAnnotation } = get();
    if (!project || !audio) return null;
    const replies = Object.values(repliesByAnnotation).flat();
    return { project, audio, annotations, replies };
  },

  async exportBundle() {
    const full = get().getCurrentFull();
    if (!full) return null;
    const blob = await storage.getAudioBlob(full.audio.id);
    if (!blob) {
      set({ error: 'Audio data is missing; cannot export.' });
      return null;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return exportBundle(full, bytes);
  },

  async importBundle(file) {
    set({ status: 'loading', error: null, notice: null });
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      set({ status: get().project ? 'ready' : 'idle', error: 'Could not read the file.' });
      return null;
    }
    const parsed = parseBundle(bytes);
    if (!parsed.ok) {
      // Leave existing local data intact (FR-026).
      set({ status: get().project ? 'ready' : 'idle', error: parsed.error.message });
      return null;
    }

    const { full: incoming, audioBlob } = parsed.result;
    const current = get().getCurrentFull();
    const sameOriginal = current?.project.id === incoming.project.id ? current : null;
    const outcome = merge(sameOriginal, incoming);

    // Persist audio, project, and merged records.
    await storage.putAudio({
      id: incoming.audio.id,
      fileName: incoming.audio.fileName,
      mimeType: incoming.audio.mimeType,
      durationSec: incoming.audio.durationSec,
      byteSize: incoming.audio.byteSize,
      blob: audioBlob,
    });
    await storage.putProject(outcome.project.project);
    await storage.putAnnotations(outcome.project.annotations);
    await storage.putReplies(outcome.project.replies);

    const objectUrl = URL.createObjectURL(audioBlob);
    get().setLoadedProject(outcome.project, objectUrl);
    // Resolve now, so a device's first-ever color pick can see collaborators' colors
    // already present in the just-imported project and avoid an obvious clash.
    await ensureAuthorColor(get, set);
    return {
      added: outcome.added.annotations + outcome.added.replies,
      conflicts: outcome.conflicts.length,
    };
  },
}));

async function persistAnnotation(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
  annotation: Annotation,
): Promise<void> {
  await storage.putAnnotations([annotation]);
  const existing = get().annotations;
  const next = existing.some((a) => a.id === annotation.id)
    ? existing.map((a) => (a.id === annotation.id ? annotation : a))
    : [...existing, annotation];
  set({ annotations: next.filter((a) => !a.deleted) });
  await touchProject(get, set);
}

async function persistReply(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
  reply: Reply,
): Promise<void> {
  await storage.putReplies([reply]);
  const map = { ...get().repliesByAnnotation };
  const list = map[reply.annotationId] ?? [];
  map[reply.annotationId] = list.some((r) => r.id === reply.id)
    ? list.map((r) => (r.id === reply.id ? reply : r))
    : [...list, reply];
  set({ repliesByAnnotation: map });
  await touchProject(get, set);
}

/**
 * Returns this device's author color, assigning one on first use. Deferred until the first
 * authored write (rather than at `init()`) so that if the user imports a shared project
 * before adding their own content, the assignment can see which colors collaborators
 * already have and avoid them.
 */
async function ensureAuthorColor(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
): Promise<string> {
  const existing = get().authorColor;
  if (existing) return existing;

  const { authorId, annotations, repliesByAnnotation } = get();
  const usedByOthers = new Set<string>();
  for (const a of annotations) {
    if (a.authorId !== authorId) usedByOthers.add(a.authorColor);
  }
  for (const r of Object.values(repliesByAnnotation).flat()) {
    if (r.authorId !== authorId) usedByOthers.add(r.authorColor);
  }

  const color = pickAuthorColor(usedByOthers, authorId);
  set({ authorColor: color });
  await storage.setSession('authorColor', color);
  return color;
}

/** Authored records whose `authorId` matches, with `authorName`/`updatedAt` stamped anew. */
function withRenamedAuthor<T extends { authorId?: string; authorName: string; updatedAt: string }>(
  items: T[],
  authorId: string,
  newName: string,
  now: string,
): T[] {
  return items
    .filter((item) => item.authorId === authorId && item.authorName !== newName)
    .map((item) => ({ ...item, authorName: newName, updatedAt: now }));
}

/**
 * Rewrites `authorName` to `newName` on annotations/replies in the current project that
 * this device authored (matched by `authorId`), so a rename reflects on past content
 * without touching anything authored by someone else or in another project.
 */
async function renameAuthoredContent(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
  newName: string,
): Promise<void> {
  const { authorId } = get();
  const now = nowIso();

  const updatedAnnotations = withRenamedAuthor(get().annotations, authorId, newName, now);
  if (updatedAnnotations.length > 0) {
    await storage.putAnnotations(updatedAnnotations);
    // Re-read state after the await and splice in only the renamed fields (rather than
    // substituting the whole pre-await snapshot), so a concurrent edit to another field on
    // the same record during the write isn't reverted.
    const renamedIds = new Set(updatedAnnotations.map((a) => a.id));
    const fresh = get().annotations;
    set({
      annotations: fresh
        .map((a) => (renamedIds.has(a.id) ? { ...a, authorName: newName, updatedAt: now } : a))
        .filter((a) => !a.deleted),
    });
  }

  const allReplies = Object.values(get().repliesByAnnotation).flat();
  const updatedReplies = withRenamedAuthor(allReplies, authorId, newName, now);
  if (updatedReplies.length > 0) {
    await storage.putReplies(updatedReplies);
    const renamedReplyIds = new Set(updatedReplies.map((r) => r.id));
    const fresh = get().repliesByAnnotation;
    const next: Record<string, Reply[]> = {};
    for (const [annotationId, list] of Object.entries(fresh)) {
      next[annotationId] = list.map((r) =>
        renamedReplyIds.has(r.id) ? { ...r, authorName: newName, updatedAt: now } : r,
      );
    }
    set({ repliesByAnnotation: next });
  }

  if (updatedAnnotations.length > 0 || updatedReplies.length > 0) {
    await touchProject(get, set);
  }
}

/** Restores the most-recently-updated project (audio + annotations + replies) on load. */
async function restoreLatestProject(): Promise<{ full: FullProject; objectUrl: string } | null> {
  const [latest] = await storage.listProjects();
  if (!latest) return null;

  const project = await storage.getProject(latest.id);
  if (!project) return null;

  const audioRecord = await storage.getAudio(project.audioId);
  if (!audioRecord) return null;

  const audio: AudioMeta = {
    id: audioRecord.id,
    fileName: audioRecord.fileName,
    mimeType: audioRecord.mimeType,
    durationSec: audioRecord.durationSec,
    byteSize: audioRecord.byteSize,
  };
  const objectUrl = URL.createObjectURL(audioRecord.blob);

  const annotations = await storage.listAnnotations(project.id);
  const replyLists = await Promise.all(annotations.map((a) => storage.listReplies(a.id)));

  return { full: { project, audio, annotations, replies: replyLists.flat() }, objectUrl };
}

async function touchProject(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
): Promise<void> {
  const project = get().project;
  if (!project) return;
  const updated = { ...project, updatedAt: nowIso() };
  await storage.putProject(updated);
  set({ project: updated });
}
