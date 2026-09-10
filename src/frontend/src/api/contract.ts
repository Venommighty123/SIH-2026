import type {
  Alert,
  AlertStatus,
  AlertType,
  Camera,
  CityKpis,
  Detection,
  DetectionQuery,
  HeatPoint,
  LiveEvent,
  Paged,
  PlateCandidate,
  Severity,
  TimeRange,
  Trajectory,
  Vehicle,
  WatchlistEntry,
  Zone,
} from '@/types';

/**
 * The single boundary between the UI and its data source.
 *
 * Simplified contract: no analytics endpoints (corridors, OD pairs, time
 * series, accuracy breakdowns). Backend provides only plate, camera, location,
 * and timestamp.
 */
export interface ApiClient {
  // --- Reference data ----------------------------------------------------
  getKpis(): Promise<CityKpis>;
  getCameras(): Promise<Camera[]>;
  getCamera(id: string): Promise<Camera | null>;
  getZones(): Promise<Zone[]>;

  // --- ANPR reads --------------------------------------------------------
  searchDetections(query: DetectionQuery): Promise<Paged<Detection>>;
  getDetection(id: string): Promise<Detection | null>;
  /** Most recent reads for the live feed, newest first. */
  getRecentDetections(limit: number): Promise<Detection[]>;
  getCameraDetections(cameraId: string, limit: number): Promise<Detection[]>;

  // --- Vehicles & trajectory --------------------------------------------
  getVehicle(plate: string): Promise<Vehicle | null>;
  suggestPlates(query: string, limit?: number): Promise<PlateCandidate[]>;
  getTrajectory(plate: string, range?: TimeRange): Promise<Trajectory | null>;

  // --- Watchlist ---------------------------------------------------------
  getWatchlist(): Promise<WatchlistEntry[]>;
  addWatchlistEntry(
    entry: Omit<WatchlistEntry, 'id' | 'addedAt' | 'hitCount'>,
  ): Promise<WatchlistEntry>;
  updateWatchlistEntry(id: string, patch: Partial<WatchlistEntry>): Promise<WatchlistEntry>;
  removeWatchlistEntry(id: string): Promise<void>;

  // --- Alerts ------------------------------------------------------------
  getAlerts(filter?: {
    status?: AlertStatus[];
    type?: AlertType[];
    severity?: Severity[];
    limit?: number;
  }): Promise<Alert[]>;
  updateAlertStatus(id: string, status: AlertStatus, note?: string): Promise<Alert>;
  assignAlert(id: string, assignee: string): Promise<Alert>;

  // --- Heatmap -----------------------------------------------------------
  getHeatPoints(): Promise<HeatPoint[]>;

  // --- Realtime ----------------------------------------------------------
  /** Returns an unsubscribe function. */
  subscribe(handler: (event: LiveEvent) => void): () => void;

  // --- Demo affordances --------------------------------------------------
  getFeaturedPlates(): Promise<string[]>;
}
