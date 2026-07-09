# Feature Specification: Audio Annotation Web App

**Feature Branch**: `001-audio-annotation-webapp`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "I want to build a webapp that allows users to annotate audio files. The base audio files and annotations should be sharable. Annotations can be made to periods of audio or singular points. It is important to be able to respond to annotations."

## Clarifications

### Session 2026-07-08

- Q: How are participants identified when they create or reply to annotations, including those who join via a share link? → A: Fully anonymous — anyone with a link acts under a self-entered display name, with no accounts at all.
- Q: How is annotation data persisted and shared between users? → A: Data is persisted locally on the user's device; sharing is done out-of-app by exporting a self-contained bundle (a zip containing the audio file plus a JSON annotations file) that recipients import. No server, accounts, or in-app access control.
- Q: How should importing a bundle interact with existing data, especially for the reply round-trip? → A: Import opens the bundle as a project; re-importing a bundle derived from the same original merges annotations and replies by unique ID (union, no data loss).
- Q: What maximum audio file size and duration must the app handle responsively? → A: No fixed ceiling — best-effort with graceful degradation; the app must not freeze and must communicate when a very large file may perform slowly, but no size/duration is guaranteed to be rejected.
- Q: Which audio formats must the app accept for annotation? → A: Common browser-playable formats — MP3, WAV, OGG, M4A/AAC, and FLAC — relying on native browser decoding (no in-app transcoding).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Annotate an audio file (Priority: P1)

A user opens an audio file in the web app, listens/scrubs through it, and attaches
annotations. An annotation can mark either a single point in time (a marker at one
timestamp) or a span/region of time (a start and end timestamp). Each annotation carries
a text note describing what the user wants to call out.

**Why this priority**: This is the core value of the product. Without the ability to
create point and region annotations against audio, nothing else matters. It is the
minimum viable slice.

**Independent Test**: Load an audio file, create one point annotation and one region
annotation with notes, reload the app, and confirm both annotations persist at the exact
timestamps with their notes intact.

**Acceptance Scenarios**:

1. **Given** an audio file is open, **When** the user places a marker at a specific
   timestamp and enters a note, **Then** a point annotation is created and displayed at
   that timestamp.
2. **Given** an audio file is open, **When** the user selects a start and end time and
   enters a note, **Then** a region annotation is created spanning that period and shown
   on the timeline.
3. **Given** an existing annotation, **When** the user edits its note or adjusts its
   time bounds, **Then** the changes are saved and reflected on the timeline.
4. **Given** an existing annotation, **When** the user deletes it and confirms, **Then**
   the annotation is removed from the timeline and no longer persists.
5. **Given** the user selects a region annotation, **When** they trigger playback,
   **Then** playback plays only the annotated period.

---

### User Story 2 - Respond to annotations (Priority: P1)

A user (or someone who received an exported bundle) reads an existing annotation and adds
a reply to it. Replies form a thread attached to the annotation so that a discussion can
happen in the context of a specific point or region of audio.

**Why this priority**: The user explicitly called out that responding to annotations is
important. Threaded discussion turns the tool from a personal notepad into a
collaboration surface, which is a primary differentiator.

**Independent Test**: On an audio file with an existing annotation, add two replies from
different participants, reload, and confirm the replies appear in order under the correct
annotation with author and timestamp.

**Acceptance Scenarios**:

1. **Given** an annotation exists, **When** a user adds a reply, **Then** the reply
   appears in the annotation's thread with the author and the time it was posted.
2. **Given** a thread with several replies, **When** any participant views the
   annotation, **Then** all replies are shown in chronological order.
3. **Given** a reply the user authored, **When** they edit or delete it, **Then** the
   thread updates accordingly and the change persists.
4. **Given** a bundle that was annotated and replied to by someone else, **When** the
   original author imports it, **Then** they can see the added replies in the thread.

---

### User Story 3 - Share audio and annotations via an exportable file (Priority: P2)

A user shares an audio file together with its annotations and reply threads by exporting a
single self-contained bundle file (a zip containing the audio file and a JSON file with
the annotations and replies). They send that file to others through any external channel
(email, cloud drive, etc.). A recipient imports the bundle into the app and sees the same
audio, annotations, and threads, and can add their own annotations and replies before
exporting again to send back.

**Why this priority**: Sharing is required for the collaboration and response workflows
to have an audience, but a single user can still get value from stories 1 and 2 alone.
It is essential but builds on the annotation core.

**Independent Test**: Create annotations and replies on a file, export a bundle, import
that bundle in a separate session (or on another device with no network), and confirm the
audio, annotations, and threads are restored intact.

**Acceptance Scenarios**:

1. **Given** a file with annotations and replies, **When** the user exports it, **Then** a
   single bundle file (zip of the audio plus a JSON annotations file) is produced.
2. **Given** an exported bundle, **When** a recipient imports it, **Then** the audio,
   annotations, and reply threads are restored exactly as exported.
