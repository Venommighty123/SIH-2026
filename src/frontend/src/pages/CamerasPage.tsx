import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Cctv, Download, Network, Radio, TriangleAlert, Wrench } from 'lucide-react';
import { api, queryKeys } from '@/api';
import { PageFixed, PageToolbar } from '@/components/layout/Page';
import { CityMap } from '@/components/map/CityMap';
import { CameraStatusLegend, LayerToggles, MapOverlay } from '@/components/map/MapControls';
import { DataTable, type Column } from '@/components/ui/DataTable';
import {
  Badge,
  Button,
  cn,
  DetailRow,
  EmptyState,
  FieldLabel,
  Input,
  Panel,
  PanelHeader,
  Segmented,
  Select,
  Skeleton,
  Stat,
} from '@/components/ui/primitives';
import { convexHull, padRing } from '@/lib/geo';
import {
  CAMERA_STATUS_COLOR,
  CAMERA_STATUS_LABEL,
  downloadFile,
  formatCompact,
  formatRelative,
  toCsv,
} from '@/lib/format';
import { useAppStore, useCan } from '@/store/useAppStore';
import { useLiveFeed } from '@/providers/LiveFeedProvider';
import type { Camera, CameraStatus } from '@/types';

/**
 * Camera network register.
 *
 * Simplified: Removes hardware specs, accuracy, lanes, and speed limits.
 */

type ViewMode = 'table' | 'map';

