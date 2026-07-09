import { useRef, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';

/** Export the current project to a bundle and import bundles back (US3). */
export function ImportExportControls(): ReactNode {
  const hasProject = useStore((s) => s.project !== null);
  const exportBundle = useStore((s) => s.exportBundle);
  const importBundle = useStore((s) => s.importBundle);
  const project = useStore((s) => s.project);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onExport = async () => {
    setBusy(true);
    setMessage(null);
    const blob = await exportBundle();
    setBusy(false);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = (project?.title ?? 'annotations').replace(/[^\w.-]+/g, '_');
    a.href = url;
    a.download = `${name}.aannz`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Bundle exported.');
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setMessage(null);
    const result = await importBundle(file);
    setBusy(false);
    if (result) {
      setMessage(
        `Imported. ${result.added} new item(s)` +
          (result.conflicts > 0 ? `, ${result.conflicts} conflict(s) flagged.` : '.'),
      );
    }
  };

  return (
    <div className="import-export">
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
        Import bundle…
      </button>
      <button type="button" onClick={onExport} disabled={busy || !hasProject}>
        Export bundle
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".aannz,.zip,application/zip"
        className="visually-hidden"
        onChange={onImportFile}
      />
      {message && (
        <span className="io-message" role="status">
          {message}
        </span>
      )}
    </div>
  );
}
