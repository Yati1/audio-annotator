import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import type { Annotation } from '../features/types';
import { isAuthorColor, pointMarkerContent, safeAuthorColor, withAlpha } from '../lib/color';

export interface PendingRegion {
  startSec: number;
  endSec: number | null;
}

export interface WaveformHandle {
  playPause(): void;
  stop(): void;
  getCurrentTime(): number;
  seekTo(sec: number): void;
  playRegion(startSec: number, endSec: number): void;
}

interface WaveformViewProps {
  url: string;
  annotations: Annotation[];
  selectedId: string | null;
  /** This device's own author color, used to preview a not-yet-saved drag selection. */
  authorColor: string;
  /** The region-kind draft currently being composed, if any — kept visible on the
   *  waveform for the whole time its comment is being typed. */
  draftRegion: { startSec: number; endSec: number } | null;
  onReady(durationSec: number): void;
  onTime(sec: number): void;
  onPlayState(playing: boolean): void;
  onPendingRegion(region: PendingRegion): void;
  onSelectAnnotation(id: string): void;
}

/** Used only if a drag-selection happens before this device's color has resolved. */
const FALLBACK_DRAG_COLOR = 'rgba(79, 140, 255, 0.25)';
/** Reserved id for the persistent region that visualizes `draftRegion` while its
 *  comment is being composed — excluded from region-created handling below since
 *  `regions.addRegion` re-emits that event for programmatically-added regions too. */
const DRAFT_REGION_ID = 'draft-region';

/** Finest zoom level under normal conditions. For very short clips whose fit-to-width
 *  level already exceeds this, fit-to-width wins — you must always be able to see the
 *  whole clip, so the effective cap can exceed this constant in that case. */
const MAX_PX_PER_SEC = 1000;
/** Controls how much one wheel "notch" changes the zoom level. */
const ZOOM_WHEEL_SENSITIVITY = 0.0025;

const preventDefault = (e: Event) => e.preventDefault();

/**
 * wavesurfer.js host. Renders the waveform and existing annotations (regions + point
 * markers), supports drag-to-create regions, and exposes imperative playback controls.
 */
