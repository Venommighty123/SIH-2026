import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BellRing,
  Cctv,
  ScanLine,
  ShieldAlert,
  Car,
} from 'lucide-react';
import { api, queryKeys } from '@/api';
import { PageScroll } from '@/components/layout/Page';
import { CityMap } from '@/components/map/CityMap';
import {
  CameraStatusLegend,
  DensityLegend,
  LayerToggles,
  MapOverlay,
} from '@/components/map/MapControls';
import { LiveReadList } from '@/components/anpr/LiveReadList';
import {
  Button,
  EmptyState,
  Panel,
  PanelHeader,
  PlateChip,
  Skeleton,
  Stat,
} from '@/components/ui/primitives';
import { useLiveFeed } from '@/providers/LiveFeedProvider';
import { useAppStore } from '@/store/useAppStore';
import { formatPlate } from '@/mock/vehicles';
import {
  ALERT_TYPE_LABEL,
  formatCompact,
  formatCount,
  formatRelative,
  SEVERITY_COLOR,
} from '@/lib/format';

/**
 * Live operations overview.
 *
 * Simplified: Map, Feed, Alerts, basic KPIs.
 */
export function OverviewPage() {
  const navigate = useNavigate();
  const mapLayers = useAppStore((state) => state.mapLayers);
  const toggleMapLayer = useAppStore((state) => state.toggleMapLayer);
  const selectedCameraId = useAppStore((state) => state.selectedCameraId);
  const setSelectedCameraId = useAppStore((state) => state.setSelectedCameraId);

  const { detections: liveDetections, ratePerMinute } = useLiveFeed();

  const kpis = useQuery({ queryKey: queryKeys.kpis, queryFn: () => api.getKpis() });
  const cameras = useQuery({ queryKey: queryKeys.cameras, queryFn: () => api.getCameras(), staleTime: 30_000 });
  const heatPoints = useQuery({ queryKey: queryKeys.heatPoints, queryFn: () => api.getHeatPoints() });
  const watchlist = useQuery({ queryKey: queryKeys.watchlist, queryFn: () => api.getWatchlist(), staleTime: 60_000 });
  const alerts = useQuery({
    queryKey: queryKeys.alerts('overview'),
    queryFn: () => api.getAlerts({ status: ['new', 'acknowledged', 'investigating'], limit: 14 }),
    refetchInterval: 15_000,
  });

  const seedReads = useQuery({
    queryKey: queryKeys.recentDetections(60),
    queryFn: () => api.getRecentDetections(60),
    staleTime: 30_000,
  });

  const camerasById = useMemo(
    () => new Map((cameras.data ?? []).map((camera) => [camera.id, camera])),
    [cameras.data],
  );

  const flaggedPlates = useMemo(
    () => new Set((watchlist.data ?? []).filter((entry) => entry.active).map((entry) => entry.plate)),
    [watchlist.data],
  );

  const cameraReads = useMemo(
    () => new Map((heatPoints.data ?? []).map((point) => [point.cameraId, point.weight])),
    [heatPoints.data],
  );

  const feed = useMemo(() => {
    const seen = new Set<string>();
    return [...liveDetections, ...(seedReads.data ?? [])]
      .filter((detection) => (seen.has(detection.id) ? false : (seen.add(detection.id), true)))
      .slice(0, 80);
  }, [liveDetections, seedReads.data]);

  return (
    <PageScroll>
      {/* ---------------------------------------------------------------- KPIs */}
      <section
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
        aria-label="Key performance indicators"
      >
        {kpis.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[86px]" />)
        ) : (
          <>
            <Stat
              label="Reads · 24 h"
              value={formatCompact(kpis.data?.totalReads24h ?? 0)}
              icon={<ScanLine className="size-4" />}
              hint={`${formatCount(ratePerMinute)}/min now`}
            />
            <Stat
              label="Unique plates"
              value={formatCompact(kpis.data?.uniquePlates24h ?? 0)}
              icon={<Car className="size-4" />}
              hint="distinct registrations"
            />
            <Stat
              label="Nodes online"
              value={`${kpis.data?.activeCameras ?? 0}`}
              unit={`/ ${kpis.data?.totalCameras ?? 0}`}
              icon={<Cctv className="size-4" />}
              tone={
                (kpis.data?.activeCameras ?? 0) === (kpis.data?.totalCameras ?? 0) ? 'ok' : 'warn'
              }
              hint="reporting heartbeat"
            />
            <Stat
              label="Open alerts"
              value={formatCount(kpis.data?.openAlerts ?? 0)}
              icon={<BellRing className="size-4" />}
              tone={(kpis.data?.openAlerts ?? 0) > 0 ? 'danger' : 'ok'}
              hint={`${kpis.data?.watchlistHits24h ?? 0} watchlist hits`}
            />
          </>
        )}
      </section>

      {/* ------------------------------------------------------ Map + live feed */}
      <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Panel flush className="h-[26rem] xl:col-span-8 xl:h-[30rem]">
          <CityMap
            cameras={cameras.data ?? []}
            cameraReads={cameraReads}
            heatPoints={heatPoints.data ?? []}
            layers={{ ...mapLayers, congestion: false, zones: false }}
            selectedCameraId={selectedCameraId}
            onSelectCamera={setSelectedCameraId}
          >
            <MapOverlay position="top-left">
              <LayerToggles
                layers={mapLayers}
                onToggle={toggleMapLayer}
                exclude={['congestion', 'zones', 'labels']}
              />
            </MapOverlay>

            <MapOverlay position="bottom-right" className="flex flex-col gap-2">
              <DensityLegend />
              <CameraStatusLegend />
            </MapOverlay>

            {selectedCameraId && camerasById.has(selectedCameraId) && (
              <MapOverlay position="top-right" className="w-56">
                <SelectedCameraCard
                  cameraId={selectedCameraId}
                  camerasById={camerasById}
                  reads={cameraReads.get(selectedCameraId) ?? 0}
                  onClear={() => setSelectedCameraId(null)}
                />
              </MapOverlay>
            )}
          </CityMap>
        </Panel>

        <Panel flush className="h-[26rem] xl:col-span-4 xl:h-[30rem]">
          <PanelHeader
            className="border-b border-line p-3"
            title="Live ANPR stream"
            subtitle={`${formatCount(ratePerMinute)} reads/min · newest first`}
            icon={<ScanLine className="size-4" />}
            actions={
              <Link to="/search">
                <Button variant="ghost" size="xs">
                  Search archive
                </Button>
              </Link>
            }
          />
          <LiveReadList
            detections={feed}
            camerasById={camerasById}
            flaggedPlates={flaggedPlates}
            loading={seedReads.isLoading}
            onSelect={(detection) => navigate(`/track?plate=${detection.plate}`)}
            className="flex-1"
          />
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-3">
        <Panel flush>
          <PanelHeader
            className="border-b border-line p-3"
            title="Needs attention"
            subtitle="Open alerts, highest severity first"
            icon={<ShieldAlert className="size-4" />}
            actions={
              <Link to="/alerts">
                <Button variant="ghost" size="xs">
                  Triage
                </Button>
              </Link>
            }
          />
          <div className="max-h-72 flex-1 overflow-y-auto">
            {alerts.isLoading ? (
              <div className="flex flex-col gap-1.5 p-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : (alerts.data ?? []).length === 0 ? (
              <EmptyState title="Nothing open" description="Every alert has been actioned." />
            ) : (
              <ul>
                {(alerts.data ?? []).map((alert) => (
                  <li key={alert.id}>
                    <Link
                      to={`/alerts?id=${alert.id}`}
                      className="flex items-start gap-2.5 border-b border-line/50 px-3 py-2 transition-colors hover:bg-surface-2"
                    >
                      <span
                        className="mt-1 size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: SEVERITY_COLOR[alert.severity] }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="min-w-0 truncate text-[11px] font-medium text-ink">
                            {ALERT_TYPE_LABEL[alert.type]}
                          </span>
                          {alert.plate && <PlateChip plate={formatPlate(alert.plate)} size="sm" />}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[10.5px] leading-relaxed text-ink-dim">
                          {alert.detail}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] text-ink-dim">
                        {formatRelative(alert.timestamp)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </section>
    </PageScroll>
  );
}

// ---------------------------------------------------------------------------

function SelectedCameraCard({
  cameraId,
  camerasById,
  reads,
  onClear,
}: {
  cameraId: string;
  camerasById: Map<string, import('@/types').Camera>;
  reads: number;
  onClear: () => void;
}) {
  const camera = camerasById.get(cameraId);
  if (!camera) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-semibold text-ink">{camera.name}</p>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 text-[10px] text-ink-dim hover:text-ink"
        >
          clear
        </button>
      </div>
      <p className="text-[10px] text-ink-dim">
        {camera.code} · {camera.location}
      </p>
      <dl className="grid grid-cols-2 gap-1.5 text-[10px]">
        <div>
          <dt className="text-ink-dim">Reads (24h)</dt>
          <dd className="nums font-semibold text-ink">{formatCompact(reads)}</dd>
        </div>
      </dl>
      <Link to={`/feeds?camera=${camera.id}`}>
        <Button variant="secondary" size="xs" className="w-full mt-2">
          Open live view
        </Button>
      </Link>
    </div>
  );
}
