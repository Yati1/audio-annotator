import { describe, it, expect } from 'vitest';
import { annotationService, regionFromPlayhead } from '../../src/features/annotations/annotations';

const base = {
  projectId: 'p1',
  note: 'test',
  authorName: 'Sam',
  authorColor: '#3987e5',
  authorId: 'device-sam',
};

describe('annotation validation', () => {
  it('creates a valid point', () => {
    const r = annotationService.createPoint({ ...base, startSec: 5 }, 120);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.kind).toBe('point');
      expect(r.value.endSec).toBeNull();
    }
  });

  it('rejects point beyond duration', () => {
    const r = annotationService.createPoint({ ...base, startSec: 200 }, 120);
    expect(r.ok).toBe(false);
  });

  it('creates a valid region', () => {
    const r = annotationService.createRegion({ ...base, startSec: 10, endSec: 20 }, 120);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.kind).toBe('region');
      expect(r.value.endSec).toBe(20);
    }
  });

  it('rejects region end <= start', () => {
    const r = annotationService.createRegion({ ...base, startSec: 10, endSec: 10 }, 120);
    expect(r.ok).toBe(false);
  });

  it('rejects region end before start', () => {
    const r = annotationService.createRegion({ ...base, startSec: 10, endSec: 5 }, 120);
    expect(r.ok).toBe(false);
  });

  it('rejects empty note', () => {
    const r = annotationService.createPoint({ ...base, note: '   ', startSec: 5 }, 120);
    expect(r.ok).toBe(false);
  });

  it('soft-deletes (tombstone) without removing', () => {
    const r = annotationService.createPoint({ ...base, startSec: 5 }, 120);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const deleted = annotationService.remove(r.value);
      expect(deleted.deleted).toBe(true);
      expect(deleted.id).toBe(r.value.id);
    }
  });

  it('edits note', () => {
    const r = annotationService.createPoint({ ...base, startSec: 5 }, 120);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const edited = annotationService.edit(r.value, { note: 'updated' }, 120);
      expect(edited.ok).toBe(true);
      if (edited.ok) expect(edited.value.note).toBe('updated');
    }
  });
});

describe('regionFromPlayhead', () => {
  it('runs five seconds from the playhead', () => {
    expect(regionFromPlayhead(10, 120)).toEqual({ startSec: 10, endSec: 15 });
  });

  it('is cut short by the end of the track', () => {
    expect(regionFromPlayhead(118, 120)).toEqual({ startSec: 118, endSec: 120 });
  });

  it('covers the last five seconds when the playhead is at the very end', () => {
    expect(regionFromPlayhead(120, 120)).toEqual({ startSec: 115, endSec: 120 });
  });

  it('covers the whole track when it is shorter than five seconds', () => {
    expect(regionFromPlayhead(1, 1)).toEqual({ startSec: 0, endSec: 1 });
  });
});

describe('editing bounds', () => {
  it('moves a region and rejects an end at or before its start', () => {
    const r = annotationService.createRegion({ ...base, startSec: 10, endSec: 20 }, 120);
    if (!r.ok) throw new Error('setup failed');
    const moved = annotationService.edit(r.value, { startSec: 30, endSec: 40 }, 120);
    expect(moved.ok && moved.value.startSec).toBe(30);
    const inverted = annotationService.edit(r.value, { endSec: 5 }, 120);
    expect(inverted.ok).toBe(false);
  });
});
