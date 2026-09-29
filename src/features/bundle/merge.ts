/**
 * Pure merge logic for reconciling an incoming project with the local one (FR-027/FR-028).
 * Union by unique id. For an id on both sides the newer `updatedAt` wins, and a tombstone
 * on either side wins so deletions never resurrect. Only the author's device can edit an
 * item (FR-015), so its versions form one line and the newer one is always the right one.
 */
import type { FullProject } from '../types';

export interface MergeOutcome {
  project: FullProject;
  added: { annotations: number; replies: number };
  /** Items that existed locally and were replaced by a newer or deleted incoming version. */
  updated: { annotations: number; replies: number };
}

interface Mergeable {
  id: string;
  authorId: string;
  updatedAt: string;
  deleted?: boolean;
}

/** Picks the version of one item to keep, and whether it differs from the local one. */
function mergeItem<T extends Mergeable>(local: T, incoming: T): { item: T; changed: boolean } {
  // Only the author's device can change an item, so a copy under another author was
  // hand-edited. Ignore it, delete included.
  if (incoming.authorId !== local.authorId) return { item: local, changed: false };
  // Equal timestamps keep local: they can only differ in content if a bundle was hand-edited.
  const newer = incoming.updatedAt > local.updatedAt ? incoming : local;
  if (local.deleted || incoming.deleted) {
    return { item: { ...newer, deleted: true }, changed: !local.deleted || newer !== local };
  }
  return { item: newer, changed: newer !== local };
}

function mergeById<T extends Mergeable>(
  local: T[],
  incoming: T[],
): { items: T[]; added: number; updated: number } {
  const byId = new Map<string, T>();
  for (const item of local) byId.set(item.id, item);
  let added = 0;
  let updated = 0;
  for (const inc of incoming) {
    const existing = byId.get(inc.id);
    if (!existing) {
      byId.set(inc.id, inc);
      added++;
      continue;
    }
    const { item, changed } = mergeItem(existing, inc);
    byId.set(inc.id, item);
    if (changed) updated++;
  }
  return { items: [...byId.values()], added, updated };
}

/**
 * Merges `incoming` into `local`. When `local` is null the incoming project is returned
 * as-is (opened as a new project).
 */
export function merge(local: FullProject | null, incoming: FullProject): MergeOutcome {
  if (!local) {
    return {
      project: incoming,
      added: { annotations: incoming.annotations.length, replies: incoming.replies.length },
      updated: { annotations: 0, replies: 0 },
    };
  }

  const annotations = mergeById(local.annotations, incoming.annotations);
  const replies = mergeById(local.replies, incoming.replies);

  return {
    project: {
      project: { ...local.project, updatedAt: new Date().toISOString() },
      audio: local.audio,
      annotations: annotations.items,
      replies: replies.items,
    },
    added: { annotations: annotations.added, replies: replies.added },
    updated: { annotations: annotations.updated, replies: replies.updated },
  };
}