export const WaveformView = forwardRef<WaveformHandle, WaveformViewProps>(
  function WaveformView(props, ref): ReactNode {
    const containerRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WaveSurfer | null>(null);
    const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
    const disableDragSelectionRef = useRef<(() => void) | null>(null);
    // Set when drag-selection is first enabled with the fallback color (this device's
    // authorColor hadn't resolved yet); tells the color-sync effect below there's
    // something to fix once it does.
    const needsDragColorSyncRef = useRef(false);
    // Current zoom level (pixels per second). 0 means "not zoomed yet" / fit-to-width.
    const pxPerSecRef = useRef(0);
    // Tracks an in-progress two-button pan gesture; null when not panning.
    const panRef = useRef<{ lastX: number } | null>(null);
    // True from the moment a pan starts until the trailing click it produces has been
    // consumed (see the `click` listener below) — used to discard side effects a pan
    // gesture can incidentally trigger (a seek-to-click, a phantom drag-selected region).
    const panHappenedRef = useRef(false);
    // True once wavesurfer has decoded audio and `zoom()` is safe to call.
    const readyRef = useRef(false);
    const [loading, setLoading] = useState(true);

    // Keep latest callbacks without re-initializing wavesurfer.
    const cbRef = useRef(props);
    cbRef.current = props;

    useImperativeHandle(ref, () => ({
      playPause() {
        void wsRef.current?.playPause();
      },
      stop() {
        wsRef.current?.stop();
      },
      getCurrentTime() {
        return wsRef.current?.getCurrentTime() ?? 0;
      },
      seekTo(sec) {
        wsRef.current?.setTime(sec);
      },
      playRegion(startSec, endSec) {
        const ws = wsRef.current;
        if (!ws) return;
        ws.setTime(startSec);
        void ws.play();
        const stopAt = () => {
          if (ws.getCurrentTime() >= endSec) {
            ws.pause();
            ws.un('timeupdate', stopAt);
          }
        };
        ws.on('timeupdate', stopAt);
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;
      const regions = RegionsPlugin.create();
      const ws = WaveSurfer.create({
        container: containerRef.current,
        url: props.url,
        waveColor: '#5a6b8c',
        progressColor: '#4f8cff',
        cursorColor: '#eef2f8',
        height: 96,
        plugins: [regions],
      });
      wsRef.current = ws;
      regionsRef.current = regions;

      ws.on('ready', () => {
        readyRef.current = true;
        setLoading(false);
        cbRef.current.onReady(ws.getDuration());
      });
      ws.on('timeupdate', (t) => cbRef.current.onTime(t));
      ws.on('play', () => cbRef.current.onPlayState(true));
      ws.on('pause', () => cbRef.current.onPlayState(false));

      const authorColorResolved = isAuthorColor(cbRef.current.authorColor);
      const dragColor = authorColorResolved
        ? withAlpha(cbRef.current.authorColor, 0.25)
        : FALLBACK_DRAG_COLOR;
      needsDragColorSyncRef.current = !authorColorResolved;
      disableDragSelectionRef.current = regions.enableDragSelection({ color: dragColor });
      regions.on('region-created', (region) => {
        // Programmatically-added regions (existing annotations, the draft preview)
        // re-emit this same event via `regions.addRegion` — they're never phantom
        // pan artifacts, so check for them first regardless of `panHappenedRef`.
        if (region.id.startsWith('anno-') || region.id === DRAFT_REGION_ID) return;
        // A two-button pan can incidentally arm/advance the regions plugin's own
        // drag-selection (it isn't aware of the second button); discard the result.
        if (panHappenedRef.current) {
          region.remove();
          return;
        }
        cbRef.current.onPendingRegion({
          startSec: region.start,
          endSec: region.end > region.start ? region.end : null,
        });
        region.remove();
      });
      regions.on('region-clicked', (region, e) => {
        e.stopPropagation();
        if (region.id.startsWith('anno-')) {
          cbRef.current.onSelectAnnotation(region.id.slice('anno-'.length));
        }
      });

      // Zoom/pan: reset on every new file so a previous file's zoom doesn't carry over.
      pxPerSecRef.current = 0;
      panRef.current = null;
      panHappenedRef.current = false;
      readyRef.current = false;
      const container = containerRef.current;

      /** The zoom level (px/sec) at which the whole track exactly fills the container. */
      const getFitPxPerSec = () => {
        const duration = ws.getDuration();
        return duration ? ws.getWidth() / duration : 0;
      };

      const handleWheel = (e: WheelEvent) => {
        if (!readyRef.current) return;
        e.preventDefault();
        const fit = getFitPxPerSec();
        if (!fit) return;
        const current = pxPerSecRef.current || fit;
        const offsetX = e.clientX - container.getBoundingClientRect().left;
        const timeAtCursor = (ws.getScroll() + offsetX) / current;
        const factor = Math.exp(-e.deltaY * ZOOM_WHEEL_SENSITIVITY);
        const next = Math.min(Math.max(MAX_PX_PER_SEC, fit), Math.max(fit, current * factor));
        if (next === current) return;
        ws.zoom(next);
        pxPerSecRef.current = next;
        ws.setScroll(Math.max(0, timeAtCursor * next - offsetX));
      };

      const resetZoom = () => {
        if (!readyRef.current) return;
        const fit = getFitPxPerSec();
        if (!fit) return;
        ws.zoom(fit);
        // Store 0, not `fit` itself: a later container resize (e.g. the window growing)
        // changes what "fit" means, and the next handleWheel call must recompute it fresh
        // rather than resume from this now-stale value.
        pxPerSecRef.current = 0;
        ws.setScroll(0);
      };

      // Panning uses plain mouse events rather than pointer events: `pointerdown`/`pointerup`
      // only fire when the pointer goes from no buttons to one (or back to none), not for a
      // second button added while the first is still held — exactly the gesture we need to
      // detect here. `mousedown`/`mouseup` fire per-button, so those are used instead.
      const handleMouseMove = (e: MouseEvent) => {
        if (!panRef.current) return;
        if ((e.buttons & 3) !== 3) {
          endPan();
          return;
        }
        const dx = e.clientX - panRef.current.lastX;
        ws.setScroll(ws.getScroll() - dx);
        panRef.current.lastX = e.clientX;
      };

      function endPan() {
        if (!panRef.current) return;
        panRef.current = null;
        container.classList.remove('panning');
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', endPan);
        // The trailing click this gesture may produce (see `handleClick` below) is
        // dispatched synchronously by the browser before any timer callback runs, so
        // by the time this fires it's already been consumed — this is just a fallback
        // for the (normal) case where no such click ever arrives, so the flag can't
        // get stuck and silently swallow an unrelated later drag-selection.
        setTimeout(() => {
          panHappenedRef.current = false;
        }, 0);
      }

      // Both mouse buttons held (bitmask 1 | 2) = pan.
      const handleMouseDown = (e: MouseEvent) => {
        if (e.buttons !== 3) return;
        e.preventDefault();
        e.stopPropagation();
        panRef.current = { lastX: e.clientX };
        panHappenedRef.current = true;
        container.classList.add('panning');
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', endPan);
      };

      // A pan's left-button press/release still produces a native `click` on release
      // (browsers don't suppress it just because the pointer moved), which wavesurfer
      // would otherwise treat as a seek. Swallow exactly that one trailing click, then
      // clear the flag — by the time `click` fires (after `pointerup`/`mouseup`), any
      // phantom region the gesture produced has already been discarded above.
      const handleClick = (e: MouseEvent) => {
        if (!panHappenedRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        panHappenedRef.current = false;
      };

      container.addEventListener('wheel', handleWheel, { passive: false });
      container.addEventListener('dblclick', resetZoom);
      container.addEventListener('mousedown', handleMouseDown, { capture: true });
      container.addEventListener('click', handleClick, { capture: true });
      container.addEventListener('contextmenu', preventDefault);

      return () => {
        container.removeEventListener('wheel', handleWheel);
        container.removeEventListener('dblclick', resetZoom);
        container.removeEventListener('mousedown', handleMouseDown, { capture: true });
        container.removeEventListener('click', handleClick, { capture: true });
        container.removeEventListener('contextmenu', preventDefault);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', endPan);
        container.classList.remove('panning');
        ws.destroy();
        wsRef.current = null;
        regionsRef.current = null;
        disableDragSelectionRef.current = null;
      };
      // Re-create only when the audio source changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.url]);

    // If this device's authorColor was still unresolved when drag-selection was first
    // enabled above (e.g. its very first-ever authored write), re-register it with the
    // real color once available — otherwise the live drag preview stays on the generic
    // fallback for the rest of the session even after authorColor is assigned.
    useEffect(() => {
      if (!needsDragColorSyncRef.current || loading) return;
      const regions = regionsRef.current;
      if (!regions || !isAuthorColor(props.authorColor)) return;
      disableDragSelectionRef.current?.();
      disableDragSelectionRef.current = regions.enableDragSelection({
        color: withAlpha(props.authorColor, 0.25),
      });
      needsDragColorSyncRef.current = false;
    }, [props.authorColor, loading]);

    // Render existing annotations as regions/markers whenever they change.
    useEffect(() => {
      const regions = regionsRef.current;
      if (!regions || loading) return;
      regions.getRegions().forEach((r) => {
        if (r.id.startsWith('anno-')) r.remove();
      });
      for (const a of props.annotations) {
        if (a.deleted) continue;
        const color = safeAuthorColor(a.authorColor);
        regions.addRegion({
          id: `anno-${a.id}`,
          start: a.startSec,
          end: a.kind === 'region' ? (a.endSec ?? a.startSec) : a.startSec,
          color: a.kind === 'region' ? withAlpha(color, 0.25) : color,
          content: a.kind === 'point' ? pointMarkerContent(color) : undefined,
          drag: false,
          resize: false,
        });
      }
    }, [props.annotations, loading]);

    // Keep a persistent region showing the in-progress draft's bounds for as long as
    // its comment is being composed — replaces the old behavior of removing the
    // drag-created region the instant the drag ended (see `region-created` above).
    useEffect(() => {
      const regions = regionsRef.current;
      if (!regions || loading) return;
      regions
        .getRegions()
        .find((r) => r.id === DRAFT_REGION_ID)
        ?.remove();
      if (!props.draftRegion) return;
      const color = isAuthorColor(props.authorColor)
        ? withAlpha(props.authorColor, 0.25)
        : FALLBACK_DRAG_COLOR;
      regions.addRegion({
        id: DRAFT_REGION_ID,
        start: props.draftRegion.startSec,
        end: props.draftRegion.endSec,
        color,
        drag: false,
        resize: false,
      });
    }, [props.draftRegion, props.authorColor, loading]);

    return (
      <div className="waveform">
        {loading && <div className="waveform-loading">Rendering waveform…</div>}
        <div ref={containerRef} className="waveform-canvas" data-testid="waveform-canvas" />
      </div>
    );
  },
);
