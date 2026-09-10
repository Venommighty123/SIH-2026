import type {
  AlertType,
  CameraStatus,
  Severity,
  WatchlistCategory,
} from '@/types';

/** Presentation helpers. Kept in one place so units and labels stay consistent. */

const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat('en-IN');

export const formatCount = (value: number) => decimal.format(Math.round(value));
export const formatCompact = (value: number) => compact.format(value);

export const formatPercent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;

export const formatDistance = (km: number) =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 2 : 1)} km`;

export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

/** 24-hour clock with seconds — control rooms do not use AM/PM. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false });
}

export function formatTimeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${date.toLocaleTimeString(
    'en-GB',
    { hour12: false },
  )}`;
}

export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 0) return 'just now';
  if (seconds < 10) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Enum labels
// ---------------------------------------------------------------------------

export const CAMERA_STATUS_LABEL: Record<CameraStatus, string> = {
  online: 'Online',
  degraded: 'Degraded',
  offline: 'Offline',
  maintenance: 'Maintenance',
};

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  watchlist_hit: 'Watchlist hit',
  camera_offline: 'Camera offline',
};

export const WATCHLIST_CATEGORY_LABEL: Record<WatchlistCategory, string> = {
  stolen: 'Stolen vehicle',
  wanted_criminal: 'Wanted / criminal',
  unpaid_challan: 'Unpaid challan',
  expired_permit: 'Expired permit',
  court_order: 'Court order',
  suspect_surveillance: 'Surveillance subject',
};

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ---------------------------------------------------------------------------
// Colour mapping
// ---------------------------------------------------------------------------

export const SEVERITY_COLOR: Record<Severity, string> = {
  low: '#7dd3fc',
  medium: '#f7c948',
  high: '#f97e3f',
  critical: '#e5484d',
};

export const CAMERA_STATUS_COLOR: Record<CameraStatus, string> = {
  online: '#3ddc97',
  degraded: '#f7c948',
  offline: '#e5484d',
  maintenance: '#8b9bb4',
};

/** Downloads a client-side generated file, used by the export actions. */
export function downloadFile(filename: string, contents: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Builds a CSV, quoting values that contain separators. */
export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const escape = (value: string | number) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n');
}
