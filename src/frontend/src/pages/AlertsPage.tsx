import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  CheckCircle2,
  CircleSlash,
  Clock,
  MapPin,
  Route as RouteIcon,
  Search,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import { api, queryKeys } from '@/api';
import { PageFixed, PageToolbar } from '@/components/layout/Page';
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
  PlateChip,
  Segmented,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { useLiveFeed } from '@/providers/LiveFeedProvider';
import { formatPlate } from '@/mock/vehicles';
import {
  ALERT_TYPE_LABEL,
  formatCount,
  formatDateTime,
  formatRelative,
  formatTime,
  SEVERITY_COLOR,
  SEVERITY_ORDER,
} from '@/lib/format';
import { useCan } from '@/store/useAppStore';
import type { Alert, AlertStatus, AlertType, Severity } from '@/types';

/**
 * Alert triage.
 *
 * Simplified: Alerts are strictly watchlist hits. Removed complex evidence UI
 * relying on confidence/SVGs.
 */

const STATUS_LABEL: Record<AlertStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  investigating: 'Investigating',
  resolved: 'Resolved',
  false_positive: 'False positive',
};

const STATUS_TONE: Record<AlertStatus, 'danger' | 'warn' | 'info' | 'ok' | 'neutral'> = {
  new: 'danger',
  acknowledged: 'warn',
  investigating: 'info',
  resolved: 'ok',
  false_positive: 'neutral',
};

const ALERT_TYPES: AlertType[] = [
  'watchlist_hit',
];

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

type QueueFilter = 'open' | 'mine' | 'all' | 'closed';

const ASSIGNEES = [
  'Insp. R. Deshpande',
  'PSI A. Kulkarni',
  'ASI M. Bhosale',
  'Insp. S. Nair',
  'Sr. PI V. Chavan',
];

