import { describe, it, expect } from 'vitest';
import { annotationService } from '../../src/features/annotations/annotations';

const base = { projectId: 'p1', note: 'test', authorName: 'Sam' };

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
