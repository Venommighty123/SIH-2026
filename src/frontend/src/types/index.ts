/**
 * Domain model for the NETRA city ANPR platform.
 *
 * Simplified contract: the backend provides only camera number, vehicle
 * registration (plate), camera location, and timestamp for each detection.
 */

// ---------------------------------------------------------------------------
// Geography & infrastructure
// ---------------------------------------------------------------------------

/** [longitude, latitude] — GeoJSON axis order, which is what MapLibre expects. */
export type LngLat = [number, number];

export type CameraStatus = 'online' | 'degraded' | 'offline' | 'maintenance';

export interface Zone {
  id: string;
  name: string;
  /** Administrative sector / police division this zone rolls up to. */
  division: string;
  center: LngLat;
}

export interface Camera {
  id: string;
  /** Human-facing code operators use on the radio, e.g. "PN-C-014". */
  code: string;
  name: string;
  /** Junction or road segment the camera overlooks. */
  location: string;
  zoneId: string;
  position: LngLat;
  status: CameraStatus;
  /** Video feed URLs for this junction (e.g. oncoming, left, right). */
  videoFeeds: string[];
  /** Last successful heartbeat, ISO string. */
  lastHeartbeat: string;
}

/** A directed road segment between two adjacent camera nodes. */
export interface RoadLink {
  id: string;
  fromCameraId: string;
  toCameraId: string;
  distanceKm: number;
  /** Corridor name for grouping, e.g. "Old Mumbai–Pune Hwy". */
  corridor: string;
}

// ---------------------------------------------------------------------------
// Vehicles & ANPR reads
// ---------------------------------------------------------------------------

/**
 * A single ANPR read. The atomic event the whole platform is built on.
 * Backend provides: camera number, vehicle number, camera location, timestamp.
 */
export interface Detection {
  id: string;
  /** Normalised plate after post-processing. */
  plate: string;
  cameraId: string;
  /** ISO 8601 timestamp of capture. */
  timestamp: string;
}

export interface Vehicle {
  plate: string;
  makeModel: string;
  registeredState: string;
  /** Masked registrant name — full PII stays server-side behind authorisation. */
  ownerMasked: string;
  isBlacklisted: boolean;
  firstSeen: string;
  lastSeen: string;
  totalSightings: number;
}

// ---------------------------------------------------------------------------
// Trajectory reconstruction
// ---------------------------------------------------------------------------

export interface TrajectoryLeg {
  fromCameraId: string;
  toCameraId: string;
  distanceKm: number;
  durationMin: number;
  /**
   * True when the two sightings are not adjacent on the road graph, meaning the
   * vehicle passed through uncovered area.
   */
  inferred: boolean;
  /** Number of graph hops the vehicle covered without being seen. */
  missingHops: number;
  /**
   * Camera ids along the inferred road-graph path, excluding both endpoints.
   */
  viaCameraIds: string[];
}

/** One sighting on a reconstructed path, joined with its camera for rendering. */
export interface TrajectoryPoint {
  detection: Detection;
  camera: Camera;
  /** Leg travelled to reach this point. Undefined for the first sighting. */
  legIn?: TrajectoryLeg;
  /** Sequence number, 1-based, in chronological order. */
  seq: number;
}

export interface Trajectory {
  plate: string;
  vehicle: Vehicle | null;
  points: TrajectoryPoint[];
  from: string;
  to: string;
  totalDistanceKm: number;
  totalDurationMin: number;
  camerasVisited: number;
}

// ---------------------------------------------------------------------------
// Watchlist & alerting
// ---------------------------------------------------------------------------

export type WatchlistCategory =
  | 'stolen'
  | 'wanted_criminal'
  | 'unpaid_challan'
  | 'expired_permit'
  | 'court_order'
  | 'suspect_surveillance';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface WatchlistEntry {
  id: string;
  plate: string;
  category: WatchlistCategory;
  severity: Severity;
  reason: string;
  caseRef: string;
  addedBy: string;
  addedAt: string;
  /** ISO date after which the entry auto-expires. */
  expiresAt: string | null;
  active: boolean;
  /** Notify these channels on a hit. */
  notify: Array<'control_room' | 'sms' | 'patrol_app' | 'email'>;
  hitCount: number;
}

export type AlertType =
  | 'watchlist_hit'
  | 'camera_offline';

export type AlertStatus = 'new' | 'acknowledged' | 'investigating' | 'resolved' | 'false_positive';

export interface Alert {
  id: string;
  type: AlertType;
  severity: Severity;
  status: AlertStatus;
  title: string;
  detail: string;
  timestamp: string;
  plate?: string;
  cameraId?: string;
  detectionId?: string;
  watchlistId?: string;
  assignedTo?: string;
  /** Audit trail of status transitions. */
  activity: Array<{ at: string; by: string; action: string; note?: string }>;
}

// ---------------------------------------------------------------------------
// Macro analytics (simplified)
// ---------------------------------------------------------------------------

/** Weighted point for the density heatmap. */
export interface HeatPoint {
  position: LngLat;
  weight: number;
  cameraId: string;
}

export interface CityKpis {
  totalReads24h: number;
  uniquePlates24h: number;
  activeCameras: number;
  totalCameras: number;
  openAlerts: number;
  watchlistHits24h: number;
  readsPerMinute: number;
}

// ---------------------------------------------------------------------------
// Query / filter contracts
// ---------------------------------------------------------------------------

export interface TimeRange {
  from: string;
  to: string;
}

export interface DetectionQuery {
  plate?: string;
  /** Fuzzy mode tolerates OCR confusions (0/O, 1/I, 8/B) when matching. */
  fuzzy?: boolean;
  cameraIds?: string[];
  zoneIds?: string[];
  range?: TimeRange;
  limit?: number;
  offset?: number;
}

export interface Paged<T> {
  rows: T[];
  total: number;
}

/** A near-match returned by fuzzy plate search, with the reason it matched. */
export interface PlateCandidate {
  plate: string;
  sightings: number;
  lastSeen: string;
  /** 0..1 similarity to the query. */
  score: number;
  /** Character substitutions that explain the match, e.g. "0→O @3". */
  explanation: string[];
  isBlacklisted: boolean;
}

// ---------------------------------------------------------------------------
// Realtime stream
// ---------------------------------------------------------------------------

export type LiveEvent =
  | { kind: 'detection'; payload: Detection }
  | { kind: 'alert'; payload: Alert }
  | { kind: 'camera_status'; payload: { cameraId: string; status: CameraStatus; at: string } };