3. **Given** an imported bundle, **When** the recipient adds annotations or replies and
   exports again, **Then** the new bundle contains both the original and the added
   content.
4. **Given** a bundle that is malformed or missing its audio or annotation data, **When**
   the user imports it, **Then** the app shows a clear error and does not corrupt existing
   local data.

---

### Edge Cases

- What happens when a region annotation's end time is before its start time, or both are
  identical? The system MUST prevent creation and guide the user to a valid range.
- What happens when an annotation timestamp falls outside the audio duration (e.g., after
  a shorter file is substituted)? The system MUST handle out-of-range annotations without
  breaking the timeline.
- What happens when the audio file fails to load or is an unsupported format? The system
  MUST show a clear error state rather than a blank or frozen interface.
- What happens when two collaborators edit the same annotation or reply concurrently? The
  system MUST avoid silent data loss and communicate the outcome to the users.
- What happens when a very large or very long audio file is opened? The interface MUST
  remain responsive and MUST NOT freeze; the system MUST degrade gracefully (e.g.,
  progressive loading and visible progress) and MAY warn that performance could be slower,
  but MUST NOT impose a hard size/duration limit.
- What happens when an imported bundle is malformed, is not a valid zip, or is missing its
  audio or annotation data? The system MUST show a clear error state and MUST NOT corrupt
  existing local data.
- What happens when two people independently annotate the same bundle and both export
  changes back? On import, the system MUST reconcile the bundles by merging annotations
  and replies by their unique IDs (union), so no side's contributions are lost.
- What happens when the same annotation or reply ID exists on both sides with different
  edited content at merge time? The system MUST resolve the conflict without silently
  discarding either version (e.g., keep both or flag the conflict) rather than losing data.
- What happens when an annotation with an active reply thread is deleted? The system MUST
  warn that the discussion will be removed and require confirmation.

## Requirements _(mandatory)_

### Functional Requirements

#### Audio playback

- **FR-001**: System MUST allow a user to load and play an audio file within the web app,
  with play, pause, and seek controls.
- **FR-002**: System MUST display a visual timeline of the audio (e.g., a waveform or
  time ruler) that annotations can be positioned against.
- **FR-003**: System MUST allow the user to play back only the period covered by a
  selected region annotation.

#### Annotations

- **FR-004**: Users MUST be able to create a point annotation anchored to a single
  timestamp.
- **FR-005**: Users MUST be able to create a region annotation anchored to a start and
  end timestamp representing a period of audio.
- **FR-006**: Each annotation MUST carry a text note authored by the creator.
- **FR-007**: System MUST display all annotations on the timeline and in a list, showing
  their type (point or region), time position, author, and note.
- **FR-008**: Users MUST be able to edit an annotation's note and adjust its time
  position/bounds.
- **FR-009**: Users MUST be able to delete an annotation, with confirmation before
  deletion.
- **FR-010**: System MUST reject invalid annotation ranges (end before start, zero-length
  regions) and guide the user to correct them.
- **FR-011**: System MUST persist annotations locally on the user's device so they are
  present when the app is reopened, without any server.
- **FR-012**: System MUST record the author and creation time of each annotation.

#### Responses / threads

- **FR-013**: Users MUST be able to add a reply to any annotation, forming a thread.
- **FR-014**: System MUST display replies in chronological order with each reply's author
  and time posted.
- **FR-015**: Users MUST be able to edit and delete replies they authored, with the
  thread updating accordingly.
- **FR-016**: System MUST persist reply threads locally on the user's device so they are
  present when the app is reopened.

#### Local persistence & sharing

- **FR-017**: System MUST persist audio, annotations, and reply threads locally on the
  user's device so work is retained across app reloads without any server or account.
- **FR-018**: Users MUST be able to export an audio file together with its annotations and
  reply threads as a single self-contained bundle file: a zip containing the audio file
  and a JSON file describing the annotations and replies.
- **FR-019**: Users MUST be able to import a previously exported bundle file, restoring
  the audio, annotations, and reply threads for viewing and further annotation.
- **FR-020**: The exported bundle MUST be self-contained so it can be shared through any
  external channel (email, cloud drive, etc.) and opened without a network connection or
  backend service.
- **FR-021**: System MUST attribute annotations and replies to the participant who
  authored them, using the self-entered display name in effect at the time of authoring,
  and MUST preserve that attribution through export and import.
- **FR-025**: System MUST NOT require account creation, sign-in, or a backend service;
  all functionality operates locally in the browser.
- **FR-026**: On import, System MUST validate the bundle and, if it is malformed or
  missing its audio or annotation data, show a clear error state without corrupting
  existing local data.
- **FR-027**: System MUST assign every annotation and reply a stable unique identifier
  that is preserved across export and import so content can be reconciled reliably.
