import type {
  Alert,
  Camera,
  Detection,
  Vehicle,
  WatchlistEntry,
} from '@/types';
import { buildNetwork, type CityNetwork } from './city';
import { createRng, type Rng } from './rng';
import { FEATURED_PLATES } from './vehicles';
import cctvRawData from '../../synthetic_cctv_traffic.json';

/**
 * Dataset built from real CCTV traffic data.
 *
 * Instead of RNG-based simulation, detections are imported directly from
 * synthetic_cctv_traffic.json. Each entry maps to a Detection via:
 *   - node_number → camera ID (c-node-1 / c-node-2 / c-node-3)
 *   - timestamp (HH:MM:SS.mmm) → full ISO timestamp (today's date)
 *   - license_plate → plate
 */

// ---------------------------------------------------------------------------
// Dataset shape
// ---------------------------------------------------------------------------

export interface Dataset {
  network: CityNetwork;
  cameras: Camera[];
  detections: Detection[];
  detectionsById: Map<string, Detection>;
  detectionsByPlate: Map<string, Detection[]>;
  detectionsByCamera: Map<string, Detection[]>;
  vehicles: Map<string, Vehicle>;
  watchlist: WatchlistEntry[];
  alerts: Alert[];
  featuredPlates: string[];
  windowStart: string;
  windowEnd: string;
}

// ---------------------------------------------------------------------------
// JSON → Detection mapping
// ---------------------------------------------------------------------------

interface RawCctvEntry {
  license_plate: string;
  timestamp: string;      // "HH:MM:SS.mmm"
  node_number: number;    // 1, 2, or 3
}

const NODE_TO_CAMERA: Record<number, string> = {
  1: 'c-node-1',
  2: 'c-node-2',
  3: 'c-node-3',
};

