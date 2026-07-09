# Tasks: Audio Annotation Web App

**Input**: Design documents from `/specs/001-audio-annotation-webapp/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. The project [constitution](../../.specify/memory/constitution.md) v1.0.0
(II. Testing Standards) mandates failing-first tests on critical paths, so test tasks are
part of every story.

**Organization**: Grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (annotate), US2 (replies), US3 (share)
- All paths are repository-root relative per [plan.md](plan.md) Project Structure.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project scaffolding and tooling for a static SPA on GitHub Pages.

- [x] T001 Create the source/test folder structure per plan.md in `src/` (`app/`, `components/states/`, `features/{audio,annotations,replies,bundle,storage}/`, `state/`, `lib/`, `styles/`) and `tests/{unit,integration,e2e}/`
- [x] T002 Initialize Vite 5 + React 18 + TypeScript project: `package.json`, `tsconfig.json`, `index.html`, `src/main.tsx`; add deps `wavesurfer.js`, `idb`, `fflate`, `zustand`
- [x] T003 [P] Configure ESLint + Prettier + typescript-eslint in `.eslintrc.cjs` and `.prettierrc`; add `lint`/`typecheck` npm scripts
- [x] T004 [P] Configure Vitest + React Testing Library + `fake-indexeddb` in `vitest.config.ts` and `tests/setup.ts`; add `test` script
- [x] T005 [P] Configure Playwright in `playwright.config.ts` with a fixture audio sample in `tests/e2e/fixtures/`; add `test:e2e` script
- [x] T006 [P] Set Vite `base: '/audio-annotator/'` in `vite.config.ts` and add a bundle-size budget check as the `size` npm script
- [x] T007 [P] Add GitHub Pages CI in `.github/workflows/deploy.yml` (install → lint → typecheck → test → build → `actions/deploy-pages`)
- [x] T008 [P] Author design tokens and base styles in `src/styles/tokens.css` and `src/styles/global.css` (AA-contrast palette, system font stack, minimal-clutter layout)

**Checkpoint**: `npm run dev`, `lint`, `typecheck`, `build` all succeed on an empty shell.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared domain types, persistence, audio loading/waveform, and app shell that
every user story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T009 [P] Implement typed result/error helper in `src/lib/result.ts`
- [X] T010 [P] Implement UUID helper (`crypto.randomUUID`) in `src/lib/id.ts`
- [X] T011 [P] Implement timestamp format/validation helpers in `src/lib/time.ts`
- [X] T012 [P] Define shared domain types (Project, Audio, Annotation, Reply) from [data-model.md](data-model.md) in `src/features/types.ts`
- [X] T013 Implement IndexedDB `StoragePort` (stores: projects, audio, annotations, replies, sessionMeta) with `idb` in `src/features/storage/storage.ts` per [contracts/storage-and-modules.md](contracts/storage-and-modules.md)
- [X] T014 [P] Integration test for `StoragePort` (put/get/list, cascade delete, session) with `fake-indexeddb` in `tests/integration/storage.test.ts`
- [X] T015 Implement `AudioService.load` (validate supported MIME per FR-030, extract metadata, object URL) in `src/features/audio/audio.ts`
- [X] T016 [P] Unit test audio format validation + metadata in `tests/unit/audio.load.test.ts`
- [X] T017 Create the zustand store skeleton (session display name, active project, load/persist wiring) in `src/state/store.ts`
- [X] T018 [P] Implement Loading/Empty/Error/Toast primitives in `src/components/states/`
- [X] T019 [P] Implement `DisplayNamePrompt` (self-entered name, persisted to `sessionMeta`) in `src/components/DisplayNamePrompt.tsx`
- [X] T020 Implement `WaveformView` (wavesurfer.js host + Regions plugin, progressive loading state, large-file notice) in `src/components/WaveformView.tsx`
- [X] T021 Implement `TransportBar` (play/pause/seek) in `src/components/TransportBar.tsx`
- [X] T022 Implement single-view app shell wiring shell + audio load + waveform + states in `src/app/App.tsx`

**Checkpoint**: An audio file can be loaded, persisted, and played on a waveform; no
annotations yet.

---

## Phase 3: User Story 1 - Annotate an audio file (Priority: P1) 🎯 MVP

**Goal**: Create, edit, delete, and persist point and region annotations on the waveform,
including region-only playback.

**Independent Test**: Load audio, create one point and one region annotation with notes,
play the region, reload, and confirm both persist at exact timestamps with notes intact.

### Tests for User Story 1

- [X] T023 [P] [US1] Unit tests for annotation validation (point ⇒ `endSec=null`; region ⇒ `start<end<=duration`; non-empty note; FR-010) in `tests/unit/annotations.validate.test.ts`
- [X] T024 [P] [US1] Integration test: create → persist → reload restores annotations in `tests/integration/annotations.persist.test.ts`
- [X] T025 [P] [US1] E2E: create point + region, region playback, reload in `tests/e2e/annotate.spec.ts`

### Implementation for User Story 1

- [X] T026 [US1] Implement `AnnotationService` (createPoint/createRegion/edit/remove tombstone/validate) in `src/features/annotations/annotations.ts`
- [X] T027 [US1] Add annotation store actions (add/edit/delete + persist via `StoragePort`) in `src/state/store.ts`
- [X] T028 [P] [US1] Implement `AnnotationList` in `src/components/AnnotationList.tsx` and `AnnotationItem` (type, time, author, note) in `src/components/AnnotationItem.tsx`
- [X] T029 [US1] Wire point/region creation and editing to wavesurfer regions/markers in `src/components/WaveformView.tsx`
- [X] T030 [US1] Implement region-only playback (FR-003) in `src/components/TransportBar.tsx`
- [X] T031 [US1] Add delete confirmation and inline validation error states (FR-010/FR-022/FR-023) in `src/components/AnnotationItem.tsx`

**Checkpoint**: User Story 1 is fully functional and independently testable (MVP).

---

## Phase 4: User Story 2 - Respond to annotations (Priority: P1)

**Goal**: Threaded replies on any annotation, shown chronologically with author and time,
editable/deletable by their author, persisted locally.

**Independent Test**: On an annotation, add two replies (varying display name), reload, and
confirm they appear in order under the correct annotation with author and timestamp.

### Tests for User Story 2

- [X] T032 [P] [US2] Unit tests for reply service (non-empty text, chronological `ordered`, tombstone) in `tests/unit/replies.test.ts`
- [X] T033 [P] [US2] Integration test: add replies → persist → reload in `tests/integration/replies.persist.test.ts`
- [X] T034 [P] [US2] E2E: add/edit/delete replies in a thread in `tests/e2e/replies.spec.ts`

### Implementation for User Story 2

- [X] T035 [US2] Implement `ReplyService` (add/edit/remove tombstone/ordered) in `src/features/replies/replies.ts`
- [X] T036 [US2] Add reply store actions (add/edit/delete + persist) in `src/state/store.ts`
- [X] T037 [P] [US2] Implement `ReplyThread` (chronological list, author + time, add/edit/delete) in `src/components/ReplyThread.tsx`
- [X] T038 [US2] Embed `ReplyThread` in `AnnotationItem` with delete-with-thread confirmation (spec edge case) in `src/components/AnnotationItem.tsx`

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Share via an exportable file (Priority: P2)

**Goal**: Export a self-contained zip bundle (audio + `annotations.json`) and import one
back, restoring content and merging by unique ID without data loss.

**Independent Test**: Create annotations + replies, export a bundle, import it in a fresh
session/offline, confirm exact restoration; re-import a related bundle and confirm union
merge with no loss.

### Tests for User Story 3

- [X] T039 [P] [US3] Unit test bundle export→parse round-trip validated against [contracts/annotations.schema.json](contracts/annotations.schema.json) in `tests/unit/bundle.codec.test.ts`
- [X] T040 [P] [US3] Unit test `merge` (union by id, tombstone wins, divergent-edit conflict flagged; FR-027/FR-028) in `tests/unit/bundle.merge.test.ts`
- [X] T041 [P] [US3] Unit test import error taxonomy (`E_NOT_ZIP`, `E_NO_MANIFEST`, `E_NO_AUDIO`, `E_SCHEMA`, `E_VERSION`, `E_AUDIO_TYPE`; FR-026) in `tests/unit/bundle.import.errors.test.ts`
- [X] T042 [P] [US3] E2E export → import round-trip restore in `tests/e2e/roundtrip.spec.ts`

### Implementation for User Story 3

- [X] T043 [US3] Implement bundle export (serialize `annotations.json` with `schemaVersion`, add audio entry, zip via `fflate`) in `src/features/bundle/export.ts` per [contracts/bundle-format.md](contracts/bundle-format.md)
- [X] T044 [US3] Implement bundle import (unzip, validate against schema, resolve audio blob, map errors) in `src/features/bundle/import.ts`
- [X] T045 [US3] Implement pure `merge` (union by id, tombstone-aware, conflict flagging) in `src/features/bundle/merge.ts`
- [X] T046 [US3] Add export/import/merge store actions (open-as-project vs. merge-by-id; leave local data intact on error) in `src/state/store.ts`
- [X] T047 [P] [US3] Implement `ImportExportControls` with explicit loading/error/success states and conflict surfacing in `src/components/ImportExportControls.tsx`

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Constitution-mandated quality, performance, and accessibility across stories.

- [X] T048 [P] Accessibility pass: keyboard shortcuts for play/pause/seek/create, focus-visible styles, ARIA roles on list/threads, verify AA contrast (FR-024) across `src/components/`
- [X] T049 [P] Performance e2e: assert interactive actions < 100 ms and verify the large-file "may be slow" notice (SC-004/SC-005/FR-029) in `tests/e2e/perf.spec.ts`
- [X] T050 [P] Wire the bundle-size budget (`npm run size`) into `.github/workflows/deploy.yml` as a gating step
- [X] T051 [P] Add TSDoc to public interfaces of `src/features/*` modules (Constitution I)
- [X] T052 [P] Add `README.md` with setup/build/deploy notes referencing [quickstart.md](quickstart.md)
- [X] T053 Run all [quickstart.md](quickstart.md) validation scenarios A–G against a production build

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational. US1 and US2 (both P1) are
  independent; US3 (P2) consumes annotations/replies but is independently testable via its
  own fixtures.
- **Polish (Phase 6)**: Depends on the targeted user stories being complete.

### Story-level dependencies

- **US1 (P1)**: After Phase 2. No dependency on other stories.
- **US2 (P1)**: After Phase 2. Attaches to annotations but testable on its own fixtures.
- **US3 (P2)**: After Phase 2. Serializes annotations + replies; best sequenced after US1/US2
  exist, but its merge/codec logic is unit-tested independently.

### Within each story

- Write tests first and confirm they FAIL before implementation (Constitution II).
- Services (`features/*`) before store actions before components.

---

## Parallel Opportunities

- Setup: T003–T008 can run in parallel after T002.
- Foundational: T009–T012 (lib/types) in parallel; T014, T016, T018, T019 in parallel with
  their siblings.
- Each story's test tasks (e.g., T023–T025, T032–T034, T039–T042) run in parallel.
- With capacity, US1 and US2 can be built in parallel by different developers once Phase 2
  is done.
- Polish T048–T052 run in parallel.

### Parallel example: User Story 1 tests

```bash
Task: "Unit tests for annotation validation in tests/unit/annotations.validate.test.ts"
Task: "Integration test create→reload in tests/integration/annotations.persist.test.ts"
Task: "E2E create point+region + region playback in tests/e2e/annotate.spec.ts"
```

---

## Implementation Strategy

### MVP first (User Story 1)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & validate** (annotate
   - persist + region playback) → deploy/demo.

### Incremental delivery

1. Setup + Foundational → foundation ready.
2. US1 → test → deploy (MVP: annotate audio).
3. US2 → test → deploy (threaded replies).
4. US3 → test → deploy (share via bundle).
5. Polish → accessibility, performance, size budget, quickstart validation.

### Parallel team strategy

After Phase 2: Developer A → US1, Developer B → US2, Developer C → US3 merge/codec (unit
level), integrating at the store/components layer.

---

## Notes

- [P] = different files, no dependencies.
- [Story] label maps each task to a user story for traceability.
- Verify tests fail before implementing.
- Commit after each task or logical group.
- Total tasks: 53 (Setup 8, Foundational 14, US1 9, US2 7, US3 9, Polish 6).