export function CamerasPage() {
  const [view, setView] = useState<ViewMode>('table');
  const [statusFilter, setStatusFilter] = useState<'all' | CameraStatus>('all');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [search, setSearch] = useState('');

  const selectedCameraId = useAppStore((state) => state.selectedCameraId);
  const setSelectedCameraId = useAppStore((state) => state.setSelectedCameraId);
  const mapLayers = useAppStore((state) => state.mapLayers);
  const toggleMapLayer = useAppStore((state) => state.toggleMapLayer);
  const canExport = useCan('export');

  const { cameraStatus } = useLiveFeed();

  const cameras = useQuery({ queryKey: queryKeys.cameras, queryFn: () => api.getCameras(), staleTime: 20_000 });
  const zones = useQuery({ queryKey: queryKeys.zones, queryFn: () => api.getZones(), staleTime: Infinity });
  const heatPoints = useQuery({ queryKey: queryKeys.heatPoints, queryFn: () => api.getHeatPoints() });

  const resolved = useMemo<Camera[]>(
    () =>
      (cameras.data ?? []).map((camera) =>
        cameraStatus[camera.id] ? { ...camera, status: cameraStatus[camera.id] } : camera,
      ),
    [cameras.data, cameraStatus],
  );

  const readsByCamera = useMemo(
    () => new Map((heatPoints.data ?? []).map((point) => [point.cameraId, point.weight])),
    [heatPoints.data],
  );

  const zonesById = useMemo(
    () => new Map((zones.data ?? []).map((zone) => [zone.id, zone])),
    [zones.data],
  );

  const zonePolygons = useMemo(() => {
    if (!zones.data) return [];
    return zones.data.map((zone) => ({
      id: zone.id,
      name: zone.name,
      ring: padRing(
        convexHull(resolved.filter((camera) => camera.zoneId === zone.id).map((c) => c.position)),
      ),
    }));
  }, [zones.data, resolved]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return resolved.filter((camera) => {
      if (statusFilter !== 'all' && camera.status !== statusFilter) return false;
      if (zoneFilter !== 'all' && camera.zoneId !== zoneFilter) return false;
      if (query) {
        return (
          camera.name.toLowerCase().includes(query) ||
          camera.code.toLowerCase().includes(query) ||
          camera.location.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [resolved, statusFilter, zoneFilter, search]);

  const stats = useMemo(() => {
    const counts: Record<CameraStatus, number> = { online: 0, degraded: 0, offline: 0, maintenance: 0 };
    for (const camera of resolved) counts[camera.status] += 1;

    return {
      counts,
      total: resolved.length,
    };
  }, [resolved]);

  const selected = selectedCameraId ? resolved.find((c) => c.id === selectedCameraId) : undefined;

  const exportCsv = () => {
    downloadFile(
      `netra-cameras-${Date.now()}.csv`,
      toCsv(
        [
          'Code',
          'Name',
          'Location',
          'Zone',
          'Status',
          'Latitude',
          'Longitude',
          'Reads (window)',
        ],
        filtered.map((camera) => [
          camera.code,
          camera.name,
          camera.location,
          zonesById.get(camera.zoneId)?.name ?? camera.zoneId,
          camera.status,
          camera.position[1].toFixed(6),
          camera.position[0].toFixed(6),
          readsByCamera.get(camera.id) ?? 0,
        ]),
      ),
    );
  };

  const columns = useMemo<Array<Column<Camera>>>(
    () => [
      {
        id: 'status',
        header: '',
        width: '2rem',
        align: 'center',
        sortValue: (row) => row.status,
        cell: (row) => (
          <span
            className="inline-block size-2 rounded-full"
            style={{ backgroundColor: CAMERA_STATUS_COLOR[row.status] }}
            title={CAMERA_STATUS_LABEL[row.status]}
          />
        ),
      },
      {
        id: 'code',
        header: 'Code',
        width: '7rem',
        sortValue: (row) => row.code,
        cell: (row) => <span className="font-mono text-[11px] text-ink">{row.code}</span>,
      },
      {
        id: 'name',
        header: 'Node',
        sortValue: (row) => row.name,
        cell: (row) => (
          <span className="block min-w-0">
            <span className="block truncate text-[11px] font-medium text-ink">{row.name}</span>
            <span className="block truncate text-[10px] text-ink-dim">{row.location}</span>
          </span>
        ),
      },
      {
        id: 'zone',
        header: 'Zone',
        width: '9rem',
        hideOnNarrow: true,
        sortValue: (row) => zonesById.get(row.zoneId)?.name ?? '',
        cell: (row) => (
          <span className="truncate text-[11px] text-ink-muted">
            {zonesById.get(row.zoneId)?.name ?? row.zoneId}
          </span>
        ),
      },
      {
        id: 'reads',
        header: 'Reads (24h)',
        width: '6.5rem',
        align: 'right',
        sortValue: (row) => readsByCamera.get(row.id) ?? 0,
        cell: (row) => (
          <span className="nums text-[11px] text-ink-muted">
            {formatCompact(readsByCamera.get(row.id) ?? 0)}
          </span>
        ),
      },
      {
        id: 'heartbeat',
        header: 'Heartbeat',
        width: '6.5rem',
        align: 'right',
        sortValue: (row) => row.lastHeartbeat,
        cell: (row) => {
          const stale = Date.now() - new Date(row.lastHeartbeat).getTime() > 10 * 60_000;
          return (
            <span className={cn('text-[10.5px]', stale ? 'text-danger' : 'text-ink-dim')}>
              {formatRelative(row.lastHeartbeat)}
            </span>
          );
        },
      },
    ],
    [zonesById, readsByCamera],
  );

  return (
    <PageFixed>
      <section className="grid shrink-0 grid-cols-2 gap-2.5 lg:grid-cols-3">
        {cameras.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[86px]" />)
        ) : (
          <>
            <Stat
              label="Nodes deployed"
              value={stats.total}
              icon={<Network className="size-4" />}
            />
            <Stat
              label="Online"
              value={stats.counts.online}
              icon={<Radio className="size-4" />}
              tone="ok"
            />
            <Stat
              label="Not contributing"
              value={stats.counts.offline + stats.counts.maintenance + stats.counts.degraded}
              icon={<TriangleAlert className="size-4" />}
              tone={stats.counts.offline > 0 ? 'danger' : 'neutral'}
              hint="coverage gaps in trajectories"
            />
          </>
        )}
      </section>

      <PageToolbar>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'table', label: 'Register' },
            { value: 'map', label: 'Coverage map' },
          ]}
        />

        <Select
          value={zoneFilter}
          onChange={(event) => setZoneFilter(event.target.value)}
          aria-label="Filter by zone"
        >
          <option value="all">All zones</option>
          {(zones.data ?? []).map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </Select>

        <Select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'all' | CameraStatus)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {(['online', 'degraded', 'offline', 'maintenance'] as CameraStatus[]).map((status) => (
            <option key={status} value={status}>
              {CAMERA_STATUS_LABEL[status]} ({stats.counts[status]})
            </option>
          ))}
        </Select>

        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Node, code or road…"
          aria-label="Search cameras"
          className="w-56"
        />

        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden text-[11px] text-ink-dim sm:block">
            {filtered.length} of {stats.total}
          </span>
          {canExport && (
            <Button icon={<Download className="size-3.5" />} onClick={exportCsv}>
              Export register
            </Button>
          )}
        </div>
      </PageToolbar>

      <div className="flex min-h-0 flex-1 gap-3">
        <Panel flush className="min-w-0 flex-1">
          {view === 'table' ? (
            <>
              <PanelHeader
                className="border-b border-line p-3"
                title="Node register"
                subtitle="Sorted by status by default, so anything not contributing is at the top"
                icon={<Network className="size-4" />}
              />
              <DataTable
                rows={filtered}
                columns={columns}
                rowKey={(row) => row.id}
                onRowClick={(row) => setSelectedCameraId(row.id === selectedCameraId ? null : row.id)}
                isRowActive={(row) => row.id === selectedCameraId}
                loading={cameras.isLoading}
                dense
                defaultSort={{ columnId: 'status', direction: 'asc' }}
                rowAccent={(row) =>
                  row.status === 'offline'
                    ? 'var(--color-danger)'
                    : row.status === 'degraded'
                      ? 'var(--color-warn)'
                      : undefined
                }
                empty={
                  <EmptyState
                    icon={<Cctv className="size-7" />}
                    title="No nodes match"
                    description="Adjust the zone or status filter."
                  />
                }
              />
            </>
          ) : (
            <CityMap
              cameras={filtered}
              cameraReads={readsByCamera}
              zonePolygons={zonePolygons}
              layers={{ ...mapLayers, heatmap: false, congestion: false, zones: true }}
              selectedCameraId={selectedCameraId}
              onSelectCamera={setSelectedCameraId}
              fitTo={filtered.length > 0 ? filtered.map((camera) => camera.position) : null}
            >
              <MapOverlay position="top-left">
                <LayerToggles
                  layers={{ ...mapLayers, zones: true }}
                  onToggle={toggleMapLayer}
                  exclude={['heatmap', 'congestion', 'labels']}
                />
              </MapOverlay>
              <MapOverlay position="bottom-right">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Coverage</FieldLabel>
                  <CameraStatusLegend />
                  <p className="max-w-44 text-[9.5px] leading-snug text-ink-dim/80">
                    Dashed outlines are the convex hull of each zone's nodes — the area the network
                    actually observes, not the administrative boundary.
                  </p>
                </div>
              </MapOverlay>
            </CityMap>
          )}
        </Panel>

        {selected && (
          <CameraDetail
            camera={selected}
            zoneName={zonesById.get(selected.zoneId)?.name ?? selected.zoneId}
            division={zonesById.get(selected.zoneId)?.division ?? ''}
            reads={readsByCamera.get(selected.id) ?? 0}
            onClose={() => setSelectedCameraId(null)}
          />
        )}
      </div>
    </PageFixed>
  );
}

