# Phase 0 Research: Audio Annotation Web App

All Technical Context items were resolvable from the clarified spec and the stated hosting
requirement (GitHub Pages, fast load, minimal clutter). No `NEEDS CLARIFICATION` markers
remain. Each decision below records what was chosen, why, and the alternatives considered.

## 1. Hosting & deployment target

- **Decision**: Deploy the built static bundle to GitHub Pages via a GitHub Actions
  workflow (`actions/deploy-pages`). Configure the Vite `base` to the repository sub-path
  (`/audio-annotator/`) so asset URLs resolve on Pages.
- **Rationale**: The spec is fully client-side with no backend, which is a perfect match
  for static hosting. Actions-based deploy keeps the build reproducible and gated by CI
  (Constitution II). A single-page app needs no server routing, so Pages' static serving
  is sufficient.
- **Alternatives considered**: Manual `gh-pages` branch pushes (rejected: not CI-gated,
  error-prone); Netlify/Vercel (rejected: introduces a third-party dependency the user did
  not ask for; Pages was explicitly requested).

## 2. Build tooling & framework

- **Decision**: Vite 5 + React 18 + TypeScript.
- **Rationale**: Vite gives fast dev builds, tree-shaking, and easy code-splitting to meet
  the fast-load goal. React has first-class TypeScript support and a mature testing story
  (Testing Library), supporting Constitution I/II. `wavesurfer.js` is framework-agnostic,
  so it integrates cleanly.
- **Alternatives considered**: Svelte/SvelteKit (smaller runtime, but SvelteKit's SSR
  features are unused for a static SPA and add config overhead; team familiarity favored
  React); Preact (smaller than React, viable, but ecosystem/testing friction and marginal
  gains vs. code-splitting already planned); plain TS + Web Components (rejected: more
  hand-rolled state/testing infrastructure, slower to a quality bar).

## 3. Waveform rendering & region/point annotations

- **Decision**: `wavesurfer.js` v7 with the Regions plugin. Region annotations map to
  wavesurfer regions with distinct start/end; point annotations map to zero-length markers
  (or the Markers/region-at-single-time pattern) rendered as a marker on the timeline.
- **Rationale**: Provides waveform rendering, seeking, region playback, and region
  drag/create out of the box, directly satisfying FR-002/FR-003/FR-004/FR-005. Uses Web
  Audio and renders to canvas, keeping the main thread responsive (Constitution IV). It is
  actively maintained and TypeScript-typed.
- **Alternatives considered**: Peaks.js (BBC) (heavier, opinionated, waveform-data
  precompute step); building on raw Web Audio + canvas (rejected: significant custom code
  and test burden for a solved problem; violates "weigh build vs. dependency" only if the
  dep were unjustified — here the dep is justified).

## 4. Progressive loading for large files (no size ceiling)

- **Decision**: Load audio as a `Blob`/`ArrayBuffer`, create an object URL for playback,
  and let wavesurfer render the waveform with a visible progress/loading state. For very
  large files, show a non-blocking "large file may be slow" notice and keep UI responsive;
  do not reject any file (FR-029, SC-005).
- **Rationale**: Object-URL playback avoids decoding the entire file into memory before
  playback. Waveform peak computation is the main cost; wavesurfer streams/decodes
  progressively and reports progress, which we surface as an explicit loading state
  (Constitution III/IV).
- **Alternatives considered**: Precomputing peaks in a Web Worker and caching them
  (deferred as an optimization; documented as a follow-up if measurements show waveform
  generation exceeds budget on target files); hard size limits (rejected per clarified
  spec).

## 5. Local persistence

- **Decision**: IndexedDB via the small `idb` wrapper. Store the audio as a `Blob` in one
  object store and annotation/reply/project records in others (see data-model.md).
- **Rationale**: IndexedDB is the only browser store that holds large binary audio
  durably and asynchronously without blocking the main thread (localStorage is
  size-limited and string-only). `idb` is ~1 KB and gives promise ergonomics without a
  heavy ORM. Satisfies FR-011/FR-016/FR-017 with no server.
- **Alternatives considered**: Dexie.js (nicer querying but larger; our access patterns
  are simple key/index lookups, so the extra size is unjustified per Constitution
  "minimize dependencies"); localStorage (rejected: cannot hold audio blobs, ~5 MB cap);
  OPFS/File System Access API (promising but uneven cross-browser support; kept as a
  future option).