- **FR-028**: Importing a bundle MUST open it as a project; re-importing a bundle derived
  from the same original MUST merge annotations and replies by unique ID (union), adding
  new items and retaining existing ones without data loss.
- **FR-029**: System MUST handle large or long audio files on a best-effort basis without
  a hard size/duration limit, loading progressively with visible progress and never
  freezing the interface; it MAY warn when a file is large enough to perform slowly.
- **FR-030**: System MUST accept the common browser-playable audio formats — MP3, WAV,
  OGG, M4A/AAC, and FLAC — using native browser decoding, and MUST show a clear,
  actionable error when a file's format is not supported.

#### Cross-cutting quality (from constitution)

- **FR-022**: System MUST present explicit loading, empty, error, and success states for
  audio loading, annotation actions, and import/export actions.
- **FR-023**: System MUST require confirmation for destructive actions (deleting
  annotations, deleting replies, and overwriting existing local data on import) and
  clearly warn about their effect.
- **FR-024**: Primary annotation and playback workflows MUST be operable via keyboard and
  meet baseline contrast expectations.

### Key Entities _(include if feature involves data)_

- **Audio File**: The base audio being annotated. Attributes: identifier, source audio
  content, duration, creation time. Relationships: has many Annotations. Stored locally on
  the user's device.
- **Annotation**: A note anchored to the audio. Attributes: identifier, type (point or
  region), timestamp (point) or start/end timestamps (region), note text, author,
  creation time. Relationships: belongs to an Audio File; has many Replies.
- **Reply**: A response within an annotation's thread. Attributes: identifier, text,
  author, time posted. Relationships: belongs to an Annotation.
- **Participant**: A person who creates or responds to annotations, identified only by a
  self-entered display name (no account). The name is captured per session and stored with
  the content they author. Attributes: display name. Relationships: authors Annotations
  and Replies. Note: because there are no accounts and no in-app access control, display
  names are not unique or verified, and anyone with a bundle can view and annotate it;
  attribution is best-effort rather than authenticated.
- **Annotation Bundle**: A self-contained, shareable export of an Audio File together with
  its annotations and replies — a zip file containing the audio file and a JSON document
  describing the annotations and reply threads. Attributes: bundle (zip) file, contained
  audio, annotation/reply data, export time. Relationships: packages one Audio File and
  all of its Annotations and Replies. Shared out-of-app via external channels (email,
  cloud drive, etc.).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A user can open an audio file and create their first point or region
  annotation in under 60 seconds without instruction.
- **SC-002**: Annotations and reply threads created in a session are present with correct
  timestamps and content 100% of the time after reloading the file.
- **SC-003**: A recipient who imports an exported bundle sees the same audio, annotations,
  and reply threads as the sender, with all timestamps and content intact, in 100% of
  tested cases.
- **SC-004**: Interactive actions (play, pause, seek, create/edit annotation, post reply)
  respond within 100 ms; any longer operation shows visible progress rather than freezing.
- **SC-005**: The app remains responsive (no interface freeze) when opening large or long
  audio files, degrading gracefully with visible progress; there is no fixed maximum size
  or duration, and very large files show a slow-performance warning rather than being
  rejected.
- **SC-006**: In usability testing, at least 90% of participants successfully create an
  annotation, post a reply, and export a shareable bundle on their first attempt.
- **SC-007**: An exported bundle can be imported on a different device or browser with no
  network connection and no app-specific setup, fully restoring its audio, annotations,
  and replies in 100% of tested cases.

## Assumptions

- Participants are fully anonymous: they are identified only by a self-entered display
  name, with no accounts or sign-in. Display names are neither unique nor verified, and
  authorship attribution is best-effort rather than authenticated (see Clarifications
  2026-07-08).
- All data (audio, annotations, replies) is persisted locally on the user's device; there
  is no server, shared backend, or account system (see Clarifications 2026-07-08).
- Sharing happens out-of-app: the user exports a self-contained bundle (a zip of the audio
  file plus a JSON annotations file) and shares it through email, cloud drive, or similar;
  recipients import it. There is therefore no in-app access control — anyone who has a
  bundle has full ability to view and annotate it.
- Because collaboration happens by exchanging bundle files rather than live sync,
  independent edits by different people are reconciled at import time by merging
  annotations and replies by their unique IDs (union); real-time co-editing (live
  cursors/presence) is out of scope for v1.
- The app targets modern desktop web browsers; dedicated mobile layouts are out of scope
  for v1.
- Supported audio formats are the common browser-playable formats — MP3, WAV, OGG,
  M4A/AAC, and FLAC — decoded natively by the browser; in-app transcoding of other or
  exotic formats is out of scope for v1.
- There is no fixed maximum audio duration or file size; the app handles files on a
  best-effort basis, degrading gracefully (progressive loading, visible progress, optional
  slow-performance warning) without freezing. Interactive responsiveness budgets (SC-004)
  still apply, bounded by the host device's capabilities and local-storage limits.
