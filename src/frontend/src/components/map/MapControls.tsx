import type { ReactNode } from 'react';
import { Cctv, Flame, Layers, Map as MapIcon, Waypoints } from 'lucide-react';
import { CAMERA_STATUS_COLOR } from '@/lib/format';
import { cn } from '@/components/ui/primitives';
import type { MapLayerVisibility } from './CityMap';

/** Floating overlay container, positioned inside the map canvas. */
export function MapOverlay({
  children,
  position = 'top-left',
  className,
}: {
  children: ReactNode;
  position?: 'top-left' | 'bottom-right' | 'bottom-left' | 'top-right' | 'bottom-center';
  className?: string;
}) {
  const anchor = {
    'top-left': 'left-2.5 top-2.5',
    'top-right': 'right-2.5 top-2.5',
    'bottom-left': 'left-2.5 bottom-9',
    'bottom-right': 'right-2.5 bottom-9',
    'bottom-center': 'bottom-9 left-1/2 -translate-x-1/2',
  }[position];

  return (
    <div
      className={cn(
        'absolute z-10 rounded-lg bg-surface-1/92 p-2 shadow-lg ring-1 ring-line backdrop-blur-sm',
        anchor,
        className,
      )}
    >
      {children}
    </div>
  );
}

const LAYER_META: Array<{
  key: keyof MapLayerVisibility;
  label: string;
  icon: typeof Flame;
  hint: string;
}> = [
  { key: 'heatmap', label: 'Density', icon: Flame, hint: 'Read-volume heatmap across all nodes' },
  { key: 'congestion', label: 'Congestion', icon: Waypoints, hint: 'Corridor speed against free flow' },
  { key: 'cameras', label: 'Cameras', icon: Cctv, hint: 'ANPR camera nodes' },
  { key: 'zones', label: 'Zones', icon: MapIcon, hint: 'Enforcement zone coverage' },
];

/** Layer switcher rendered over the map. */
export function LayerToggles({
  layers,
  onToggle,
  exclude = [],
}: {
  layers: MapLayerVisibility;
  onToggle: (layer: keyof MapLayerVisibility) => void;
  exclude?: Array<keyof MapLayerVisibility>;
}) {
  const visible = LAYER_META.filter((meta) => !exclude.includes(meta.key));

  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 px-0.5 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-dim">
        <Layers className="size-3" />
        Layers
      </span>
      {visible.map((meta) => {
        const Icon = meta.icon;
        const active = layers[meta.key];
        return (
          <button
            key={meta.key}
            type="button"
            onClick={() => onToggle(meta.key)}
            aria-pressed={active}
            title={meta.hint}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
              active ? 'bg-brand/15 text-brand' : 'text-ink-dim hover:bg-surface-2 hover:text-ink-muted',
            )}
          >
            <Icon className="size-3.5" />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}



export function DensityLegend() {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-dim">
        Read density
      </span>
      <span
        className="h-2 w-40 rounded-full"
        style={{
          background:
            'linear-gradient(to right, rgba(56,132,255,.6), rgba(61,220,151,.75), rgba(247,201,72,.85), rgba(249,126,63,.9), rgba(229,72,77,.95))',
        }}
      />
      <div className="flex justify-between text-[9px] text-ink-dim">
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  );
}

export function CameraStatusLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {(['online', 'degraded', 'offline', 'maintenance'] as const).map((status) => (
        <span key={status} className="flex items-center gap-1.5 text-[10px] text-ink-dim">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: CAMERA_STATUS_COLOR[status] }}
          />
          {status}
        </span>
      ))}
    </div>
  );
}

/** Legend explaining observed vs. reconstructed route segments. */
export function RouteLegend() {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-dim">
        Route
      </span>
      <span className="flex items-center gap-2 text-[10px] text-ink-muted">
        <span className="h-0.5 w-7 rounded-full bg-brand" />
        Observed hop between adjacent nodes
      </span>
      <span className="flex items-center gap-2 text-[10px] text-ink-muted">
        <span
          className="h-0.5 w-7 rounded-full"
          style={{
            backgroundImage: 'repeating-linear-gradient(to right, #8b9bb4 0 4px, transparent 4px 7px)',
          }}
        />
        Inferred through uncovered road
      </span>
    </div>
  );
}
