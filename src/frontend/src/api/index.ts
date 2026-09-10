import type { ApiClient } from './contract';
import { httpClient } from './http';
import { mockClient } from './mock';

/**
 * Data-source selection.
 *
 * `mock` runs the whole platform in the browser against the simulator.
 * `live` talks to the real backend over REST + WebSocket.
 */
export const DATA_MODE: 'mock' | 'live' =
  import.meta.env.VITE_DATA_MODE === 'live' ? 'live' : 'mock';

export const api: ApiClient = DATA_MODE === 'live' ? httpClient : mockClient;

export type { ApiClient };

/** Query keys, centralised so invalidation cannot drift from fetching. */
export const queryKeys = {
  kpis: ['kpis'] as const,
  cameras: ['cameras'] as const,
  camera: (id: string) => ['camera', id] as const,
  zones: ['zones'] as const,
  recentDetections: (limit: number) => ['detections', 'recent', limit] as const,
  cameraDetections: (id: string, limit: number) => ['detections', 'camera', id, limit] as const,
  detectionSearch: (key: string) => ['detections', 'search', key] as const,
  vehicle: (plate: string) => ['vehicle', plate] as const,
  plateSuggest: (q: string) => ['plates', 'suggest', q] as const,
  trajectory: (plate: string, from?: string, to?: string) =>
    ['trajectory', plate, from ?? '', to ?? ''] as const,
  watchlist: ['watchlist'] as const,
  alerts: (key: string) => ['alerts', key] as const,
  heatPoints: ['analytics', 'heatmap'] as const,
  featuredPlates: ['plates', 'featured'] as const,
};
