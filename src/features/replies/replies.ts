/**
 * Reply thread domain logic: add, edit, soft-delete, and chronological ordering
 * (FR-013, FR-014, FR-015).
 */
import { newId } from '../../lib/id';
import { nowIso } from '../../lib/time';
import { err, ok, type Result } from '../../lib/result';
import type { Reply } from '../types';

export interface ValidationError {
  code: 'E_VALIDATION';
  message: string;
}

export interface AddReplyInput {
  annotationId: string;
  text: string;
  authorName: string;
}

export interface ReplyService {
  add(input: AddReplyInput): Result<Reply, ValidationError>;
  edit(current: Reply, text: string): Result<Reply, ValidationError>;
  remove(current: Reply): Reply;
  ordered(replies: Reply[]): Reply[];
}

export const replyService: ReplyService = {
  add(input) {
    if (!input.text.trim()) {
      return err({ code: 'E_VALIDATION', message: 'Reply cannot be empty.' });
    }
    const now = nowIso();
    return ok({
      id: newId(),
      annotationId: input.annotationId,
      text: input.text.trim(),
      authorName: input.authorName,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    });
  },

  edit(current, text) {
    if (!text.trim()) {
      return err({ code: 'E_VALIDATION', message: 'Reply cannot be empty.' });
    }
    return ok({ ...current, text: text.trim(), updatedAt: nowIso() });
  },

  remove(current) {
    return { ...current, deleted: true, updatedAt: nowIso() };
  },

  /** Non-deleted replies in chronological order (FR-014). */
  ordered(replies) {
    return replies
      .filter((r) => !r.deleted)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  },
};
