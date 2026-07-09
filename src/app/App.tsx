import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { isSupported } from '../features/audio/audio';
import { WaveformView, type WaveformHandle, type PendingRegion } from '../components/WaveformView';
import { TransportBar } from '../components/TransportBar';
import { AnnotationList } from '../components/AnnotationList';
import { ImportExportControls } from '../components/ImportExportControls';
import { DisplayNamePrompt } from '../components/DisplayNamePrompt';
import { ErrorState, Loading, Toast } from '../components/states/States';
import type { Annotation } from '../features/types';

type Draft =
  { kind: 'point'; startSec: number } | { kind: 'region'; startSec: number; endSec: number };

export function App(): ReactNode {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const notice = useStore((s) => s.notice);
  const audio = useStore((s) => s.audio);
  const objectUrl = useStore((s) => s.objectUrl);
  const annotations = useStore((s) => s.annotations);
  const repliesByAnnotation = useStore((s) => s.repliesByAnnotation);

  const init = useStore((s) => s.init);
  const loadAudioFile = useStore((s) => s.loadAudioFile);
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
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftNote, setDraftNote] = useState('');

  useEffect(() => {
    void init();
  }, [init]);

  // Keyboard shortcuts for primary flows (FR-024).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
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
  }, [audio, duration]);

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

  const playAnnotation = (a: Annotation) => {
    setSelectedId(a.id);
    if (a.kind === 'region' && a.endSec !== null) {
      waveRef.current?.playRegion(a.startSec, a.endSec);
    } else {
      waveRef.current?.seekTo(a.startSec);
    }
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
            />
          </label>
          <ImportExportControls />
        </div>
      </header>

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
              onReady={setDuration}
              onTime={setCurrentSec}
              onPlayState={setPlaying}
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
              <div className="draft-form" role="dialog" aria-label="New annotation">
                <strong>{draft.kind === 'point' ? 'New point' : 'New region'}</strong>
                <textarea
                  autoFocus
                  rows={2}
                  value={draftNote}
                  placeholder="Add a note…"
                  onChange={(e) => setDraftNote(e.target.value)}
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
              onSelect={setSelectedId}
              onPlay={playAnnotation}
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
