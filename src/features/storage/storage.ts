/**
 * IndexedDB-backed local persistence (StoragePort) per
 * contracts/storage-and-modules.md. Audio blobs live in their own store so metadata
 * queries never load large binaries. All errors are returned as thrown rejections at the
 * DB boundary and wrapped by callers into Result values.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Annotation, AudioRecord, Project, ProjectSummary, Reply } from '../types';

interface AnnotatorDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { updatedAt: string };
  };
  audio: {
    key: string;
    value: AudioRecord;
  };
  annotations: {
    key: string;
    value: Annotation;
    indexes: { projectId: string };
  };
  replies: {
    key: string;
    value: Reply;
    indexes: { annotationId: string };
  };
  sessionMeta: {
    key: string;
    value: { key: string; value: unknown };
  };
}

const DB_NAME = 'audio-annotator';
const DB_VERSION = 1;

let currentDbName = DB_NAME;
let dbPromise: Promise<IDBPDatabase<AnnotatorDB>> | null = null;

function getDb(): Promise<IDBPDatabase<AnnotatorDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AnnotatorDB>(currentDbName, DB_VERSION, {
      upgrade(db) {
        const projects = db.createObjectStore('projects', { keyPath: 'id' });
        projects.createIndex('updatedAt', 'updatedAt');

        db.createObjectStore('audio', { keyPath: 'id' });

        const annotations = db.createObjectStore('annotations', { keyPath: 'id' });
        annotations.createIndex('projectId', 'projectId');

        const replies = db.createObjectStore('replies', { keyPath: 'id' });
        replies.createIndex('annotationId', 'annotationId');

        db.createObjectStore('sessionMeta', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

function byCreatedAt<T extends { createdAt: string }>(a: T, b: T): number {
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

export interface StoragePort {
  init(): Promise<void>;
  putProject(p: Project): Promise<void>;
  getProject(id: string): Promise<Project | undefined>;
  listProjects(): Promise<ProjectSummary[]>;
  deleteProject(id: string): Promise<void>;
  putAudio(a: AudioRecord): Promise<void>;
  getAudioBlob(id: string): Promise<Blob | undefined>;
  putAnnotations(items: Annotation[]): Promise<void>;
  listAnnotations(projectId: string): Promise<Annotation[]>;
  putReplies(items: Reply[]): Promise<void>;
  listReplies(annotationId: string): Promise<Reply[]>;
  getSession<T>(key: string): Promise<T | undefined>;
  setSession<T>(key: string, value: T): Promise<void>;
}

export const storage: StoragePort = {
  async init() {
    await getDb();
  },

  async putProject(p) {
    const db = await getDb();
    await db.put('projects', p);
  },

  async getProject(id) {
    const db = await getDb();
    return db.get('projects', id);
  },

  async listProjects() {
    const db = await getDb();
    const all = await db.getAll('projects');
    return all
      .map((p) => ({ id: p.id, title: p.title, updatedAt: p.updatedAt }))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  },

  async deleteProject(id) {
    const db = await getDb();
    const tx = db.transaction(['projects', 'audio', 'annotations', 'replies'], 'readwrite');
    const project = await tx.objectStore('projects').get(id);
    const annotations = await tx.objectStore('annotations').index('projectId').getAll(id);
    await tx.objectStore('projects').delete(id);
    if (project) await tx.objectStore('audio').delete(project.audioId);
    for (const a of annotations) {
      await tx.objectStore('annotations').delete(a.id);
      const replies = await tx.objectStore('replies').index('annotationId').getAll(a.id);
      for (const r of replies) await tx.objectStore('replies').delete(r.id);
    }
    await tx.done;
  },

  async putAudio(a) {
    const db = await getDb();
    await db.put('audio', a);
  },

  async getAudioBlob(id) {
    const db = await getDb();
    const rec = await db.get('audio', id);
    return rec?.blob;
  },

  async putAnnotations(items) {
    if (items.length === 0) return;
    const db = await getDb();
    const tx = db.transaction('annotations', 'readwrite');
    for (const item of items) await tx.store.put(item);
    await tx.done;
  },

  async listAnnotations(projectId) {
    const db = await getDb();
    const items = await db.getAllFromIndex('annotations', 'projectId', projectId);
    return items.sort(byCreatedAt);
  },

  async putReplies(items) {
    if (items.length === 0) return;
    const db = await getDb();
    const tx = db.transaction('replies', 'readwrite');
    for (const item of items) await tx.store.put(item);
    await tx.done;
  },

  async listReplies(annotationId) {
    const db = await getDb();
    const items = await db.getAllFromIndex('replies', 'annotationId', annotationId);
    return items.sort(byCreatedAt);
  },

  async getSession<T>(key: string): Promise<T | undefined> {
    const db = await getDb();
    const row = await db.get('sessionMeta', key);
    return row?.value as T | undefined;
  },

  async setSession<T>(key: string, value: T): Promise<void> {
    const db = await getDb();
    await db.put('sessionMeta', { key, value });
  },
};

/** Test-only: reset the cached DB handle so a fresh fake-indexeddb can be used. */
let _testDbCounter = 0;
export function _resetDbForTests(): void {
  dbPromise = null;
  currentDbName = `${DB_NAME}-test-${++_testDbCounter}`;
}
