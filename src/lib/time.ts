/** Timestamp formatting and validation helpers. */

/** ISO 8601 timestamp for "now". */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Formats seconds as `m:ss` or `h:mm:ss` for display on the timeline.
 * Negative or non-finite values are clamped to 0.
 */
export function formatTime(totalSeconds: number): string {
  const s = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** True when `t` is a finite number within [0, duration]. */
export function isWithin(t: number, duration: number): boolean {
  return Number.isFinite(t) && t >= 0 && t <= duration;
}

/** Clamps `t` into [0, duration]. */
export function clamp(t: number, duration: number): number {
  if (!Number.isFinite(t)) return 0;
  return Math.min(Math.max(t, 0), duration);
}
