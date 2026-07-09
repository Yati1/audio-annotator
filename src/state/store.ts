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
import type { Annotation, AudioMeta, FullProject, Project, Reply } from '../features/types';
import { SCHEMA_VERSION } from '../features/types';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AppState {
  status: LoadStatus;
  error: string | null;
  notice: string | null;

  displayName: string;

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
  project: null,
  audio: null,
  objectUrl: null,
  annotations: [],
  repliesByAnnotation: {},

  async init() {
    await storage.init();
    const name = (await storage.getSession<string>('displayName')) ?? '';
    set({ displayName: name });
  },

  async setDisplayName(name) {
    set({ displayName: name });
    await storage.setSession('displayName', name);
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
  },

  clearError() {
    set({ error: null });
  },

  clearNotice() {
    set({ notice: null });
  },

  async addPoint(startSec, note) {
    const { project, audio, displayName } = get();
    if (!project || !audio) return null;
    const res = annotationService.createPoint(
      { projectId: project.id, startSec, note, authorName: displayName || 'Anonymous' },
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
    const { project, audio, displayName } = get();
    if (!project || !audio) return null;
    const res = annotationService.createRegion(
      { projectId: project.id, startSec, endSec, note, authorName: displayName || 'Anonymous' },
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
    const { displayName } = get();
    const res = replyService.add({
      annotationId,
      text,
      authorName: displayName || 'Anonymous',
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
