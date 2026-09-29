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
/** 2: records must carry `authorId`. Upgrading from 1 wipes stored projects (see below). */
const DB_VERSION = 2;

let currentDbName = DB_NAME;
let dbPromise: Promise<IDBPDatabase<AnnotatorDB>> | null = null;

/** Why `init` fails while another tab still has an older version of the database open. */
export const DB_BLOCKED_MESSAGE =
  'Close other Audio Annotator tabs, then reload this page to finish updating.';

function getDb(): Promise<IDBPDatabase<AnnotatorDB>> {
  if (!dbPromise) {
    const opening = new Promise<IDBPDatabase<AnnotatorDB>>((resolve, reject) => {
      let db: IDBPDatabase<AnnotatorDB> | undefined;
      let gaveUp = false;
      openDB<AnnotatorDB>(currentDbName, DB_VERSION, {
        upgrade(db, oldVersion, _newVersion, tx) {
          if (oldVersion < 1) {
            const projects = db.createObjectStore('projects', { keyPath: 'id' });
            projects.createIndex('updatedAt', 'updatedAt');

            db.createObjectStore('audio', { keyPath: 'id' });

            const annotations = db.createObjectStore('annotations', { keyPath: 'id' });
            annotations.createIndex('projectId', 'projectId');

            const replies = db.createObjectStore('replies', { keyPath: 'id' });
            replies.createIndex('annotationId', 'annotationId');

            db.createObjectStore('sessionMeta', { keyPath: 'key' });
          }
          if (oldVersion === 1) {
            // Version 1 records may lack `authorId`, which is now required, so drop every
            // stored project. Session values (name, authorId, color) are kept.
            void tx.objectStore('projects').clear();
            void tx.objectStore('audio').clear();
            void tx.objectStore('annotations').clear();
            void tx.objectStore('replies').clear();
          }
        },
        blocked() {
          // Another tab holds an older version open, so the upgrade waits until that tab
          // closes. Fail now so the user learns why, instead of watching a spinner.
          gaveUp = true;
          if (dbPromise === opening) dbPromise = null;
          reject(new Error(DB_BLOCKED_MESSAGE));
        },
        blocking() {
          // A newer version of the app is waiting to upgrade in another tab; let it.
          db?.close();
          if (dbPromise === opening) dbPromise = null;
        },
      }).then((opened) => {
        // The open went through after we gave up; don't hold a connection nobody uses.
        if (gaveUp) opened.close();
        else resolve((db = opened));
      }, reject);
    });
    dbPromise = opening;
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
  getAudio(id: string): Promise<AudioRecord | undefined>;
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
    // Keep audio another project still uses.
    const others = await tx.objectStore('projects').getAll();
    if (project && !others.some((p) => p.audioId === project.audioId)) {
      await tx.objectStore('audio').delete(project.audioId);
    }
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

  async getAudio(id) {
    const db = await getDb();
    return db.get('audio', id);
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

/** Test-only: reset the cached DB handle so a fresh fake-indexeddb can be used. Returns
 *  the new database name. */
let _testDbCounter = 0;
export function _resetDbForTests(): string {
  dbPromise = null;
  currentDbName = `${DB_NAME}-test-${++_testDbCounter}`;
  return currentDbName;
}
