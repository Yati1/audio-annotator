/** Synthesizes tiny, valid WAV files in-memory for E2E tests — no binary fixtures on disk. */

export interface WavFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** 8-bit mono PCM silence. Small enough (~2KB for 2s) to keep tests fast. */
export function makeWavFile(
  opts: { name?: string; durationSec?: number; sampleRate?: number } = {},
): WavFile {
  const sampleRate = opts.sampleRate ?? 8000;
  const durationSec = opts.durationSec ?? 2;
  const dataSize = Math.round(sampleRate * durationSec);
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate, 28); // byte rate (1 byte/sample * sampleRate)
  buf.writeUInt16LE(1, 32); // block align
  buf.writeUInt16LE(8, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  buf.fill(128, 44); // silence at the 8-bit unsigned midpoint

  return { name: opts.name ?? 'clip-a.wav', mimeType: 'audio/wav', buffer: buf };
}
