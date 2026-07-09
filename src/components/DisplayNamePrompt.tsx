import { useState, type ReactNode } from 'react';
import { useStore } from '../state/store';

/**
 * Prompts for a self-entered display name (FR-021, FR-025). No accounts; the name is
 * stored per session and attributed to authored content.
 */
export function DisplayNamePrompt(): ReactNode {
  const displayName = useStore((s) => s.displayName);
  const setDisplayName = useStore((s) => s.setDisplayName);
  const [value, setValue] = useState('');

  if (displayName) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = value.trim();
    if (name) void setDisplayName(name);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="dn-title">
      <form className="modal" onSubmit={submit}>
        <h2 id="dn-title">Choose a display name</h2>
        <p className="muted">
          Your name is attached to the annotations and replies you create. There are no accounts.
        </p>
        <label htmlFor="dn-input" className="visually-hidden">
          Display name
        </label>
        <input
          id="dn-input"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Sam"
        />
        <div className="modal-actions">
          <button type="submit" className="primary" disabled={!value.trim()}>
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}
