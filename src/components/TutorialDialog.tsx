import { useEffect, useRef, type ReactNode } from 'react';
import emptyState from '../../docs/screenshots/empty-state.png';
import waveformLoaded from '../../docs/screenshots/waveform-loaded.png';
import newPointDialog from '../../docs/screenshots/new-point-dialog.png';
import pointAnnotation from '../../docs/screenshots/point-annotation.png';
import createRegion from '../../docs/screenshots/create-region-annotation.gif';
import replyThread from '../../docs/screenshots/reply-thread.png';
import headerControls from '../../docs/screenshots/header-controls.png';

/**
 * The "Using the app" walkthrough from the README, viewable in-app. It mirrors
 * README.md's "Using the app" section by hand, so edits to either need applying twice;
 * the wording differs only where it has to address the reader of this dialog.
 *
 * App owns the open/closed state so its global P/R shortcuts can stand down while
 * this is up; closing is left to the caller, which also restores focus to the trigger.
 */
export function TutorialDialog({ onClose }: { onClose: () => void }): ReactNode {
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      // Only a press *and* release on the backdrop itself dismisses, checked on mouseup
      // rather than click: a click whose press and release land on different elements is
      // dispatched to their common ancestor rather than to the release target, so relying
      // on click would close the dialog for a drag that starts or ends on the backdrop but
      // not both — e.g. drag-selecting this guide's prose and releasing past the panel edge.
      onMouseUp={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) onClose();
      }}
    >
      <div
        className="modal tutorial"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        data-testid="tutorial-dialog"
      >
        <h2 id="tutorial-title">Using the app</h2>

        <div className="tutorial-body">
          <section>
            <h3>1. Set your display name</h3>
            <p>
              The first time you open the app you'll be asked for a display name. It's stored
              locally and attached to everything you annotate — there are no accounts or sign-in.
              You can change it any time from <strong>Change name</strong> in the header.
            </p>
          </section>

          <section>
            <h3>2. Open an audio file</h3>
            <p>
              Click <strong>Open audio…</strong> in the header and pick a local file. The waveform
              renders in the stage below; nothing leaves your browser.
            </p>
            <img src={emptyState} alt="Empty state, before any audio is loaded" />
            <img src={waveformLoaded} alt="Waveform rendered after opening an audio file" />
          </section>

          <section>
            <h3>3. Add a point annotation</h3>
            <p>
              Play or scrub to the moment you want to mark, then click <strong>+ Point</strong> in
              the transport bar (or press <kbd>P</kbd>). Type a note and click <strong>Save</strong>
              .
            </p>
            <img src={newPointDialog} alt="Filling in a note for a new point annotation" />
            <img
              src={pointAnnotation}
              alt="Point annotation shown on the waveform and in the side panel"
            />
          </section>

          <section>
            <h3>4. Add a region annotation</h3>
            <p>
              Drag across a span of the waveform to select it, or click <strong>+ Region</strong>{' '}
              (or press <kbd>R</kbd>) to start a 5-second region at the playhead (shorter if started
              within 5 seconds of the end of the file), then add a note the same way. You can also
              click directly on a region drawn on the waveform to select it.
            </p>
            <img
              src={createRegion}
              alt="Dragging to create a region annotation, then saving its note"
            />
            <p>
              The waveform also supports a scroll wheel to zoom in/out, a double-click to reset the
              zoom to fit the whole clip, and dragging with both mouse buttons held to pan.
            </p>
            <p>
              Press <strong>►</strong> on any annotation in the side panel to play it back — regions
              play from their start and stop automatically at their end; points move the playhead to
              that moment. Clicking elsewhere on the row just selects/highlights it.
            </p>
          </section>

          <section>
            <h3>5. Reply to an annotation</h3>
            <p>
              Every annotation has its own threaded discussion. Type in the <strong>Reply…</strong>{' '}
              box under any annotation and click <strong>Reply</strong> to add to the thread;
              replies are attributed to your display name.
            </p>
            <img src={replyThread} alt="A reply added under a point annotation" />
          </section>

          <section>
            <h3>6. Share your work</h3>
            <p>
              Use <strong>Export bundle</strong> to download a <code>.aaz</code> file — a zip
              containing the audio and all annotations/replies. Send it however you like — email,
              Slack, a shared drive. The recipient opens the app and clicks{' '}
              <strong>Import bundle…</strong> to load it.
            </p>
            <img src={headerControls} alt="Export and import controls in the header" />
            <p>
              Re-importing a bundle that traces back to the same original audio{' '}
              <strong>merges</strong> annotations and replies by ID instead of duplicating them, so
              a back-and-forth of edits between collaborators never loses data.
            </p>
          </section>

          <section>
            <h3>Keyboard shortcuts</h3>
            <table className="tutorial-shortcuts">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <kbd>Space</kbd>
                  </td>
                  <td>Play / pause</td>
                </tr>
                <tr>
                  <td>
                    <kbd>P</kbd>
                  </td>
                  <td>Start a new point annotation at the playhead</td>
                </tr>
                <tr>
                  <td>
                    <kbd>R</kbd>
                  </td>
                  <td>Start a new 5-second region annotation at the playhead</td>
                </tr>
              </tbody>
            </table>
            <p>
              Shortcuts are inert until an audio file is loaded, and are ignored while you're typing
              in a text field or reading this guide.
            </p>
          </section>
        </div>

        <div className="modal-actions">
          <button type="button" className="primary" autoFocus onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
