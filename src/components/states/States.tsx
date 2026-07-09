import type { ReactNode } from 'react';

export function Loading({ label = 'Loading…' }: { label?: string }): ReactNode {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="state state-empty" role="note">
      {children}
    </div>
  );
}

export function ErrorState({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}): ReactNode {
  return (
    <div className="state state-error" role="alert">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss error">
          Dismiss
        </button>
      )}
    </div>
  );
}

export function Toast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}): ReactNode {
  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss notice">
          ✕
        </button>
      )}
    </div>
  );
}
