import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { isSupported } from '../features/audio/audio';
import { WaveformView, type WaveformHandle, type PendingRegion } from '../components/WaveformView';
import { TransportBar } from '../components/TransportBar';
import { AnnotationList } from '../components/AnnotationList';
import { ImportExportControls } from '../components/ImportExportControls';
import { DisplayNamePrompt } from '../components/DisplayNamePrompt';
import { DisplayNameControl } from '../components/DisplayNameControl';
import { TutorialDialog } from '../components/TutorialDialog';
import { ErrorState, Loading, Toast } from '../components/states/States';
import type { Annotation } from '../features/types';

type Draft =
  { kind: 'point'; startSec: number } | { kind: 'region'; startSec: number; endSec: number };

export function App(): ReactNode {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const notice = useStore((s) => s.notice);
  const audio = useStore((s) => s.audio);
  const hasProject = useStore((s) => s.project !== null);
  const objectUrl = useStore((s) => s.objectUrl);
  const annotations = useStore((s) => s.annotations);
  const repliesByAnnotation = useStore((s) => s.repliesByAnnotation);
  const authorColor = useStore((s) => s.authorColor);

  const init = useStore((s) => s.init);
  const loadAudioFile = useStore((s) => s.loadAudioFile);
  const newProject = useStore((s) => s.newProject);
  const addPoint = useStore((s) => s.addPoint);
  const addRegion = useStore((s) => s.addRegion);
  const editAnnotation = useStore((s) => s.editAnnotation);
  const deleteAnnotation = useStore((s) => s.deleteAnnotation);
  const addReply = useStore((s) => s.addReply);
  const editReply = useStore((s) => s.editReply);
  const deleteReply = useStore((s) => s.deleteReply);
  const clearError = useStore((s) => s.clearError);
  const clearNotice = useStore((s) => s.clearNotice);

  const waveRef = useRef<WaveformHandle>(null);
  const guideButtonRef = useRef<HTMLButtonElement>(null);
  const [playing, setPlaying] = useState(false);
  const [playingAnnotationId, setPlayingAnnotationId] = useState<string | null>(null);
  const [currentSec, setCurrentSec] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [tutorialOpen, setTutorialOpen] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  // Discard any in-progress draft when the audio file changes — otherwise its
  // timestamps (and, on the waveform, its draft region) stay pinned to the old file.
  // Also reset playback state: WaveformView is torn down and rebuilt for the new url,
  // and neither the outgoing instance's teardown nor the incoming one's setup emits
  // onPlayState, so a mid-playback file switch would otherwise leave the transport
  // stuck showing Pause with a stale playingAnnotationId.
  useEffect(() => {
    setDraft(null);
    setDraftNote('');
    setPlaying(false);
    setPlayingAnnotationId(null);
  }, [objectUrl]);

  // Keyboard shortcuts for primary flows (FR-024).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      // The guide covers the workspace, so its shortcuts would act out of sight.
      if (tutorialOpen) return;
      if (!audio) return;
      if (e.code === 'Space') {
        e.preventDefault();
        waveRef.current?.playPause();
      } else if (e.key.toLowerCase() === 'p') {
        setDraft({ kind: 'point', startSec: waveRef.current?.getCurrentTime() ?? 0 });
        setDraftNote('');
      } else if (e.key.toLowerCase() === 'r') {
        const start = waveRef.current?.getCurrentTime() ?? 0;
        setDraft({ kind: 'region', startSec: start, endSec: Math.min(start + 5, duration) });
        setDraftNote('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [audio, duration, tutorialOpen]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isSupported(file)) {
      useStore.setState({ error: 'Unsupported audio format. Use MP3, WAV, OGG, M4A, or FLAC.' });
      return;
    }
    void loadAudioFile(file);
  };

  const onNewProject = () => {
    if (!window.confirm('Start a new project? This cannot be undone.')) return;
    setSelectedId(null);
    void newProject();
  };

  const onPendingRegion = (region: PendingRegion) => {
    setDraft({
      kind: 'region',
      startSec: region.startSec,
      endSec: region.endSec ?? region.startSec + 1,
    });
    setDraftNote('');
  };

  const saveDraft = async () => {
    if (!draft || !draftNote.trim()) return;
    const id =
      draft.kind === 'point'
        ? await addPoint(draft.startSec, draftNote)
        : await addRegion(draft.startSec, draft.endSec, draftNote);
    if (id) {
      setSelectedId(id);
      setDraft(null);
      setDraftNote('');
    }
  };

  const closeTutorial = () => {
    setTutorialOpen(false);
    guideButtonRef.current?.focus();
  };

  // Every way playback can end while the current file stays loaded — a region reaching
  // its bound, the track running out, Space, the transport's Pause, another annotation's
  // stop button — surfaces here, so clearing the id in one place keeps each row's
  // play/stop button honest without tracking those paths individually. (A file switch is
  // handled separately above, since swapping WaveformView instances never emits this.)
  const onPlayState = (isPlaying: boolean) => {
    setPlaying(isPlaying);
    if (!isPlaying) setPlayingAnnotationId(null);
  };

  const playAnnotation = (a: Annotation) => {
    setSelectedId(a.id);
    setPlayingAnnotationId(a.id);
    if (a.kind === 'region' && a.endSec !== null) {
      waveRef.current?.playRegion(a.startSec, a.endSec);
    } else {
      waveRef.current?.playFrom(a.startSec);
    }
  };

  const stopAnnotation = () => {
    waveRef.current?.pause();
  };

  return (
    <div className="app">
      <DisplayNamePrompt />

      <header className="app-header">
        <h1>Audio Annotator</h1>
        <div className="header-controls">
          <label className="file-button">
            Open audio…
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac"
              className="visually-hidden"
              onChange={onPickFile}
              data-testid="open-audio-input"
            />
          </label>
          <button
            type="button"
            onClick={onNewProject}
            disabled={!hasProject || status === 'loading'}
            data-testid="new-project-button"
          >
            New Project
          </button>
          <ImportExportControls />
          <DisplayNameControl />
          <button ref={guideButtonRef} type="button" onClick={() => setTutorialOpen(true)}>
            Guide
          </button>
        </div>
      </header>

      {tutorialOpen && <TutorialDialog onClose={closeTutorial} />}

      {error && <ErrorState message={error} onDismiss={clearError} />}
      {notice && <Toast message={notice} onDismiss={clearNotice} />}

      {status === 'loading' && <Loading />}

      {!audio && status !== 'loading' && (
        <main className="empty-main">
          <p className="muted">Open an audio file or import a bundle to begin annotating.</p>
        </main>
      )}

      {audio && objectUrl && (
        <main className="workspace">
          <section className="stage">
            <WaveformView
              ref={waveRef}
              url={objectUrl}
              annotations={annotations}
              selectedId={selectedId}
              authorColor={authorColor}
              draftRegion={
                draft?.kind === 'region' ? { startSec: draft.startSec, endSec: draft.endSec } : null
              }
              onReady={setDuration}
              onTime={setCurrentSec}
              onPlayState={onPlayState}
              onPendingRegion={onPendingRegion}
              onSelectAnnotation={setSelectedId}
            />
            <TransportBar
              playing={playing}
              currentSec={currentSec}
              durationSec={duration || audio.durationSec}
              onPlayPause={() => waveRef.current?.playPause()}
              onAddPoint={() => {
                setDraft({ kind: 'point', startSec: waveRef.current?.getCurrentTime() ?? 0 });
                setDraftNote('');
              }}
              onStartRegionAtPlayhead={() => {
                const start = waveRef.current?.getCurrentTime() ?? 0;
                setDraft({
                  kind: 'region',
                  startSec: start,
                  endSec: Math.min(start + 5, duration || audio.durationSec),
                });
                setDraftNote('');
              }}
            />

            {draft && (
              <div
                className="draft-form"
                role="dialog"
                aria-label="New annotation"
                data-testid="draft-dialog"
              >
                <strong>{draft.kind === 'point' ? 'New point' : 'New region'}</strong>
                <textarea
                  autoFocus
                  rows={2}
                  value={draftNote}
                  placeholder="Add a note…"
                  onChange={(e) => setDraftNote(e.target.value)}
                  data-testid="draft-note-textarea"
                />
                <div className="row-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void saveDraft()}
                    disabled={!draftNote.trim()}
                  >
                    Save
                  </button>
                  <button type="button" onClick={() => setDraft(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>

          <aside className="side-panel" aria-label="Annotations panel">
            <AnnotationList
              annotations={annotations}
              repliesByAnnotation={repliesByAnnotation}
              selectedId={selectedId}
              playingId={playingAnnotationId}
              onSelect={setSelectedId}
              onPlay={playAnnotation}
              onStop={stopAnnotation}
              onEdit={(id, note) => void editAnnotation(id, { note })}
              onDelete={(id) => void deleteAnnotation(id)}
              onAddReply={(annotationId, text) => void addReply(annotationId, text)}
              onEditReply={(annotationId, replyId, text) =>
                void editReply(annotationId, replyId, text)
              }
              onDeleteReply={(annotationId, replyId) => void deleteReply(annotationId, replyId)}
            />
          </aside>
        </main>
      )}
    </div>
  );
}
