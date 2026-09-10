import type { CityKpis } from '@/types';
import type { Dataset } from './generate';

/**
 * Simplified aggregations over the raw dataset.
 */

export function buildKpis(dataset: Dataset): CityKpis {
  const { detections, cameras, alerts, detectionsByPlate, watchlist } = dataset;

  const windowMinutes =
    (new Date(dataset.windowEnd).getTime() - new Date(dataset.windowStart).getTime()) / 60_000;

  const watchlistPlates = new Set(watchlist.filter((w) => w.active).map((w) => w.plate));

  // Recent throughput is a better "now" figure than the 24h mean.
  const cutoff = new Date(dataset.windowEnd).getTime() - 10 * 60_000;
  const recent = detections.filter((d) => new Date(d.timestamp).getTime() >= cutoff);

  return {
    totalReads24h: detections.length,
    uniquePlates24h: detectionsByPlate.size,
    activeCameras: cameras.filter((c) => c.status === 'online' || c.status === 'degraded').length,
    totalCameras: cameras.length,
    openAlerts: alerts.filter((a) => a.status === 'new' || a.status === 'acknowledged' || a.status === 'investigating').length,
    watchlistHits24h: detections.filter((d) => watchlistPlates.has(d.plate)).length,
    readsPerMinute: Number(
      (recent.length > 0 ? recent.length / 10 : detections.length / Math.max(1, windowMinutes)).toFixed(1),
    ),
  };
}
