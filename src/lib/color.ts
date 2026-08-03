/**
 * Per-author color assignment, so each collaborator's annotations/replies are visually
 * distinguishable. Palette is the dark-mode categorical set validated against this app's
 * `--color-surface-2` (see dataviz palette validator).
 */

export const AUTHOR_COLORS: readonly string[] = [
  '#3987e5', // blue
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
];

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Picks the first palette color not already claimed by another author in the current
 * project, so distinct collaborators get distinct colors. Once every slot is taken (more
 * than `AUTHOR_COLORS.length` concurrent authors), falls back to a deterministic hash of
 * `seed` so the same author still always lands on the same color.
 */
export function pickAuthorColor(usedByOthers: ReadonlySet<string>, seed: string): string {
  const free = AUTHOR_COLORS.find((c) => !usedByOthers.has(c));
  if (free) return free;
  return AUTHOR_COLORS[hashSeed(seed) % AUTHOR_COLORS.length];
}

/** Guards against malformed/untrusted values (e.g. a hand-edited or peer-supplied bundle). */
export function isAuthorColor(value: unknown): value is string {
  return typeof value === 'string' && AUTHOR_COLORS.includes(value);
}
