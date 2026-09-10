import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Client-side UI state. Server data lives in TanStack Query; this store holds
 * only what the user has chosen — filters, layer toggles, panel layout.
 */

export type RangePreset = '15m' | '1h' | '6h' | '24h';

export const RANGE_MINUTES: Record<RangePreset, number> = {
  '15m': 15,
  '1h': 60,
  '6h': 360,
  '24h': 1440,
};

export const RANGE_LABEL: Record<RangePreset, string> = {
  '15m': 'Last 15 min',
  '1h': 'Last hour',
  '6h': 'Last 6 hours',
  '24h': 'Last 24 hours',
};

/** Role gates the destructive and PII-revealing actions. */
export type OperatorRole = 'viewer' | 'operator' | 'investigator' | 'administrator';

export const ROLE_LABEL: Record<OperatorRole, string> = {
  viewer: 'Viewer',
  operator: 'Control-room operator',
  investigator: 'Investigator',
  administrator: 'Administrator',
};

/** Capability matrix. Kept explicit so the UI never guesses at permissions. */
const CAPABILITIES = {
  viewer: new Set(['view']),
  operator: new Set(['view', 'acknowledge_alerts']),
  investigator: new Set(['view', 'acknowledge_alerts', 'resolve_alerts', 'manage_watchlist', 'export']),
  administrator: new Set([
    'view',
    'acknowledge_alerts',
    'resolve_alerts',
    'manage_watchlist',
    'export',
    'manage_cameras',
    'manage_users',
  ]),
} satisfies Record<OperatorRole, Set<string>>;

export type Capability =
  | 'view'
  | 'acknowledge_alerts'
  | 'resolve_alerts'
  | 'manage_watchlist'
  | 'export'
  | 'manage_cameras'
  | 'manage_users';

export interface MapLayers {
  cameras: boolean;
  heatmap: boolean;
  congestion: boolean;
  zones: boolean;
  labels: boolean;
}

interface AppState {
  range: RangePreset;
  setRange: (range: RangePreset) => void;

  /** Pauses the live feed so an operator can read a row without it scrolling away. */
  livePaused: boolean;
  setLivePaused: (paused: boolean) => void;
  toggleLivePaused: () => void;

  /** Suppresses toast pop-ups without stopping the stream. */
  muteAlertToasts: boolean;
  setMuteAlertToasts: (muted: boolean) => void;

  selectedCameraId: string | null;
  setSelectedCameraId: (id: string | null) => void;

  zoneFilter: string[];
  setZoneFilter: (zoneIds: string[]) => void;

  mapLayers: MapLayers;
  toggleMapLayer: (layer: keyof MapLayers) => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  role: OperatorRole;
  setRole: (role: OperatorRole) => void;

  /** Recently inspected plates, so investigators can jump back. */
  recentPlates: string[];
  pushRecentPlate: (plate: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      range: '24h',
      setRange: (range) => set({ range }),

      livePaused: false,
      setLivePaused: (livePaused) => set({ livePaused }),
      toggleLivePaused: () => set((state) => ({ livePaused: !state.livePaused })),

      muteAlertToasts: true,
      setMuteAlertToasts: (muteAlertToasts) => set({ muteAlertToasts }),

      selectedCameraId: null,
      setSelectedCameraId: (selectedCameraId) => set({ selectedCameraId }),

      zoneFilter: [],
      setZoneFilter: (zoneFilter) => set({ zoneFilter }),

      mapLayers: { cameras: true, heatmap: true, congestion: false, zones: false, labels: false },
      toggleMapLayer: (layer) =>
        set((state) => ({ mapLayers: { ...state.mapLayers, [layer]: !state.mapLayers[layer] } })),

      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      commandPaletteOpen: false,
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),

      role: 'investigator',
      setRole: (role) => set({ role }),

      recentPlates: [],
      pushRecentPlate: (plate) =>
        set((state) => ({
          recentPlates: [plate, ...state.recentPlates.filter((p) => p !== plate)].slice(0, 8),
        })),
    }),
    {
      name: 'netra-ui',
      // Transient UI state must not survive a reload.
      partialize: (state) => ({
        range: state.range,
        mapLayers: state.mapLayers,
        sidebarCollapsed: state.sidebarCollapsed,
        role: state.role,
        recentPlates: state.recentPlates,
        muteAlertToasts: state.muteAlertToasts,
      }),
    },
  ),
);

/** Permission check used to gate buttons rather than hide whole screens. */
export function useCan(capability: Capability): boolean {
  const role = useAppStore((state) => state.role);
  return CAPABILITIES[role].has(capability);
}

/** Resolves the active preset into an absolute ISO range. */
export function resolveRange(preset: RangePreset): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - RANGE_MINUTES[preset] * 60_000);
  return { from: from.toISOString(), to: to.toISOString() };
}
