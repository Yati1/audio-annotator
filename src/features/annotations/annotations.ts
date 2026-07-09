/**
 * Annotation domain logic: create point/region annotations, edit, soft-delete, and
 * validate. Pure and framework-agnostic (FR-004, FR-005, FR-006, FR-008, FR-009, FR-010).
 */
import { newId } from '../../lib/id';
import { nowIso } from '../../lib/time';
import { err, ok, type Result } from '../../lib/result';
import type { Annotation } from '../types';

export interface ValidationError {
  code: 'E_VALIDATION';
  message: string;
}

function invalid(message: string): ValidationError {
  return { code: 'E_VALIDATION', message };
}

export interface CreatePointInput {
  projectId: string;
  startSec: number;
  note: string;
  authorName: string;
}

export interface CreateRegionInput extends CreatePointInput {
  endSec: number;
}

/**
 * Validates an annotation against the audio duration and the point/region rules.
 * - point ⇒ endSec === null
 * - region ⇒ startSec < endSec <= duration
 * - note non-empty; startSec >= 0
 */
export function validate(a: Annotation, durationSec: number): Result<Annotation, ValidationError> {
  if (!a.note.trim()) return err(invalid('Note cannot be empty.'));
  if (!Number.isFinite(a.startSec) || a.startSec < 0) {
    return err(invalid('Start time must be zero or positive.'));
  }
  if (a.startSec > durationSec) {
    return err(invalid('Start time is beyond the end of the audio.'));
  }
  if (a.kind === 'point') {
    if (a.endSec !== null) return err(invalid('Point annotations cannot have an end time.'));
    return ok(a);
  }
  // region
  if (a.endSec === null || !Number.isFinite(a.endSec)) {
    return err(invalid('Region annotations require an end time.'));
  }
  if (a.endSec <= a.startSec) {
    return err(invalid('End time must be after the start time.'));
  }
  if (a.endSec > durationSec) {
    return err(invalid('End time is beyond the end of the audio.'));
  }
  return ok(a);
}

export interface AnnotationService {
  createPoint(input: CreatePointInput, durationSec: number): Result<Annotation, ValidationError>;
  createRegion(input: CreateRegionInput, durationSec: number): Result<Annotation, ValidationError>;
  edit(
    current: Annotation,
    patch: Partial<Pick<Annotation, 'note' | 'startSec' | 'endSec'>>,
    durationSec: number,
  ): Result<Annotation, ValidationError>;
  remove(current: Annotation): Annotation;
}

export const annotationService: AnnotationService = {
  createPoint(input, durationSec) {
    const now = nowIso();
    const annotation: Annotation = {
      id: newId(),
      projectId: input.projectId,
      kind: 'point',
      startSec: input.startSec,
      endSec: null,
      note: input.note.trim(),
      authorName: input.authorName,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    };
    return validate(annotation, durationSec);
  },

  createRegion(input, durationSec) {
    const now = nowIso();
    const annotation: Annotation = {
      id: newId(),
      projectId: input.projectId,
      kind: 'region',
      startSec: input.startSec,
      endSec: input.endSec,
      note: input.note.trim(),
      authorName: input.authorName,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    };
    return validate(annotation, durationSec);
  },

  edit(current, patch, durationSec) {
    const next: Annotation = {
      ...current,
      ...('note' in patch && patch.note !== undefined ? { note: patch.note.trim() } : {}),
      ...('startSec' in patch && patch.startSec !== undefined ? { startSec: patch.startSec } : {}),
      ...('endSec' in patch ? { endSec: patch.endSec ?? null } : {}),
      updatedAt: nowIso(),
    };
    return validate(next, durationSec);
  },

  remove(current) {
    return { ...current, deleted: true, updatedAt: nowIso() };
  },
};
