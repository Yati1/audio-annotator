/**
 * Audio loading and validation. Validates the file's format against the supported set
 * (FR-030), extracts duration metadata, and produces an object URL for playback. Playback
 * control itself lives in the WaveformView component.
 */
import { newId } from '../../lib/id';
import { err, ok, type Result } from '../../lib/result';
import type { AudioRecord } from '../types';

export type AudioErrorCode = 'E_AUDIO_TYPE' | 'E_DECODE';

export interface AudioError {
  code: AudioErrorCode;
  message: string;
}

const SUPPORTED_MIME = new Set<string>([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/aac',
  'audio/flac',
  'audio/x-flac',
]);

const EXT_TO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
};

/** Resolves a usable MIME type from the file's type or, failing that, its extension. */
export function resolveMime(file: { name: string; type: string }): string | null {
  if (file.type && SUPPORTED_MIME.has(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const fromExt = EXT_TO_MIME[ext];
  return fromExt ?? (file.type && SUPPORTED_MIME.has(file.type) ? file.type : null);
}

export function isSupported(file: { name: string; type: string }): boolean {
  return resolveMime(file) !== null;
}

/** Reads the duration of an audio file via an <audio> element and object URL. */
function readDuration(objectUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('audio');
    el.preload = 'metadata';
    el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : 0);
    el.onerror = () => reject(new Error('decode failed'));
    el.src = objectUrl;
  });
}

export interface AudioService {
  load(file: File): Promise<Result<{ record: AudioRecord; objectUrl: string }, AudioError>>;
  revoke(objectUrl: string): void;
}

export const audioService: AudioService = {
  async load(file) {
    const mimeType = resolveMime(file);
    if (!mimeType) {
      return err({
        code: 'E_AUDIO_TYPE',
        message: `Unsupported audio format: ${file.type || file.name}`,
      });
    }
    const objectUrl = URL.createObjectURL(file);
    let durationSec = 0;
    try {
      durationSec = await readDuration(objectUrl);
    } catch {
      URL.revokeObjectURL(objectUrl);
      return err({ code: 'E_DECODE', message: 'Could not read this audio file.' });
    }
    const record: AudioRecord = {
      id: newId(),
      fileName: file.name,
      mimeType,
      durationSec,
      byteSize: file.size,
      blob: file,
    };
    return ok({ record, objectUrl });
  },

  revoke(objectUrl) {
    URL.revokeObjectURL(objectUrl);
  },
};

/** Large-file threshold for the "may be slow" notice (FR-029). No hard limit. */
export const LARGE_FILE_BYTES = 150 * 1024 * 1024;