/** Convert a time-only string to a full ISO timestamp using today's date. */
function toIsoTimestamp(timeStr: string): string {
  const today = new Date();
  const [hms, ms] = timeStr.split('.');
  const [h, m, s] = hms.split(':').map(Number);
  today.setHours(h, m, s, ms ? Number(ms) : 0);
  return today.toISOString();
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

export function generateDataset(): Dataset {
  const rng = createRng(20260831);
  const network = buildNetwork();

  const now = new Date();
  const windowEnd = now.toISOString();
  // Window covers from earliest detection today to now
  const windowStart = new Date(now.getTime() - 24 * 3600_000).toISOString();

  // Build detections from the JSON data
  const detections: Detection[] = [];
  const detectionsById = new Map<string, Detection>();
  const detectionsByPlate = new Map<string, Detection[]>();
  const detectionsByCamera = new Map<string, Detection[]>();

  for (const camera of network.cameras) {
    detectionsByCamera.set(camera.id, []);
  }

  const rawData = cctvRawData as RawCctvEntry[];

  for (let i = 0; i < rawData.length; i++) {
    const entry = rawData[i];
    const cameraId = NODE_TO_CAMERA[entry.node_number];
    if (!cameraId) continue;

    const id = `d-${String(i + 1).padStart(6, '0')}`;
    const detection: Detection = {
      id,
      plate: entry.license_plate,
      cameraId,
      timestamp: toIsoTimestamp(entry.timestamp),
    };

    detections.push(detection);
    detectionsById.set(id, detection);

    const byPlate = detectionsByPlate.get(entry.license_plate) ?? [];
    byPlate.push(detection);
    detectionsByPlate.set(entry.license_plate, byPlate);

    detectionsByCamera.get(cameraId)?.push(detection);
  }

  // Sort detections by time
  detections.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Build plate pool from unique plates in the data
  const plates = [...detectionsByPlate.keys()];

  // Build minimal vehicle records
  const vehicles = new Map<string, Vehicle>();
  const makeModels = [
    'Maruti Suzuki Swift', 'Hyundai i20', 'Tata Nexon', 'Honda City',
    'Mahindra Thar', 'Toyota Fortuner', 'Kia Seltos', 'MG Hector',
    'Bajaj Pulsar 150', 'TVS Apache RTR', 'Ola S1 Pro', 'Hero Splendor',
    'Tata Ace', 'Ashok Leyland Dost', 'Eicher Pro 2049',
  ];

  for (const plate of plates) {
    const reads = detectionsByPlate.get(plate) ?? [];
    vehicles.set(plate, {
      plate,
      makeModel: rng.pick(makeModels),
      registeredState: plate.slice(0, 2),
      ownerMasked: `${String.fromCharCode(65 + rng.int(0, 25))}**** ${String.fromCharCode(65 + rng.int(0, 25))}*****`,
      isBlacklisted: false,
      firstSeen: reads[0]?.timestamp ?? now.toISOString(),
      lastSeen: reads[reads.length - 1]?.timestamp ?? now.toISOString(),
      totalSightings: reads.length,
    });
  }

  // Watchlist
  const watchlist: WatchlistEntry[] = [];
  const watchlistPlates = FEATURED_PLATES.slice(0, 4);
  const categories: Array<'stolen' | 'wanted_criminal' | 'unpaid_challan' | 'court_order'> = [
    'stolen', 'wanted_criminal', 'unpaid_challan', 'court_order',
  ];
  const severities: Array<'critical' | 'high' | 'medium' | 'low'> = [
    'critical', 'high', 'medium', 'low',
  ];
  const reasons = [
    'Reported stolen — FIR filed at Dwarka PS.',
    'Attachment order — Judicial Magistrate First Class.',
    'Unpaid challan — ₹12,400 outstanding.',
    'Court order — non-bailable warrant.',
  ];

  for (let i = 0; i < watchlistPlates.length; i++) {
    const plate = watchlistPlates[i];
    const v = vehicles.get(plate);
    if (v) v.isBlacklisted = true;

    watchlist.push({
      id: `w-${i + 1}`,
      plate,
      category: categories[i % categories.length],
      severity: severities[i % severities.length],
      reason: reasons[i % reasons.length],
      caseRef: `CR/2026/${String(1000 + i)}`,
      addedBy: 'Control Room',
      addedAt: new Date(now.getTime() - rng.int(1, 30) * 86400_000).toISOString(),
      expiresAt: null,
      active: true,
      notify: ['control_room', 'sms'],
      hitCount: detectionsByPlate.get(plate)?.length ?? 0,
    });
  }

  // Alerts (watchlist hits only)
  const alerts: Alert[] = [];
  const watchlistSet = new Set(watchlistPlates);
  let alertCounter = 0;

  for (const detection of detections) {
    if (!watchlistSet.has(detection.plate)) continue;
    const entry = watchlist.find((w) => w.plate === detection.plate);
    if (!entry) continue;
    const camera = network.camerasById.get(detection.cameraId);
    if (!camera) continue;

    alerts.push({
      id: `a-${(++alertCounter).toString(36)}`,
      type: 'watchlist_hit',
      severity: entry.severity,
      status: 'new',
      title: `Watchlist hit · ${detection.plate}`,
      detail: `${entry.reason} Sighted at ${camera.name} (${camera.code}).`,
      timestamp: detection.timestamp,
      plate: detection.plate,
      cameraId: detection.cameraId,
      detectionId: detection.id,
      watchlistId: entry.id,
      activity: [
        { at: detection.timestamp, by: 'System', action: 'Alert generated' },
      ],
    });
  }

  alerts.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return {
    network,
    cameras: network.cameras,
    detections,
    detectionsById,
    detectionsByPlate,
    detectionsByCamera,
    vehicles,
    watchlist,
    alerts,
    featuredPlates: FEATURED_PLATES,
    windowStart,
    windowEnd,
  };
}

// ---------------------------------------------------------------------------
// Live simulation helpers
// ---------------------------------------------------------------------------

export function synthesizeLiveDetection(
  dataset: Dataset,
  rng: Rng,
  now: Date,
): Detection {
  const plate = rng.pick([...dataset.detectionsByPlate.keys()]);
  const camera = rng.pick(dataset.cameras);

  return {
    id: `live-${now.getTime().toString(36)}-${rng.int(0, 9999)}`,
    plate,
    cameraId: camera.id,
    timestamp: now.toISOString(),
  };
}

export function watchlistAlertFor(
  detection: Detection,
  entry: WatchlistEntry,
  camera: Camera,
): Alert {
  return {
    id: `a-live-${Date.now().toString(36)}`,
    type: 'watchlist_hit',
    severity: entry.severity,
    status: 'new',
    title: `Watchlist hit · ${detection.plate}`,
    detail: `${entry.reason} Sighted at ${camera.name} (${camera.code}).`,
    timestamp: detection.timestamp,
    plate: detection.plate,
    cameraId: detection.cameraId,
    detectionId: detection.id,
    watchlistId: entry.id,
    activity: [
      { at: detection.timestamp, by: 'System', action: 'Alert generated' },
    ],
  };
}
