import { useState, type ReactNode } from 'react';
import type { Annotation, Reply } from '../features/types';
import { formatTime } from '../lib/time';
import { ReplyThread } from './ReplyThread';

interface AnnotationItemProps {
  annotation: Annotation;
  replies: Reply[];
  selected: boolean;
  onSelect(): void;
  onPlay(): void;
  onEdit(note: string): void;
  onDelete(): void;
  onAddReply(text: string): void;
  onEditReply(replyId: string, text: string): void;
  onDeleteReply(replyId: string): void;
}

export function AnnotationItem({
  annotation,
  replies,
  selected,
  onSelect,
  onPlay,
  onEdit,
  onDelete,
  onAddReply,
  onEditReply,
  onDeleteReply,
}: AnnotationItemProps): ReactNode {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(annotation.note);

  const activeReplies = replies.filter((r) => !r.deleted);
  const timeLabel =
    annotation.kind === 'region'
      ? `${formatTime(annotation.startSec)}–${formatTime(annotation.endSec ?? annotation.startSec)}`
      : formatTime(annotation.startSec);

  const saveEdit = () => {
    if (draft.trim()) {
      onEdit(draft);
      setEditing(false);
    }
  };

  const confirmDelete = () => {
    const msg =
      activeReplies.length > 0
        ? `Delete this annotation and its ${activeReplies.length} repl${
            activeReplies.length === 1 ? 'y' : 'ies'
          }? This cannot be undone.`
        : 'Delete this annotation? This cannot be undone.';
    if (window.confirm(msg)) onDelete();
  };

  return (
    <li className={`annotation-item${selected ? ' selected' : ''}`}>
      <div className="annotation-head">
        <button
          type="button"
          className="badge"
          onClick={onSelect}
          aria-label={`Select ${annotation.kind}`}
        >
          {annotation.kind === 'region' ? '▭' : '●'} {timeLabel}
        </button>
        <span className="author">{annotation.authorName}</span>
        <div className="annotation-actions">
          <button type="button" onClick={onPlay} aria-label="Play this annotation">
            ►
          </button>
          <button type="button" onClick={() => setEditing((e) => !e)} aria-label="Edit note">
            ✎
          </button>
          <button
            type="button"
            className="danger"
            onClick={confirmDelete}
            aria-label="Delete annotation"
          >
            🗑
          </button>
        </div>
      </div>

      {editing ? (
        <div className="annotation-edit">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} />
          <div className="row-actions">
            <button type="button" className="primary" onClick={saveEdit} disabled={!draft.trim()}>
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="annotation-note">{annotation.note}</p>
      )}

      <ReplyThread
        replies={activeReplies}
        onAdd={onAddReply}
        onEdit={onEditReply}
        onDelete={onDeleteReply}
      />
    </li>
  );
}