export function AlertsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusedId = searchParams.get('id');

  const [queue, setQueue] = useState<QueueFilter>('open');
  const [typeFilter, setTypeFilter] = useState<'all' | AlertType>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');

  const toast = useToast();
  const queryClient = useQueryClient();
  const canAcknowledge = useCan('acknowledge_alerts');
  const canResolve = useCan('resolve_alerts');

  const { alerts: liveAlerts } = useLiveFeed();

  const alerts = useQuery({
    queryKey: queryKeys.alerts('triage'),
    queryFn: () => api.getAlerts({ limit: 400 }),
    refetchInterval: 20_000,
  });

  const cameras = useQuery({ queryKey: queryKeys.cameras, queryFn: () => api.getCameras(), staleTime: 60_000 });
  const camerasById = useMemo(
    () => new Map((cameras.data ?? []).map((camera) => [camera.id, camera])),
    [cameras.data],
  );

  const merged = useMemo(() => {
    const seen = new Set<string>();
    return [...liveAlerts, ...(alerts.data ?? [])].filter((alert) =>
      seen.has(alert.id) ? false : (seen.add(alert.id), true),
    );
  }, [liveAlerts, alerts.data]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return merged
      .filter((alert) => {
        if (queue === 'open' && !['new', 'acknowledged', 'investigating'].includes(alert.status)) return false;
        if (queue === 'closed' && !['resolved', 'false_positive'].includes(alert.status)) return false;
        if (queue === 'mine' && !alert.assignedTo?.startsWith('You')) return false;
        if (typeFilter !== 'all' && alert.type !== typeFilter) return false;
        if (severityFilter !== 'all' && alert.severity !== severityFilter) return false;
        if (query) {
          return (
            alert.title.toLowerCase().includes(query) ||
            alert.detail.toLowerCase().includes(query) ||
            (alert.plate?.toLowerCase().includes(query) ?? false)
          );
        }
        return true;
      })
      .sort(
        (a, b) =>
          SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
          b.timestamp.localeCompare(a.timestamp),
      );
  }, [merged, queue, typeFilter, severityFilter, search]);

  const selected = useMemo(
    () => filtered.find((alert) => alert.id === focusedId) ?? filtered[0] ?? null,
    [filtered, focusedId],
  );

  const select = (id: string) => {
    setSearchParams((params) => {
      params.set('id', id);
      return params;
    }, { replace: true });
    setNote('');
  };

  useEffect(() => {
    if (focusedId && !filtered.some((alert) => alert.id === focusedId)) {
      setSearchParams((params) => {
        params.delete('id');
        return params;
      }, { replace: true });
    }
  }, [focusedId, filtered, setSearchParams]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status, statusNote }: { id: string; status: AlertStatus; statusNote?: string }) =>
      api.updateAlertStatus(id, status, statusNote),
    onSuccess: (alert) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.push({
        tone: alert.status === 'resolved' ? 'success' : 'info',
        title: `${alert.title} → ${STATUS_LABEL[alert.status]}`,
      });
      setNote('');
    },
    onError: (error) =>
      toast.push({
        tone: 'critical',
        title: 'Could not update alert',
        detail: error instanceof Error ? error.message : 'Unknown error',
      }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, assignee }: { id: string; assignee: string }) => api.assignAlert(id, assignee),
    onSuccess: (alert) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.push({ tone: 'info', title: `Assigned to ${alert.assignedTo}` });
    },
  });

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {};
    for (const alert of merged) byStatus[alert.status] = (byStatus[alert.status] ?? 0) + 1;
    return {
      open: (byStatus.new ?? 0) + (byStatus.acknowledged ?? 0) + (byStatus.investigating ?? 0),
      closed: (byStatus.resolved ?? 0) + (byStatus.false_positive ?? 0),
      critical: merged.filter(
        (alert) => alert.severity === 'critical' && !['resolved', 'false_positive'].includes(alert.status),
      ).length,
      all: merged.length,
    };
  }, [merged]);

  return (
    <PageFixed>
      <PageToolbar>
        <Segmented
          value={queue}
          onChange={setQueue}
          options={[
            { value: 'open', label: `Open (${counts.open})` },
            { value: 'mine', label: 'Mine' },
            { value: 'closed', label: `Closed (${counts.closed})` },
            { value: 'all', label: `All (${counts.all})` },
          ]}
        />

        <Select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as 'all' | AlertType)}
          aria-label="Filter by alert type"
        >
          <option value="all">All types</option>
          {ALERT_TYPES.map((type) => (
            <option key={type} value={type}>
              {ALERT_TYPE_LABEL[type]}
            </option>
          ))}
        </Select>

        <Select
          value={severityFilter}
          onChange={(event) => setSeverityFilter(event.target.value as 'all' | Severity)}
          aria-label="Filter by severity"
        >
          <option value="all">All severities</option>
          {SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </Select>

        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search title, detail or plate…"
          aria-label="Search alerts"
          className="w-56"
        />

        {counts.critical > 0 && (
          <Badge tone="critical" dot className="ml-auto">
            {counts.critical} critical open
          </Badge>
        )}
      </PageToolbar>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* ---------------------------------------------------------- Queue */}
        <Panel flush className="w-full min-w-0 lg:w-[26rem] lg:shrink-0">
          <PanelHeader
            className="border-b border-line p-3"
            title="Alert queue"
            subtitle={`${formatCount(filtered.length)} alert${filtered.length === 1 ? '' : 's'} · severity then recency`}
            icon={<BellRing className="size-4" />}
          />

          {alerts.isLoading ? (
            <div className="flex flex-col gap-1.5 p-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="size-7" />}
              title="Queue is clear"
              description="Nothing matches this filter. Switch to All to review closed alerts."
            />
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {filtered.map((alert) => (
                <li key={alert.id}>
                  <button
                    type="button"
                    onClick={() => select(alert.id)}
                    className={cn(
                      'relative flex w-full flex-col gap-1 border-b border-line/50 px-3 py-2.5 text-left transition-colors',
                      selected?.id === alert.id ? 'bg-brand/10' : 'hover:bg-surface-2',
                    )}
                  >
                    <span
                      className="absolute inset-y-0 left-0 w-0.5"
                      style={{ backgroundColor: SEVERITY_COLOR[alert.severity] }}
                      aria-hidden="true"
                    />
                    <span className="flex items-center gap-1.5">
                      <Badge tone={STATUS_TONE[alert.status]}>{STATUS_LABEL[alert.status]}</Badge>
                      <span className="truncate text-[10px] text-ink-dim">
                        {ALERT_TYPE_LABEL[alert.type]}
                      </span>
                      <span className="nums ml-auto shrink-0 text-[10px] text-ink-dim">
                        {formatRelative(alert.timestamp)}
                      </span>
                    </span>

                    <span className="flex items-center gap-1.5">
                      {alert.plate && <PlateChip plate={formatPlate(alert.plate)} size="sm" />}
                      <span className="min-w-0 truncate text-[11.5px] font-medium text-ink">
                        {alert.plate ? alert.title.split('·')[0].trim() : alert.title}
                      </span>
                    </span>

                    <span className="line-clamp-2 text-[10.5px] leading-relaxed text-ink-dim">
                      {alert.detail}
                    </span>

                    {alert.assignedTo && (
                      <span className="flex items-center gap-1 text-[10px] text-ink-dim">
                        <UserCheck className="size-3" />
                        {alert.assignedTo}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* --------------------------------------------------------- Detail */}
        {selected ? (
          <AlertDetail
            alert={selected}
            camera={selected.cameraId ? camerasById.get(selected.cameraId) : undefined}
            note={note}
            onNoteChange={setNote}
            canAcknowledge={canAcknowledge}
            canResolve={canResolve}
            busy={statusMutation.isPending || assignMutation.isPending}
            onStatus={(status) =>
              statusMutation.mutate({ id: selected.id, status, statusNote: note || undefined })
            }
            onAssign={(assignee) => assignMutation.mutate({ id: selected.id, assignee })}
          />
        ) : (
          <Panel flush className="hidden flex-1 lg:flex">
            <EmptyState
              icon={<ShieldAlert className="size-8" />}
              title="Select an alert"
              description="Pick an item from the queue to see the triggering read, the evidence, and the actions available to your role."
            />
          </Panel>
        )}
      </div>
    </PageFixed>
  );
}

// ---------------------------------------------------------------------------
// Detail pane
// ---------------------------------------------------------------------------

function AlertDetail({
  alert,
  camera,
  note,
  onNoteChange,
  canAcknowledge,
  canResolve,
  busy,
  onStatus,
  onAssign,
}: {
  alert: Alert;
  camera?: import('@/types').Camera;
  note: string;
  onNoteChange: (value: string) => void;
  canAcknowledge: boolean;
  canResolve: boolean;
  busy: boolean;
  onStatus: (status: AlertStatus) => void;
  onAssign: (assignee: string) => void;
}) {
  const detection = useQuery({
    queryKey: ['detection', alert.detectionId],
    queryFn: () => api.getDetection(alert.detectionId!),
    enabled: Boolean(alert.detectionId),
  });

  const watchlist = useQuery({
    queryKey: queryKeys.watchlist,
    queryFn: () => api.getWatchlist(),
    enabled: Boolean(alert.watchlistId),
    staleTime: 60_000,
  });

  const entry = watchlist.data?.find((row) => row.id === alert.watchlistId);
  const closed = alert.status === 'resolved' || alert.status === 'false_positive';

  return (
    <Panel flush className="hidden min-w-0 flex-1 lg:flex">
      <PanelHeader
        className="border-b border-line p-3"
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: SEVERITY_COLOR[alert.severity] }}
            />
            {alert.title}
            <Badge tone={STATUS_TONE[alert.status]}>{STATUS_LABEL[alert.status]}</Badge>
            <Badge tone="neutral">{alert.severity}</Badge>
          </span>
        }
        subtitle={`${ALERT_TYPE_LABEL[alert.type]} · raised ${formatDateTime(alert.timestamp)}`}
        icon={<ShieldAlert className="size-4" />}
        actions={
          alert.plate && (
            <Link to={`/track?plate=${alert.plate}`}>
              <Button variant="primary" size="xs" icon={<RouteIcon className="size-3" />}>
                Track vehicle
              </Button>
            </Link>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="text-xs leading-relaxed text-ink-muted">{alert.detail}</p>

        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {/* ------------------------------------------------- Evidence */}
          <div className="flex flex-col gap-3">
            {detection.isLoading && <Skeleton className="h-40" />}

            {!alert.detectionId && camera && (
              <div>
                <FieldLabel className="mb-1.5">Node</FieldLabel>
                <div className="rounded-md bg-surface-0 p-2.5 ring-1 ring-inset ring-line">
                  <p className="text-[11.5px] font-medium text-ink">{camera.name}</p>
                  <p className="mt-0.5 text-[10.5px] text-ink-dim">
                    {camera.code} · {camera.location}
                  </p>
                  <div className="mt-1.5 flex flex-col">
                    <DetailRow label="Status">{camera.status}</DetailRow>
                    <DetailRow label="Last heartbeat">
                      {formatRelative(camera.lastHeartbeat)}
                    </DetailRow>
                  </div>
                </div>
              </div>
            )}

            {entry && (
              <div>
                <FieldLabel className="mb-1.5">Watchlist entry</FieldLabel>
                <div className="rounded-md bg-critical/8 p-2.5 ring-1 ring-inset ring-critical/30">
                  <div className="flex flex-col">
                    <DetailRow label="Category">{entry.category.replace(/_/g, ' ')}</DetailRow>
                    <DetailRow label="Case reference">
                      <span className="font-mono">{entry.caseRef}</span>
                    </DetailRow>
                    <DetailRow label="Listed by">{entry.addedBy}</DetailRow>
                    <DetailRow label="Listed">{formatRelative(entry.addedAt)}</DetailRow>
                    <DetailRow label="Total hits">{entry.hitCount}</DetailRow>
                  </div>
                  <p className="mt-1.5 border-t border-critical/20 pt-1.5 text-[10.5px] leading-relaxed text-ink-muted">
                    {entry.reason}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* --------------------------------------------- Actions + trail */}
          <div className="flex flex-col gap-3">
            <div>
              <FieldLabel className="mb-1.5">Disposition</FieldLabel>

              {!canAcknowledge ? (
                <p className="rounded-md bg-surface-0 p-2.5 text-[11px] leading-relaxed text-ink-dim ring-1 ring-inset ring-line">
                  Your role has read-only access. Switch to Operator or above in the top bar to action
                  alerts.
                </p>
              ) : (
                <>
                  <Textarea
                    value={note}
                    onChange={(event) => onNoteChange(event.target.value)}
                    placeholder="Optional note recorded against this action…"
                    rows={2}
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button
                      variant="secondary"
                      onClick={() => onStatus('acknowledged')}
                      disabled={busy || alert.status === 'acknowledged'}
                      icon={<CheckCircle2 className="size-3.5" />}
                    >
                      Acknowledge
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => onStatus('investigating')}
                      disabled={busy || alert.status === 'investigating'}
                      icon={<Search className="size-3.5" />}
                    >
                      Investigating
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => onStatus('resolved')}
                      disabled={busy || !canResolve || alert.status === 'resolved'}
                      title={!canResolve ? 'Requires Investigator role or above' : undefined}
                    >
                      Resolve
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => onStatus('false_positive')}
                      disabled={busy || !canResolve || alert.status === 'false_positive'}
                      icon={<CircleSlash className="size-3.5" />}
                      title={!canResolve ? 'Requires Investigator role or above' : undefined}
                    >
                      False positive
                    </Button>
                    {closed && (
                      <Button variant="ghost" onClick={() => onStatus('new')} disabled={busy}>
                        Reopen
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>

            <div>
              <FieldLabel className="mb-1.5">Assignment</FieldLabel>
              <div className="flex items-center gap-2">
                <Select
                  value={alert.assignedTo ?? ''}
                  onChange={(event) => onAssign(event.target.value)}
                  disabled={!canAcknowledge || busy}
                  aria-label="Assign alert"
                  className="min-w-0 flex-1"
                >
                  <option value="">Unassigned</option>
                  {ASSIGNEES.map((assignee) => (
                    <option key={assignee} value={assignee}>
                      {assignee}
                    </option>
                  ))}
                </Select>
                <Button
                  onClick={() => onAssign('You (Control Room)')}
                  disabled={!canAcknowledge || busy}
                >
                  Take it
                </Button>
              </div>
            </div>

            <div>
              <FieldLabel className="mb-1.5">Activity trail</FieldLabel>
              <ol className="flex flex-col">
                {[...alert.activity].reverse().map((event, index) => (
                  <li key={index} className="flex gap-2.5 pb-2.5 last:pb-0">
                    <span className="relative flex flex-col items-center">
                      <span
                        className={cn(
                          'mt-1 size-1.5 shrink-0 rounded-full',
                          index === 0 ? 'bg-brand' : 'bg-line-strong',
                        )}
                      />
                      {index < alert.activity.length - 1 && (
                        <span className="mt-0.5 w-px flex-1 bg-line" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="text-[11px] font-medium text-ink">{event.action}</span>
                        <span className="nums ml-auto shrink-0 text-[10px] text-ink-dim">
                          {formatTime(event.at)}
                        </span>
                      </span>
                      <span className="block text-[10.5px] text-ink-dim">{event.by}</span>
                      {event.note && (
                        <span className="mt-0.5 block rounded bg-surface-0 px-2 py-1 text-[10.5px] leading-relaxed text-ink-muted ring-1 ring-inset ring-line">
                          {event.note}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-md bg-surface-0 p-2.5 ring-1 ring-inset ring-line">
              <div className="flex flex-col">
                <DetailRow label="Alert id">
                  <span className="font-mono text-[10px]">{alert.id}</span>
                </DetailRow>
                {alert.detectionId && (
                  <DetailRow label="Read id">
                    <span className="font-mono text-[10px]">{alert.detectionId}</span>
                  </DetailRow>
                )}
                <DetailRow label="Raised">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3 text-ink-dim" />
                    {formatDateTime(alert.timestamp)}
                  </span>
                </DetailRow>
                {camera && (
                  <DetailRow label="Location">
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3 text-ink-dim" />
                      {camera.name}
                    </span>
                  </DetailRow>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
