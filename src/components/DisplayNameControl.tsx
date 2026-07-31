import { useState, type ReactNode } from 'react';
import { useStore } from '../state/store';

/**
 * Lets the user change the display name they chose in DisplayNamePrompt. Past
 * annotations/replies authored on this device are relabeled to match (FR-021);
 * content authored by someone else is left untouched.
 */
export function DisplayNameControl(): ReactNode {
  const displayName = useStore((s) => s.displayName);
  const setDisplayName = useStore((s) => s.setDisplayName);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(displayName);

  if (!displayName) return null;

  const openEditor = () => {
    setValue(displayName);
    setEditing(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = value.trim();
    if (name) void setDisplayName(name);
    setEditing(false);
  };

  return (
    <div className="display-name-control">
      <span className="muted" data-testid="display-name-label">
        Name: <strong>{displayName}</strong>
      </span>
      <button type="button" onClick={openEditor}>
        Change name
      </button>

      {editing && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edn-title">
          <form className="modal" onSubmit={submit}>
            <h2 id="edn-title">Change your display name</h2>
            <p className="muted">
              Annotations and replies you've already authored will be updated to the new name.
            </p>
            <label htmlFor="edn-input" className="visually-hidden">
              Display name
            </label>
            <input
              id="edn-input"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <div className="modal-actions">
              <button type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={!value.trim()}>
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
