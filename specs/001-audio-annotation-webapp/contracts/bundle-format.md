# Contract: Shareable Bundle Format

The bundle is the interchange contract between users (the app's only "external interface").
It is a standard **ZIP** archive so it can be inspected and transported by any external
channel (email, cloud drive) with no app or network (FR-018, FR-020, SC-007).

## File extension & MIME

- Recommended extension: `.aannz` (or `.zip`). Content is a valid zip.
- Suggested export name: `<project-title>-<yyyymmdd>.aannz`.

## Archive layout

```text
<bundle>.aannz (zip)
├── annotations.json        # required; UTF-8; schema in annotations.schema.json
└── audio/
    └── <original-file>     # required; the unmodified source audio (e.g. interview.mp3)
```

Rules:

- Exactly one `annotations.json` at the archive root.
- Exactly one audio file under `audio/`; its name matches `audio.fileName` and its bytes
  are the original file (no re-encoding — FR-030 relies on native decoding).
- Additional/unknown entries MUST be ignored on import (forward compatibility), never cause
  a hard failure.

## `annotations.json` shape (informative; normative schema in the JSON Schema file)

```json
{
  "schemaVersion": 1,
  "project": {
    "id": "b1c2...uuid",
    "title": "Interview with A",
    "createdAt": "2026-07-09T10:00:00.000Z",
    "updatedAt": "2026-07-09T11:30:00.000Z"
  },
  "audio": {
    "id": "a9f8...uuid",
    "fileName": "interview.mp3",
    "mimeType": "audio/mpeg",
    "durationSec": 3720.5,
    "byteSize": 58210304,
    "path": "audio/interview.mp3"
  },
  "annotations": [
    {
      "id": "an-uuid-1",
      "kind": "region",
      "startSec": 12.0,
      "endSec": 18.4,
      "note": "Background noise here",
      "authorName": "Sam",
      "createdAt": "2026-07-09T10:05:00.000Z",
      "updatedAt": "2026-07-09T10:05:00.000Z",
      "deleted": false,
      "replies": [
        {
          "id": "rp-uuid-1",
          "text": "Agreed, we should re-record.",
          "authorName": "Jo",
          "createdAt": "2026-07-09T10:10:00.000Z",
          "updatedAt": "2026-07-09T10:10:00.000Z",
          "deleted": false
        }
      ]
    },
    {
      "id": "an-uuid-2",
      "kind": "point",
      "startSec": 42.0,
      "endSec": null,
      "note": "Key quote starts",
      "authorName": "Sam",
      "createdAt": "2026-07-09T10:06:00.000Z",
      "updatedAt": "2026-07-09T10:06:00.000Z",
      "deleted": false,
      "replies": []
    }
  ]
}
```

> Replies are nested under their annotation in the bundle for human readability; the app
> may flatten them internally (see storage contract). `audio.path` points to the zip entry.

## Export contract

Given the active Project, `exportBundle(project) -> Blob`:

1. Serialize project/audio metadata + annotations (with nested replies) to `annotations.json`
   with the current `schemaVersion`. Tombstoned (`deleted: true`) items ARE included so
   deletions propagate on merge.
2. Add the original audio bytes at `audio/<fileName>`.
3. Zip with `fflate` and return a `Blob` (`application/zip`) for download.

Determinism: entries are written in a stable order (metadata, annotations by `createdAt`
then `id`) so identical projects produce byte-comparable JSON (testability, Constitution II).

## Import contract

`importBundle(file) -> ImportResult` (see storage-and-modules.md `mergeProject`):

1. Parse zip. If not a valid zip, or `annotations.json` missing, or the referenced audio
   entry missing ⇒ return a validation error; **do not** mutate existing local data (FR-026).
2. Validate `annotations.json` against the schema. Unknown **newer** `schemaVersion` ⇒
   clear "unsupported version" error (FR-026). Known/older versions ⇒ upgrade in-memory.
3. Resolve the audio blob from the `audio/` entry.
4. If `project.id` is new ⇒ create project (open as project). If it already exists locally
   ⇒ merge annotations/replies by `id` (union, tombstone-aware) with no data loss
   (FR-027/FR-028).
5. Report a summary: added / merged / conflicts flagged.

## Validation error taxonomy (surfaced as explicit error states, FR-022/FR-026)

| Code            | Condition                                     |
| --------------- | --------------------------------------------- |
| `E_NOT_ZIP`     | File is not a readable zip archive            |
| `E_NO_MANIFEST` | `annotations.json` missing                    |
| `E_NO_AUDIO`    | Referenced `audio/` entry missing             |
| `E_SCHEMA`      | `annotations.json` fails schema validation    |
| `E_VERSION`     | `schemaVersion` newer than app supports       |
| `E_AUDIO_TYPE`  | Audio MIME/type not in supported set (FR-030) |

Versioning policy: `schemaVersion` is an integer. Additive fields do not bump it; readers
ignore unknown fields. Breaking changes bump the integer and the app supports reading the
previous version for at least one major release.
