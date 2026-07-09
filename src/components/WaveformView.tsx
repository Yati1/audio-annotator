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
  onReady(durationSec: number): void;
  onTime(sec: number): void;
  onPlayState(playing: boolean): void;
  onPendingRegion(region: PendingRegion): void;
  onSelectAnnotation(id: string): void;
}

const REGION_COLOR = 'rgba(79, 140, 255, 0.25)';

/**
 * wavesurfer.js host. Renders the waveform and existing annotations (regions + point
 * markers), supports drag-to-create regions, and exposes imperative playback controls.
 */
export const WaveformView = forwardRef<WaveformHandle, WaveformViewProps>(
  function WaveformView(props, ref): ReactNode {
    const containerRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WaveSurfer | null>(null);
    const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
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
        setLoading(false);
        cbRef.current.onReady(ws.getDuration());
      });
      ws.on('timeupdate', (t) => cbRef.current.onTime(t));
      ws.on('play', () => cbRef.current.onPlayState(true));
      ws.on('pause', () => cbRef.current.onPlayState(false));

      regions.enableDragSelection({ color: REGION_COLOR });
      regions.on('region-created', (region) => {
        // User-drawn regions have no id yet; existing ones are prefixed below.
        if (region.id.startsWith('anno-')) return;
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

      return () => {
        ws.destroy();
        wsRef.current = null;
        regionsRef.current = null;
      };
      // Re-create only when the audio source changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.url]);

    // Render existing annotations as regions/markers whenever they change.
    useEffect(() => {
      const regions = regionsRef.current;
      if (!regions || loading) return;
      regions.getRegions().forEach((r) => {
        if (r.id.startsWith('anno-')) r.remove();
      });
      for (const a of props.annotations) {
        if (a.deleted) continue;
        const isSelected = a.id === props.selectedId;
        regions.addRegion({
          id: `anno-${a.id}`,
          start: a.startSec,
          end: a.kind === 'region' ? (a.endSec ?? a.startSec) : a.startSec,
          color: a.kind === 'region' ? REGION_COLOR : undefined,
          content: a.kind === 'point' ? '●' : undefined,
          drag: false,
          resize: false,
        });
        void isSelected;
      }
    }, [props.annotations, props.selectedId, loading]);

    return (
      <div className="waveform">
        {loading && <div className="waveform-loading">Rendering waveform…</div>}
        <div ref={containerRef} className="waveform-canvas" />
      </div>
    );
  },
);
