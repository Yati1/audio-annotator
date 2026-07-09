import type { ReactNode } from 'react';
import { formatTime } from '../lib/time';

interface TransportBarProps {
  playing: boolean;
  currentSec: number;
  durationSec: number;
  onPlayPause(): void;
  onAddPoint(): void;
  onStartRegionAtPlayhead(): void;
}

/** Playback transport plus quick annotation-creation controls. */
export function TransportBar({
  playing,
  currentSec,
  durationSec,
  onPlayPause,
  onAddPoint,
  onStartRegionAtPlayhead,
}: TransportBarProps): ReactNode {
  return (
    <div className="transport" role="toolbar" aria-label="Playback and annotation controls">
      <button
        type="button"
        className="primary"
        onClick={onPlayPause}
        aria-label={playing ? 'Pause (Space)' : 'Play (Space)'}
      >
        {playing ? '❚❚ Pause' : '► Play'}
      </button>
      <span className="time" aria-live="off">
        {formatTime(currentSec)} / {formatTime(durationSec)}
      </span>
      <div className="transport-spacer" />
      <button type="button" onClick={onAddPoint} aria-label="Add point annotation at playhead (P)">
        + Point
      </button>
      <button
        type="button"
        onClick={onStartRegionAtPlayhead}
        aria-label="Add region annotation from playhead (R)"
      >
        + Region
      </button>
    </div>
  );
}
