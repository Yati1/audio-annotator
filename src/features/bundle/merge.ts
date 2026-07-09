/**
 * Pure merge logic for reconciling an incoming project with the local one (FR-027/FR-028).
 * Union by unique id; tombstones win to prevent resurrection; divergent same-id edits are
 * flagged as conflicts rather than silently overwritten.
 */
import type { Annotation, FullProject, Reply } from '../types';

export interface MergeOutcome {
  project: FullProject;
  added: { annotations: number; replies: number };
  conflicts: Array<{ kind: 'annotation' | 'reply'; id: string }>;
}

function annotationsEqual(a: Annotation, b: Annotation): boolean {
  return (
    a.kind === b.kind &&
    a.startSec === b.startSec &&
    a.endSec === b.endSec &&
    a.note === b.note &&
    !!a.deleted === !!b.deleted
  );
}

function repliesEqual(a: Reply, b: Reply): boolean {
  return a.text === b.text && !!a.deleted === !!b.deleted;
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
      conflicts: [],
    };
  }

  const conflicts: MergeOutcome['conflicts'] = [];
  let addedA = 0;
  let addedR = 0;

  // Annotations
  const annoById = new Map<string, Annotation>();
  for (const a of local.annotations) annoById.set(a.id, a);
  for (const inc of incoming.annotations) {
    const existing = annoById.get(inc.id);
    if (!existing) {
      annoById.set(inc.id, inc);
      addedA++;
      continue;
    }
    if (existing.deleted || inc.deleted) {
      annoById.set(inc.id, { ...existing, deleted: true });
    } else if (!annotationsEqual(existing, inc)) {
      conflicts.push({ kind: 'annotation', id: inc.id });
      // keep local; do not overwrite
    }
  }

  // Replies
  const replyById = new Map<string, Reply>();
  for (const r of local.replies) replyById.set(r.id, r);
  for (const inc of incoming.replies) {
    const existing = replyById.get(inc.id);
    if (!existing) {
      replyById.set(inc.id, inc);
      addedR++;
      continue;
    }
    if (existing.deleted || inc.deleted) {
      replyById.set(inc.id, { ...existing, deleted: true });
    } else if (!repliesEqual(existing, inc)) {
      conflicts.push({ kind: 'reply', id: inc.id });
    }
  }

  return {
    project: {
      project: { ...local.project, updatedAt: new Date().toISOString() },
      audio: local.audio,
      annotations: [...annoById.values()],
      replies: [...replyById.values()],
    },
    added: { annotations: addedA, replies: addedR },
    conflicts,
  };
}