## 6. Bundle (zip) format & codec

- **Decision**: Export/import a zip using `fflate`. Bundle contains the original audio
  file plus `annotations.json` (schema-versioned). See contracts/bundle-format.md.
- **Rationale**: `fflate` is one of the smallest and fastest zip libraries, aligning with
  the fast-load goal and Constitution IV; it works fully in-browser with no network. A zip
  of audio + JSON matches the user's stated sharing model exactly and is openable by any
  external tool.
- **Alternatives considered**: JSZip (rejected: larger bundle size, slower); a single
  combined binary/container format (rejected: less transparent/inspectable than a zip; the
  user explicitly described "audio file + json in a zip").

## 7. Merge-by-unique-ID on import

- **Decision**: Assign every annotation and reply a UUID (`crypto.randomUUID`) at
  creation. On import of a bundle derived from the same original audio, union records by
  ID: add new IDs, keep existing; when the same ID has divergent edited content, retain
  both versions or flag a conflict rather than overwriting (FR-027/FR-028; spec edge
  cases).
- **Rationale**: Stable UUIDs make set-union reconciliation deterministic and testable
  (Constitution II) and prevent data loss (spec requirement). Conflict handling avoids
  silent last-write-wins.
- **Alternatives considered**: Full CRDT (rejected: heavyweight for asynchronous
  file-exchange collaboration; no live sync required); last-write-wins by timestamp
  (rejected: can silently discard edits, violating the no-data-loss requirement).

## 8. State management

- **Decision**: `zustand` for a single small store bridging feature modules and UI.
- **Rationale**: Tiny (~1 KB), testable outside React, avoids prop-drilling across the
  waveform, list, and thread components while keeping the app a single view. Keeps
  domain logic in `features/*` and out of components (Constitution I).
- **Alternatives considered**: React Context + useReducer (viable and zero-dep, but more
  boilerplate and re-render pitfalls); Redux Toolkit (rejected: overkill for this scope).

## 9. Styling & minimal-clutter UI

- **Decision**: Hand-authored CSS with design tokens (`tokens.css`) and a single-view
  layout: waveform + transport on top, annotation list/threads in a side panel, minimal
  chrome. No component/UI framework.
- **Rationale**: Directly serves "load fast with minimal visual clutter" — no CSS
  framework payload, small DOM, consistent interaction model (Constitution III). System
  fonts avoid webfont blocking.
- **Alternatives considered**: Tailwind (fast to author but adds build/config and utility
  noise; unnecessary for a small surface); Material/Chakra (rejected: large payload,
  visually heavy, against the minimal-clutter goal).

## 10. Testing & quality tooling

- **Decision**: Vitest + React Testing Library for unit/component; Playwright for e2e
  (including a real export→import round-trip using file fixtures and a small audio sample);
  ESLint + Prettier + typescript-eslint; a CI bundle-size budget check.
- **Rationale**: Covers the constitution's mandated critical paths (persistence, import/
  export, merge, audio load) with deterministic fixtures; enforces code-quality gates
  automatically; validates the < 100 ms interaction and bundle-size budgets in CI.
- **Alternatives considered**: Jest (rejected: slower with Vite/ESM, extra config);
  Cypress (viable, but Playwright's multi-browser and file-download/upload handling suits
  the bundle round-trip tests better).

## 11. Accessibility & keyboard operability

- **Decision**: Keyboard shortcuts for play/pause/seek and annotation create; focus-visible
  styles; ARIA roles on the annotation list and threads; contrast tokens meeting WCAG AA
  for primary flows (FR-024).
- **Rationale**: Constitution III requires baseline accessibility; annotators work long
  sessions and benefit from keyboard-first control.
- **Alternatives considered**: Deferring a11y to later (rejected: constitution treats it
  as baseline, and retrofitting is costlier).

## Open follow-ups (non-blocking, for planning/tasks)

- Worker-based waveform peak precompute + caching if measurements show waveform generation
  exceeds the interaction/first-render budget on large target files.
- Conflict-presentation UX detail (keep-both vs. inline flag) for divergent same-ID edits
  — behavior is bounded by the spec (no data loss); exact presentation decided in tasks.
