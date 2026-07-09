# Implementation Plan: Audio Annotation Web App

**Branch**: `001-audio-annotation-webapp` | **Date**: 2026-07-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-audio-annotation-webapp/spec.md`

## Summary

A fully client-side, single-page web app for annotating audio. Users load an audio file,
place point and region annotations on a waveform timeline, discuss them in reply threads,
and share work by exporting a self-contained zip bundle (audio + `annotations.json`) that
others import. There is no backend, no accounts, and no network dependency: all data is
persisted locally in the browser (IndexedDB), and the built site is deployed as static
assets to GitHub Pages. The technical approach favors a small dependency footprint and
code-splitting for fast first load, a single uncluttered view, and a proven waveform
library (`wavesurfer.js`) whose regions map directly to point/region annotations.

## Technical Context

**Language/Version**: TypeScript 5.x (ES2022 target)

**Primary Dependencies**: React 18 + Vite 5 (build/tooling); `wavesurfer.js` v7 (waveform
rendering + Regions plugin for point/region annotations); `fflate` (zip create/parse for
bundles); `idb` (thin IndexedDB wrapper for local persistence); `zustand` (minimal state
store). No UI component library — hand-authored CSS with design tokens for minimal visual
clutter and small bundle size.

**Storage**: Browser IndexedDB (audio blobs + annotation/reply records + project
metadata). No server-side storage. Exported bundle = zip containing the original audio
file and a versioned `annotations.json`.

**Testing**: Vitest + React Testing Library (unit/component); Playwright (end-to-end for
audio load/playback, annotation lifecycle, and bundle export→import round-trips).

**Target Platform**: Modern evergreen desktop browsers (Chromium, Firefox, Safari)
supporting Web Audio, IndexedDB, and standard file download/upload flows. Delivered as a
static site on GitHub Pages.

**Project Type**: Single-page static web application (frontend only).

**Performance Goals**: Interactive actions (play/pause/seek, create/edit annotation, post
reply) respond < 100 ms (SC-004). Initial route JavaScript ≤ ~150 KB gzip; First
Contentful Paint < 1.5 s on a typical broadband connection; audio decoding/waveform
rendering runs progressively and never freezes the UI.

**Constraints**: 100% client-side; must run from a GitHub Pages sub-path base URL; offline
after first load; no fixed audio size/duration ceiling (graceful degradation with visible
progress); minimal-clutter single-view UI; keyboard-operable primary flows with adequate
contrast.

**Scale/Scope**: Single-user-per-device sessions; one active audio project at a time
(re-import merges by unique ID). Roughly a dozen UI components; hundreds to low-thousands
of annotations per project as a practical working range.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Evaluated against the Audio Annotator Constitution v1.0.0.

| Principle             | Gate                                                                                                                                                                                                                     | Status |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| I. Code Quality       | ESLint + Prettier + typescript-eslint enforced in CI; PR review required; modules single-responsibility (`audio`, `annotations`, `replies`, `bundle`, `storage`, `state`); public module interfaces documented via TSDoc | PASS   |
| II. Testing Standards | Vitest unit/component + Playwright e2e; critical paths (persistence, bundle export/import, merge-by-ID, audio load) have explicit tests; CI gate keeps main green; deterministic tests with fixed fixtures               | PASS   |
| III. UX Consistency   | Explicit loading/empty/error/success states (FR-022); confirmation on destructive actions (FR-023); keyboard + contrast baseline (FR-024); single consistent interaction model across the one view                       | PASS   |
| IV. Performance       | < 100 ms interaction budget (SC-004); code-splitting + small deps (`fflate` over JSZip, no UI kit); progressive audio loading; budgets measured in CI via bundle-size check and Playwright timing assertions             | PASS   |

**Additional constraints**: Feature has spec + plan before implementation (this document);
performance budgets and UX standards captured here and in the spec; each dependency is
justified in research.md (Complexity Tracking is empty — no violations).

Initial Constitution Check: **PASS** (no violations; Complexity Tracking not required).

### Post-Design Re-Check (after Phase 1)

Re-evaluated against v1.0.0 after producing `data-model.md`, `contracts/*`, and
`quickstart.md`. No new violations introduced by the design.

| Principle             | Post-design evidence                                                                                                                                                                     | Status |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| I. Code Quality       | `contracts/storage-and-modules.md` defines documented, single-responsibility ports (`storage`, `audio`, `annotations`, `replies`, `bundle`); domain logic isolated from React/wavesurfer | PASS   |
| II. Testing Standards | `quickstart.md` scenarios A–G map to unit/integration/e2e tests; merge/validate/bundle codec are pure or port-injected with `fake-indexeddb`; critical paths covered                     | PASS   |
| III. UX Consistency   | Error taxonomy in `bundle-format.md` + `StoragePort` typed `Result` feed explicit error states; destructive actions (delete → tombstone) confirmed; a11y scenario G                      | PASS   |
| IV. Performance       | Blob/object-URL playback + separate audio store avoid loading binaries into metadata queries; `fflate`/`idb`/`zustand` chosen for size; `npm run size` budget gate                       | PASS   |

Post-Design Constitution Check: **PASS**. Complexity Tracking remains empty.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

### Documentation (this feature)

```text
specs/001-audio-annotation-webapp/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── bundle-format.md         # Zip bundle layout + versioning
│   ├── annotations.schema.json  # JSON Schema for annotations.json
│   └── storage-and-modules.md   # IndexedDB schema + internal module contracts
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created here)
```

### Source Code (repository root)

```text
index.html                 # Vite entry; single-page shell
vite.config.ts             # base set to '/audio-annotator/' for GitHub Pages
package.json
tsconfig.json
.eslintrc.cjs / .prettierrc

public/                    # static assets copied verbatim

src/
├── main.tsx               # App bootstrap
├── app/
│   └── App.tsx            # Single-view layout shell
├── components/            # Presentational, reusable UI
│   ├── WaveformView.tsx   # wavesurfer.js host + region rendering
│   ├── TransportBar.tsx   # play/pause/seek, region playback
│   ├── AnnotationList.tsx
│   ├── AnnotationItem.tsx
│   ├── ReplyThread.tsx
│   ├── DisplayNamePrompt.tsx
│   ├── ImportExportControls.tsx
│   └── states/            # Loading / Empty / Error / Toast primitives
├── features/
│   ├── audio/             # load + decode + playback control (framework-agnostic core)
│   ├── annotations/       # create/edit/delete point & region annotations, validation
│   ├── replies/           # thread operations
│   ├── bundle/            # export → zip, import → parse + validate + merge-by-ID
│   └── storage/           # IndexedDB read/write (audio blob + records)
├── state/
│   └── store.ts           # zustand store wiring features to UI
├── lib/
│   ├── id.ts              # crypto.randomUUID wrapper
│   ├── time.ts            # timestamp formatting/validation
│   └── result.ts          # typed error/result helpers
└── styles/
    ├── tokens.css         # color/spacing/typography design tokens
    └── global.css

tests/
├── unit/                  # feature logic (validation, merge, bundle codec)
├── integration/           # storage + feature interactions (fake-indexeddb/jsdom)
└── e2e/                   # Playwright: annotate, reply, export/import round-trip

.github/
└── workflows/
    └── deploy.yml         # build + deploy to GitHub Pages
```

**Structure Decision**: Single frontend project at the repository root (no backend
directory), because the spec mandates a fully client-side, local-first app served as
static files. Domain logic lives in `src/features/*` as framework-agnostic modules
(directly unit-testable per Constitution II), while `src/components/*` stays thin and
presentational to keep the single view uncluttered and the interaction model consistent.

## Complexity Tracking

> No Constitution violations. Section intentionally empty.
