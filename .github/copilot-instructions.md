# Copilot Instructions: Audio Annotator

Agent context for this repository. Keep responses aligned with the project constitution and
the active feature plan.

## Project

Fully client-side, local-first single-page web app for annotating audio. No backend, no
accounts, no network after load. Shared by exporting/importing a zip bundle. Deployed as a
static site to GitHub Pages. Design goals: fast first load, minimal visual clutter.

## Active technologies

- TypeScript 5.x (ES2022), React 18, Vite 5
- `wavesurfer.js` v7 (+ Regions plugin) — waveform, seek, point/region annotations
- `idb` over IndexedDB — local persistence (audio blobs + records)
- `fflate` — zip bundle create/parse
- `zustand` — minimal state store
- Hand-authored CSS with design tokens (no UI framework)
- Vitest + React Testing Library; Playwright e2e; ESLint + Prettier + typescript-eslint

## Project structure

- `src/features/*` — framework-agnostic domain logic: `audio`, `annotations`, `replies`,
  `bundle`, `storage`. Keep validation/merge/zip logic here (pure, unit-tested).
- `src/components/*` — thin presentational React components (waveform host, list, threads,
  import/export, loading/empty/error states).
- `src/state/store.ts` — zustand store wiring features to UI; no domain logic here.
- `src/lib/*` — `id` (UUID), `time`, `result` (typed errors).
- `tests/{unit,integration,e2e}` — see quickstart for scenarios.

## Commands

- `npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck`
- `npm run test` (Vitest) · `npm run test:e2e` (Playwright) · `npm run size` (bundle budget)

## Conventions & guardrails (from constitution v1.0.0)

- Code Quality: lint/format/type-check must pass; small single-responsibility modules;
  document public module interfaces (TSDoc). No silent tech debt.
- Testing: add failing-first tests; cover critical paths (persistence, bundle
  export/import, merge-by-ID, audio load); keep tests deterministic (`fake-indexeddb`,
  fixtures). Main branch stays green.
- UX Consistency: explicit loading/empty/error/success states; confirm destructive actions;
  keyboard-operable + AA contrast on primary flows; one consistent interaction model.
- Performance: interactive actions < 100 ms; progressive audio loading, never freeze; no
  hard audio size/duration limit (graceful degradation + "large file may be slow" notice);
  keep dependencies small and code-split for fast load.

## Domain rules

- Annotations: `point` (single timestamp, `endSec = null`) or `region`
  (`start < end <= duration`); non-empty note; stable UUID `id`.
- Deletions are tombstones (`deleted: true`) so merges never resurrect removed items.
- Import opens as a project; re-import of the same original merges by unique `id` (union,
  no data loss); divergent same-id edits are flagged, never silently overwritten.
- Bundle = zip with `annotations.json` (schema-versioned) + `audio/<original-file>`.
- Supported audio: MP3, WAV, OGG, M4A/AAC, FLAC (native browser decoding; no transcoding).
- No accounts: participants are a self-entered display name only (not unique/verified).

## Active feature

`001-audio-annotation-webapp` — see `specs/001-audio-annotation-webapp/` (spec, plan,
research, data-model, contracts, quickstart).

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
