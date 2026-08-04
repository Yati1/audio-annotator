import { describe, it, expect } from 'vitest';
import {
  AUTHOR_COLORS,
  isAuthorColor,
  pickAuthorColor,
  pointMarkerContent,
  safeAuthorColor,
  withAlpha,
} from '../../src/lib/color';

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

describe('withAlpha', () => {
  it('converts a palette hex to an rgba string at the given alpha', () => {
    expect(withAlpha('#3987e5', 0.25)).toBe('rgba(57, 135, 229, 0.25)');
  });

  it('converts every palette color without producing NaN components', () => {
    for (const hex of AUTHOR_COLORS) {
      expect(withAlpha(hex, 0.25)).not.toMatch(/NaN/);
    }
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

describe('safeAuthorColor', () => {
  it('passes through a known palette color unchanged', () => {
    expect(safeAuthorColor(AUTHOR_COLORS[2])).toBe(AUTHOR_COLORS[2]);
  });

  it('falls back to the first palette color for a value outside the palette', () => {
    expect(safeAuthorColor('#123456')).toBe(AUTHOR_COLORS[0]);
  });

  it('falls back to the first palette color for an undefined/legacy value', () => {
    expect(safeAuthorColor(undefined)).toBe(AUTHOR_COLORS[0]);
  });
});

describe('pointMarkerContent', () => {
  it('builds a bullet element colored with the given author color', () => {
    const el = pointMarkerContent('#d95926');
    expect(el.textContent).toBe('●');
    expect(el.style.color).toBe('rgb(217, 89, 38)');
  });
});
