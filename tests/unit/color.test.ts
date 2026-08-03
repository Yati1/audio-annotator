import { describe, it, expect } from 'vitest';
import { AUTHOR_COLORS, isAuthorColor, pickAuthorColor } from '../../src/lib/color';

describe('pickAuthorColor', () => {
  it('picks the first palette slot when nothing is taken', () => {
    expect(pickAuthorColor(new Set(), 'author-1')).toBe(AUTHOR_COLORS[0]);
  });

  it('skips colors already used by other authors', () => {
    const used = new Set([AUTHOR_COLORS[0], AUTHOR_COLORS[1]]);
    expect(pickAuthorColor(used, 'author-3')).toBe(AUTHOR_COLORS[2]);
  });

  it('is deterministic once every slot is taken (falls back to a hash of the seed)', () => {
    const used = new Set(AUTHOR_COLORS);
    const a = pickAuthorColor(used, 'author-9');
    const b = pickAuthorColor(used, 'author-9');
    expect(a).toBe(b);
    expect(AUTHOR_COLORS).toContain(a);
  });

  it('gives different seeds a good chance of landing on different fallback slots', () => {
    const used = new Set(AUTHOR_COLORS);
    const a = pickAuthorColor(used, 'author-a');
    const b = pickAuthorColor(used, 'author-b');
    expect(a).not.toBe(b);
  });
});

describe('isAuthorColor', () => {
  it('accepts palette colors', () => {
    expect(isAuthorColor(AUTHOR_COLORS[0])).toBe(true);
  });

  it('rejects anything outside the palette', () => {
    expect(isAuthorColor('#123456')).toBe(false);
    expect(isAuthorColor('javascript:alert(1)')).toBe(false);
    expect(isAuthorColor(undefined)).toBe(false);
    expect(isAuthorColor(42)).toBe(false);
  });
});
