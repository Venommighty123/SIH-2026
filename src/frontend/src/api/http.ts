import type { LiveEvent } from '@/types';
import type { ApiClient } from './contract';

/**
 * HTTP/WebSocket implementation.
 *
 * This doubles as the specification handed to the backend team: every method
 * below names the exact route, verb and query parameters the UI will call. The
 * response bodies are the types in `src/types`.
 */

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const REALTIME = import.meta.env.VITE_REALTIME_URL ?? '';

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { message?: string; detail?: string };
      detail = body.message ?? body.detail ?? detail;
    } catch {
      // Non-JSON error body; keep the status text.
    }
    throw new ApiError(detail, response.status, url);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Serialises a filter object into a query string, dropping empty values. */
function query(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const serialised = search.toString();
  return serialised ? `?${serialised}` : '';
}

export const httpClient: ApiClient = {
  getKpis: () => request('/analytics/kpis'),
  getCameras: () => request('/cameras'),
  getCamera: (id) => request(`/cameras/${encodeURIComponent(id)}`),
  getZones: () => request('/zones'),

  searchDetections: (q) =>
    request(
      `/detections${query({
        plate: q.plate,
        fuzzy: q.fuzzy,
        camera_ids: q.cameraIds,
        zone_ids: q.zoneIds,
        from: q.range?.from,
        to: q.range?.to,
        limit: q.limit,
        offset: q.offset,
      })}`,
    ),
  getDetection: (id) => request(`/detections/${encodeURIComponent(id)}`),
  getRecentDetections: (limit) => request(`/detections/recent${query({ limit })}`),
  getCameraDetections: (cameraId, limit) =>
    request(`/cameras/${encodeURIComponent(cameraId)}/detections${query({ limit })}`),

  getVehicle: (plate) => request(`/vehicles/${encodeURIComponent(plate)}`),
  suggestPlates: (q, limit) => request(`/plates/suggest${query({ q, limit })}`),
  getTrajectory: (plate, range) =>
    request(`/trajectory/${encodeURIComponent(plate)}${query({ from: range?.from, to: range?.to })}`),

  getWatchlist: () => request('/watchlist'),
  addWatchlistEntry: (entry) =>
    request('/watchlist', { method: 'POST', body: JSON.stringify(entry) }),
  updateWatchlistEntry: (id, patch) =>
    request(`/watchlist/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  removeWatchlistEntry: (id) =>
    request(`/watchlist/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getAlerts: (filter) =>
    request(
      `/alerts${query({
        status: filter?.status,
        type: filter?.type,
        severity: filter?.severity,
        limit: filter?.limit,
      })}`,
    ),
  updateAlertStatus: (id, status, note) =>
    request(`/alerts/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, note }),
    }),
  assignAlert: (id, assignee) =>
    request(`/alerts/${encodeURIComponent(id)}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assignee }),
    }),

  getHeatPoints: () => request('/analytics/heatmap'),

  subscribe(handler) {
    if (!REALTIME) {
      console.warn('[netra] VITE_REALTIME_URL is not set; live updates are disabled.');
      return () => {};
    }

    let socket: WebSocket | null = null;
    let retryDelay = 1000;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      socket = new WebSocket(REALTIME);

      socket.onopen = () => {
        retryDelay = 1000;
      };

      socket.onmessage = (message) => {
        try {
          handler(JSON.parse(message.data as string) as LiveEvent);
        } catch (error) {
          console.warn('[netra] discarded malformed realtime frame', error);
        }
      };

      socket.onclose = () => {
        if (closed) return;
        reconnectTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      };

      socket.onerror = () => socket?.close();
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  },

  getFeaturedPlates: () => request('/plates/featured'),
};
