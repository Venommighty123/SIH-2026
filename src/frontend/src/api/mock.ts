import { buildTrajectory } from '@/lib/trajectory';
import { plateSimilarity, wildcardToRegex } from '@/lib/fuzzy';
import { buildKpis } from '@/mock/derive';
import {
  generateDataset,
  synthesizeLiveDetection,
  watchlistAlertFor,
  type Dataset,
} from '@/mock/generate';
import { createRng } from '@/mock/rng';
import { normalisePlate } from '@/mock/vehicles';
import type {
  Alert,
  AlertStatus,
  LiveEvent,
  PlateCandidate,
  WatchlistEntry,
} from '@/types';
import type { ApiClient } from './contract';

/**
 * In-browser implementation of the platform API.
 *
 * Simplified: no analytics endpoints. Detection data contains only
 * plate, cameraId, and timestamp.
 */

const LATENCY = { min: 90, max: 260 };

let cache: { dataset: Dataset } | null = null;

function store() {
  if (!cache) {
    const dataset = generateDataset();
    cache = { dataset };
  }
  return cache;
}

const liveRng = createRng(0x5eed1e);

function delay<T>(value: T): Promise<T> {
  const ms = LATENCY.min + Math.random() * (LATENCY.max - LATENCY.min);
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function inRange(timestamp: string, from?: string, to?: string): boolean {
  if (from && timestamp < from) return false;
  if (to && timestamp > to) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Live simulation
// ---------------------------------------------------------------------------

const subscribers = new Set<(event: LiveEvent) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function emit(event: LiveEvent) {
  for (const handler of subscribers) handler(event);
}

function startSimulation() {
  if (timer) return;

  timer = setInterval(() => {
    const { dataset } = store();
    const now = new Date();

    const burst = liveRng.int(1, 3);

    for (let i = 0; i < burst; i++) {
      const detection = synthesizeLiveDetection(dataset, liveRng, now);

      dataset.detections.push(detection);
      dataset.detectionsById.set(detection.id, detection);
      const byPlate = dataset.detectionsByPlate.get(detection.plate);
      if (byPlate) byPlate.push(detection);
      else dataset.detectionsByPlate.set(detection.plate, [detection]);
      dataset.detectionsByCamera.get(detection.cameraId)?.push(detection);

      emit({ kind: 'detection', payload: detection });

      const entry = dataset.watchlist.find((w) => w.active && w.plate === detection.plate);
      if (entry) {
        const camera = dataset.network.camerasById.get(detection.cameraId)!;
        const alert = watchlistAlertFor(detection, entry, camera);
        dataset.alerts.unshift(alert);
        entry.hitCount += 1;
        emit({ kind: 'alert', payload: alert });
      }
    }

    // Occasional camera state flap
    if (liveRng.bool(0.015)) {
      const camera = liveRng.pick(dataset.network.cameras);
      const next = camera.status === 'online' ? 'degraded' : 'online';
      camera.status = next;
      camera.lastHeartbeat = now.toISOString();
      emit({ kind: 'camera_status', payload: { cameraId: camera.id, status: next, at: now.toISOString() } });
    }
  }, 1100);
}

function stopSimulationIfIdle() {
  if (subscribers.size === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export const mockClient: ApiClient = {
  async getKpis() {
    const { dataset } = store();
    return delay(buildKpis(dataset));
  },

  async getCameras() {
    return delay([...store().dataset.cameras]);
  },

  async getCamera(id) {
    return delay(store().dataset.network.camerasById.get(id) ?? null);
  },

  async getZones() {
    return delay(store().dataset.network.zones);
  },

  async searchDetections(query) {
    const { dataset } = store();
    const plateQuery = query.plate ? normalisePlate(query.plate) : undefined;
    const wildcard = plateQuery ? wildcardToRegex(plateQuery) : null;

    const cameraFilter = query.cameraIds?.length ? new Set(query.cameraIds) : null;
    const zoneFilter = query.zoneIds?.length ? new Set(query.zoneIds) : null;

    const matched = dataset.detections.filter((detection) => {
      if (!inRange(detection.timestamp, query.range?.from, query.range?.to)) return false;
      if (cameraFilter && !cameraFilter.has(detection.cameraId)) return false;
      if (zoneFilter) {
        const camera = dataset.network.camerasById.get(detection.cameraId);
        if (!camera || !zoneFilter.has(camera.zoneId)) return false;
      }

      if (plateQuery) {
        if (wildcard) return wildcard.test(detection.plate);
        if (query.fuzzy) return plateSimilarity(plateQuery, detection.plate).score >= 0.8;
        return detection.plate.includes(plateQuery);
      }
      return true;
    });

    matched.reverse();

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    return delay({ rows: matched.slice(offset, offset + limit), total: matched.length });
  },

  async getDetection(id) {
    return delay(store().dataset.detectionsById.get(id) ?? null);
  },

  async getRecentDetections(limit) {
    const { dataset } = store();
    return delay(dataset.detections.slice(-limit).reverse());
  },

  async getCameraDetections(cameraId, limit) {
    const { dataset } = store();
    const reads = dataset.detectionsByCamera.get(cameraId) ?? [];
    return delay(reads.slice(-limit).reverse());
  },

  async getVehicle(plate) {
    const { dataset } = store();
    return delay(dataset.vehicles.get(normalisePlate(plate)) ?? null);
  },

  async suggestPlates(query, limit = 12) {
    const { dataset } = store();
    const normalised = normalisePlate(query);
    if (normalised.length < 2) return delay<PlateCandidate[]>([]);

    const wildcard = wildcardToRegex(normalised);
    const candidates: PlateCandidate[] = [];
    const watchlistPlates = new Set(dataset.watchlist.filter((w) => w.active).map((w) => w.plate));

    for (const [plate, reads] of dataset.detectionsByPlate) {
      let score: number;
      let explanation: string[] = [];

      if (wildcard) {
        if (!wildcard.test(plate)) continue;
        score = 0.95;
      } else if (plate.startsWith(normalised)) {
        score = 0.99 - (plate.length - normalised.length) * 0.001;
      } else if (plate.includes(normalised)) {
        score = 0.9;
      } else {
        const match = plateSimilarity(normalised, plate);
        if (match.score < 0.72) continue;
        score = match.score;
        explanation = match.explanation;
      }

      candidates.push({
        plate,
        sightings: reads.length,
        lastSeen: reads[reads.length - 1].timestamp,
        score: Number(score.toFixed(4)),
        explanation,
        isBlacklisted: watchlistPlates.has(plate),
      });
    }

    candidates.sort(
      (a, b) => b.score - a.score || b.sightings - a.sightings || a.plate.localeCompare(b.plate),
    );

    return delay(candidates.slice(0, limit));
  },

  async getTrajectory(plate, range) {
    const { dataset } = store();
    const normalised = normalisePlate(plate);
    const all = dataset.detectionsByPlate.get(normalised);
    if (!all || all.length === 0) return delay(null);

    const reads = range
      ? all.filter((d) => inRange(d.timestamp, range.from, range.to))
      : all;
    if (reads.length === 0) return delay(null);

    return delay(
      buildTrajectory(normalised, reads, dataset.network, dataset.vehicles.get(normalised) ?? null),
    );
  },

  async getWatchlist() {
    return delay([...store().dataset.watchlist].sort((a, b) => b.addedAt.localeCompare(a.addedAt)));
  },

  async addWatchlistEntry(entry) {
    const { dataset } = store();
    const plate = normalisePlate(entry.plate);
    const created: WatchlistEntry = {
      ...entry,
      plate,
      id: `w-${Date.now().toString(36)}`,
      addedAt: new Date().toISOString(),
      hitCount: dataset.detectionsByPlate.get(plate)?.length ?? 0,
    };
    dataset.watchlist.unshift(created);
    const vehicle = dataset.vehicles.get(plate);
    if (vehicle) vehicle.isBlacklisted = true;
    return delay(created);
  },

  async updateWatchlistEntry(id, patch) {
    const { dataset } = store();
    const entry = dataset.watchlist.find((w) => w.id === id);
    if (!entry) throw new Error(`Watchlist entry ${id} not found`);
    Object.assign(entry, patch);
    return delay(entry);
  },

  async removeWatchlistEntry(id) {
    const { dataset } = store();
    const index = dataset.watchlist.findIndex((w) => w.id === id);
    if (index >= 0) {
      const [removed] = dataset.watchlist.splice(index, 1);
      const stillListed = dataset.watchlist.some((w) => w.plate === removed.plate && w.active);
      const vehicle = dataset.vehicles.get(removed.plate);
      if (vehicle && !stillListed) vehicle.isBlacklisted = false;
    }
    return delay(undefined);
  },

  async getAlerts(filter) {
    const { dataset } = store();
    const statuses = filter?.status?.length ? new Set(filter.status) : null;
    const types = filter?.type?.length ? new Set(filter.type) : null;
    const severities = filter?.severity?.length ? new Set(filter.severity) : null;

    const rows = dataset.alerts.filter((alert) => {
      if (statuses && !statuses.has(alert.status)) return false;
      if (types && !types.has(alert.type)) return false;
      if (severities && !severities.has(alert.severity)) return false;
      return true;
    });

    return delay(rows.slice(0, filter?.limit ?? 200));
  },

  async updateAlertStatus(id, status, note) {
    const { dataset } = store();
    const alert = dataset.alerts.find((a) => a.id === id);
    if (!alert) throw new Error(`Alert ${id} not found`);

    const labels: Record<AlertStatus, string> = {
      new: 'Reopened',
      acknowledged: 'Acknowledged',
      investigating: 'Marked under investigation',
      resolved: 'Resolved',
      false_positive: 'Marked false positive',
    };

    alert.status = status;
    alert.activity = [
      ...alert.activity,
      { at: new Date().toISOString(), by: 'You (Control Room)', action: labels[status], note },
    ];
    return delay(alert);
  },

  async assignAlert(id, assignee) {
    const { dataset } = store();
    const alert = dataset.alerts.find((a) => a.id === id);
    if (!alert) throw new Error(`Alert ${id} not found`);
    alert.assignedTo = assignee;
    alert.activity = [
      ...alert.activity,
      { at: new Date().toISOString(), by: 'You (Control Room)', action: `Assigned to ${assignee}` },
    ];
    return delay(alert);
  },

  async getHeatPoints() {
    const { dataset } = store();
    return delay(
      dataset.cameras.map((camera) => ({
        position: camera.position,
        weight: dataset.detectionsByCamera.get(camera.id)?.length ?? 0,
        cameraId: camera.id,
      })),
    );
  },

  subscribe(handler) {
    store();
    subscribers.add(handler);
    startSimulation();
    return () => {
      subscribers.delete(handler);
      stopSimulationIfIdle();
    };
  },

  async getFeaturedPlates() {
    return delay([...store().dataset.featuredPlates]);
  },
};

/** Exposed for the alert triage screen, which needs the raw list synchronously. */
export function peekAlerts(): Alert[] {
  return store().dataset.alerts;
}
