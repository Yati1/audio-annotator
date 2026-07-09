# Quickstart & Validation Guide: Audio Annotation Web App

A runnable guide to build, run, validate, and deploy the app. It proves the feature works
end-to-end against the [spec](spec.md) success criteria. Implementation detail lives in the
[plan](plan.md), [data-model](data-model.md), and [contracts](contracts/); this file is a
validation/run guide only.

## Prerequisites

- Node.js 20 LTS and npm 10+
- A small sample audio file in a supported format (MP3/WAV/OGG/M4A/FLAC — FR-030)
- Modern desktop browser (Chromium, Firefox, or Safari)

## Setup & run

```bash
npm install
npm run dev          # Vite dev server (default http://localhost:5173/audio-annotator/)
```

> The Vite `base` is `/audio-annotator/` for GitHub Pages; the dev server serves under the
> same path.

## Quality gates (must pass — Constitution I/II/IV)

```bash
npm run lint         # ESLint + Prettier + typescript-eslint  (Code Quality)
npm run typecheck    # tsc --noEmit
npm run test         # Vitest unit + integration
npm run test:e2e     # Playwright end-to-end
npm run build        # production build
npm run size         # bundle-size budget check (initial JS <= ~150 KB gzip)
```

All commands must exit 0 for the change to be mergeable (green main).

## Validation scenarios

Each scenario maps to spec user stories / success criteria. Run manually in the browser and
as the referenced automated test.

### Scenario A — Create point & region annotations (US1, SC-001, SC-002)

1. Open the app, choose the sample audio, enter a display name when prompted.
2. Play/seek; place a **point** annotation, add a note.
3. Select a start/end range; create a **region** annotation, add a note.
4. Select the region and trigger region playback — only that period plays (FR-003).
5. Reload the page.

**Expected**: Both annotations reappear at identical timestamps with notes intact
(persisted in IndexedDB). Region playback plays only the annotated span.
**Automated**: `tests/e2e/annotate.spec.ts`, `tests/unit/annotations.validate.test.ts`.

### Scenario B — Reply threads (US2, SC-002)

1. On an existing annotation, add two replies (optionally change the display name between
   them).
2. Reload.

**Expected**: Replies show in chronological order with author + time, and persist across
reload (FR-013/FR-014/FR-016).
**Automated**: `tests/e2e/replies.spec.ts`, `tests/integration/replies.storage.test.ts`.

### Scenario C — Export → import round-trip (US3, SC-003, SC-007)

1. Export a bundle from a project with annotations and replies.
2. Confirm a single `.aannz`/zip downloads containing `annotations.json` + `audio/<file>`.
3. In a fresh browser profile (or another device, offline), import the bundle.

**Expected**: Audio, annotations, and threads are restored exactly, with no network
(FR-018/FR-019/FR-020). Bundle validates against
[contracts/annotations.schema.json](contracts/annotations.schema.json).
**Automated**: `tests/e2e/roundtrip.spec.ts`, `tests/unit/bundle.codec.test.ts`.

### Scenario D — Re-import merge by unique ID (US3, FR-027/FR-028)

1. Export bundle B1 from a project.
2. Import B1 on a second setup, add a new annotation + reply, export as B2.
3. Back on the first setup, import B2 (same original project id).

**Expected**: The merged project contains **both** the original and the newly added
items (union by id), nothing lost; any divergent same-id edits are flagged, not silently
overwritten.
**Automated**: `tests/unit/bundle.merge.test.ts`.

### Scenario E — Error & edge handling (FR-010, FR-022, FR-026)

- Attempt a zero-length or end-before-start region ⇒ rejected with guidance (FR-010).
- Import a truncated/corrupt zip and a zip missing its audio ⇒ clear error state; existing
  local data unchanged (FR-026).
- Import a bundle with a newer `schemaVersion` ⇒ "unsupported version" error.

**Automated**: `tests/unit/annotations.validate.test.ts`, `tests/unit/bundle.import.errors.test.ts`.

### Scenario F — Performance & large files (SC-004, SC-005, FR-029)

- Interactive actions (play/pause/seek, create/edit annotation, post reply) respond
  < 100 ms (Playwright timing assertions).
- Open a large/long file: UI shows progressive loading and stays responsive; a
  "large file may be slow" notice may appear; the file is never rejected.

**Automated**: `tests/e2e/perf.spec.ts` (timing), manual check for the large-file notice.

### Scenario G — Accessibility (FR-024)

- Drive play/pause/seek and annotation creation via keyboard only.
- Verify focus-visible styling and AA contrast on primary flows.

## Deploy to GitHub Pages

Deployment is automated via `.github/workflows/deploy.yml` (build → `actions/deploy-pages`).

1. Push to the default branch; CI runs lint/typecheck/tests/build.
2. On success, the built `dist/` is published to Pages.
3. Verify the live URL (`https://<user>.github.io/audio-annotator/`) loads fast and runs
   fully client-side (no network calls after load — check the Network tab).

**Expected**: First Contentful Paint < 1.5 s on broadband; app functions offline after the
initial load (SC-004/SC-005 responsiveness upheld in production).
