# Contract: Local Storage & Internal Module Interfaces

Defines the IndexedDB persistence schema (FR-011/FR-016/FR-017) and the framework-agnostic
module boundaries in `src/features/*`. These are internal contracts that keep domain logic
testable (Constitution I/II) and decoupled from React and from wavesurfer.

## IndexedDB schema

**Database**: `audio-annotator` — **version**: `1`

| Object store  | Key   | Indexes                                    | Holds                                                                    |
| ------------- | ----- | ------------------------------------------ | ------------------------------------------------------------------------ |
| `projects`    | `id`  | `updatedAt`                                | Project metadata (no binary)                                             |
| `audio`       | `id`  | —                                          | `{ id, fileName, mimeType, durationSec, byteSize, blob }` (audio `Blob`) |
| `annotations` | `id`  | `projectId`, `[projectId+createdAt]`       | Annotation records (replies stored separately)                           |
| `replies`     | `id`  | `annotationId`, `[annotationId+createdAt]` | Reply records                                                            |
| `sessionMeta` | `key` | —                                          | Singleton UI/session values, e.g. `{ key: "displayName", value: "Sam" }` |

Notes:

- Audio blobs live in their own store so metadata queries never load large binaries.
- Replies are flattened into their own store for indexed chronological reads (FR-014); the
  bundle nests them for readability (see bundle-format.md).
- All writes for a single user action occur in one transaction to avoid partial state.

## Module: `storage` (`src/features/storage`)

```ts
interface StoragePort {
  init(): Promise<void>;

  putProject(p: Project): Promise<void>;
  getProject(id: string): Promise<Project | undefined>;
  listProjects(): Promise<ProjectSummary[]>;
  deleteProject(id: string): Promise<void>; // cascades audio/annotations/replies

  putAudio(a: AudioRecord): Promise<void>; // includes Blob
  getAudioBlob(id: string): Promise<Blob | undefined>;

  putAnnotations(items: Annotation[]): Promise<void>;
  listAnnotations(projectId: string): Promise<Annotation[]>; // ordered by createdAt

  putReplies(items: Reply[]): Promise<void>;
  listReplies(annotationId: string): Promise<Reply[]>; // ordered by createdAt

  getSession<T>(key: string): Promise<T | undefined>;
  setSession<T>(key: string, value: T): Promise<void>;
}
```

Errors surface as typed `Result` values (`src/lib/result.ts`), never thrown across the port
boundary, so the UI can render explicit error states (FR-022).

## Module: `audio` (`src/features/audio`)

```ts
interface AudioService {
  // Validates MIME against supported set (FR-030); returns metadata + object URL.
  load(file: File): Promise<Result<{ record: AudioRecord; objectUrl: string }, AudioError>>;
  revoke(objectUrl: string): void;
}
// AudioError includes E_AUDIO_TYPE (unsupported), E_DECODE (unreadable).
```

Playback itself (play/pause/seek, region playback FR-003) is driven by the `WaveformView`
component wrapping wavesurfer; the service only concerns load/validate/metadata so it is
unit-testable without the DOM.

## Module: `annotations` (`src/features/annotations`)

```ts
interface AnnotationService {
  createPoint(input: {
    projectId;
    startSec;
    note;
    authorName;
  }): Result<Annotation, ValidationError>;
  createRegion(input: {
    projectId;
    startSec;
    endSec;
    note;
    authorName;
  }): Result<Annotation, ValidationError>;
  edit(
    id: string,
    patch: Partial<Pick<Annotation, 'note' | 'startSec' | 'endSec'>>,
  ): Result<Annotation, ValidationError>;
  remove(id: string): Annotation; // returns tombstoned record (soft delete)
  validate(a: Annotation, durationSec: number): Result<Annotation, ValidationError>;
}
```

`validate` enforces the data-model rules (point ⇒ `endSec===null`; region ⇒
`start<end<=duration`; non-empty note) — FR-010. Pure and fully unit-tested.

## Module: `replies` (`src/features/replies`)

```ts
interface ReplyService {
  add(input: { annotationId; text; authorName }): Result<Reply, ValidationError>;
  edit(id: string, text: string): Result<Reply, ValidationError>;
  remove(id: string): Reply; // tombstone
  ordered(replies: Reply[]): Reply[]; // chronological, excludes tombstones for display
}
```

## Module: `bundle` (`src/features/bundle`)

```ts
interface BundleService {
  export(project: FullProject): Promise<Blob>; // zip (fflate)
  import(file: File): Promise<Result<ImportResult, ImportError>>;
  merge(local: FullProject | null, incoming: FullProject): MergeOutcome;
}

type MergeOutcome = {
  project: FullProject;
  added: { annotations: number; replies: number };
  conflicts: Array<{ kind: 'annotation' | 'reply'; id: string }>; // divergent same-id edits
};
```

### `merge` contract (FR-027/FR-028; data-model "import/merge")

Pure function, deterministic, unit-tested:

- Union by `id` for annotations and replies.
- Same `id` present in both:
  - if either side `deleted` ⇒ result is `deleted` (tombstone wins, no resurrection);
  - else if content equal ⇒ keep one;
  - else (divergent edits) ⇒ keep both by preserving the local and recording the incoming
    as a flagged conflict (no silent overwrite — spec edge case).
- New `id` on either side ⇒ include.
- `ImportError` mirrors the bundle-format taxonomy (`E_NOT_ZIP`, `E_NO_MANIFEST`,
  `E_NO_AUDIO`, `E_SCHEMA`, `E_VERSION`, `E_AUDIO_TYPE`). On any error, local data is
  untouched (FR-026).

## Module: `state` (`src/state/store.ts`)

A single `zustand` store composes the services and exposes actions to components. It never
contains validation/merge/zip logic itself (that stays in `features/*`); it orchestrates
and persists via `StoragePort`, keeping components thin (Constitution I).

## Testing hooks

- `fake-indexeddb` backs `StoragePort` in unit/integration tests (deterministic, no DOM).
- `merge`, `validate`, and bundle `export`/`import` are pure or port-injected, enabling the
  Constitution-mandated critical-path tests (persistence, export/import, merge, audio load).
