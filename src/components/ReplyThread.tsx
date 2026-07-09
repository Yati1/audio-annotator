import { useState, type ReactNode } from 'react';
import type { Reply } from '../features/types';

interface ReplyThreadProps {
  replies: Reply[];
  onAdd(text: string): void;
  onEdit(replyId: string, text: string): void;
  onDelete(replyId: string): void;
}

function replyTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

/** Chronological reply thread with add/edit/delete (FR-013, FR-014, FR-015). */
export function ReplyThread({ replies, onAdd, onEdit, onDelete }: ReplyThreadProps): ReactNode {
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onAdd(text);
      setText('');
    }
  };

  return (
    <div className="reply-thread">
      {replies.length > 0 && (
        <ul className="reply-list">
          {replies.map((r) => (
            <li key={r.id} className="reply">
              <div className="reply-head">
                <span className="author">{r.authorName}</span>
                <time dateTime={r.createdAt}>{replyTime(r.createdAt)}</time>
              </div>
              {editingId === r.id ? (
                <div className="reply-edit">
                  <input value={editDraft} onChange={(e) => setEditDraft(e.target.value)} />
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      if (editDraft.trim()) {
                        onEdit(r.id, editDraft);
                        setEditingId(null);
                      }
                    }}
                  >
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="reply-body">
                  <span>{r.text}</span>
                  <span className="reply-actions">
                    <button
                      type="button"
                      aria-label="Edit reply"
                      onClick={() => {
                        setEditingId(r.id);
                        setEditDraft(r.text);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="danger"
                      aria-label="Delete reply"
                      onClick={() => {
                        if (window.confirm('Delete this reply?')) onDelete(r.id);
                      }}
                    >
                      🗑
                    </button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="reply-form" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Reply…"
          aria-label="Add a reply"
        />
        <button type="submit" disabled={!text.trim()}>
          Reply
        </button>
      </form>
    </div>
  );
}