// ---------------------------------------------------------------------------

function CameraDetail({
  camera,
  zoneName,
  division,
  reads,
  onClose,
}: {
  camera: Camera;
  zoneName: string;
  division: string;
  reads: number;
  onClose: () => void;
}) {
  return (
    <Panel flush className="hidden w-84 shrink-0 lg:flex">
      <PanelHeader
        className="border-b border-line p-3"
        title={camera.name}
        subtitle={`${camera.code} · ${camera.location}`}
        icon={<Cctv className="size-4" />}
        actions={
          <Button variant="ghost" size="xs" onClick={onClose}>
            Close
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge
            tone={
              camera.status === 'online'
                ? 'ok'
                : camera.status === 'degraded'
                  ? 'warn'
                  : camera.status === 'offline'
                    ? 'danger'
                    : 'neutral'
            }
            dot
          >
            {CAMERA_STATUS_LABEL[camera.status]}
          </Badge>
          {camera.status === 'maintenance' && (
            <Badge tone="info">
              <Wrench className="size-3" />
              Scheduled work
            </Badge>
          )}
        </div>

        {camera.status !== 'online' && (
          <p
            className={cn(
              'mt-2.5 rounded-md p-2.5 text-[11px] leading-relaxed ring-1 ring-inset',
              camera.status === 'offline'
                ? 'bg-danger/10 text-danger ring-danger/30'
                : 'bg-warn/10 text-warn ring-warn/30',
            )}
          >
            {camera.status === 'offline'
              ? 'This node is contributing nothing. Any vehicle passing here becomes an inferred leg in trajectory reconstruction rather than an observed sighting.'
              : camera.status === 'degraded'
                ? 'This node is experiencing issues.'
                : 'Node is out of service for planned maintenance. Coverage gap is expected and time-boxed.'}
          </p>
        )}

        <div className="mt-3 flex flex-col">
          <DetailRow label="Reads in window">{formatCompact(reads)}</DetailRow>
          <DetailRow label="Zone">{zoneName}</DetailRow>
          <DetailRow label="Division">{division}</DetailRow>
          <DetailRow label="Last heartbeat">{formatRelative(camera.lastHeartbeat)}</DetailRow>
        </div>

        <div className="mt-3 border-t border-line pt-2">
          <FieldLabel className="mb-1.5">Site configuration</FieldLabel>
          <div className="flex flex-col">
            <DetailRow label="Coordinates">
              <span className="font-mono text-[10.5px]">
                {camera.position[1].toFixed(5)}, {camera.position[0].toFixed(5)}
              </span>
            </DetailRow>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
          <Link to={`/feeds?camera=${camera.id}`}>
            <Button variant="primary" size="sm" className="w-full">
              Open live view
            </Button>
          </Link>
          <Link to={`/search?camera=${camera.id}`}>
            <Button variant="secondary" size="sm" className="w-full">
              Search reads from this node
            </Button>
          </Link>
        </div>
      </div>
    </Panel>
  );
}
