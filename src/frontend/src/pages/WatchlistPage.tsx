import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Download,
  Plus,
  Route as RouteIcon,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { api, queryKeys } from '@/api';
import { PageFixed, PageToolbar } from '@/components/layout/Page';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import {
  Badge,
  Button,
  cn,
  EmptyState,
  FieldLabel,
  Input,
  Panel,
  PanelHeader,
  PlateChip,
  Segmented,
  Select,
  Skeleton,
  Stat,
  Textarea,
  Toggle,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { formatPlate, normalisePlate } from '@/mock/vehicles';
import {
  downloadFile,
  formatCount,
  formatDateTime,
  formatRelative,
  SEVERITY_COLOR,
  SEVERITY_ORDER,
  toCsv,
  WATCHLIST_CATEGORY_LABEL,
} from '@/lib/format';
import { useCan } from '@/store/useAppStore';
import type { Severity, WatchlistCategory, WatchlistEntry } from '@/types';

/**
 * Watchlist management.
 *
 * The list that turns passive surveillance into active alerting. Kept
 * deliberately auditable: every entry carries who added it, under which case
 * reference, and when it expires — an open-ended watch on a private vehicle with
 * no case attached is exactly the thing that should be hard to create by accident.
 */

const CATEGORIES: WatchlistCategory[] = [
  'stolen',
  'wanted_criminal',
  'court_order',
  'suspect_surveillance',
  'unpaid_challan',
  'expired_permit',
];

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

const NOTIFY_CHANNELS = ['control_room', 'sms', 'patrol_app', 'email'] as const;

const NOTIFY_LABEL: Record<(typeof NOTIFY_CHANNELS)[number], string> = {
  control_room: 'Control room',
  sms: 'SMS',
  patrol_app: 'Patrol app',
  email: 'Email',
};

const SEVERITY_TONE: Record<Severity, 'critical' | 'danger' | 'warn' | 'info'> = {
  critical: 'critical',
  high: 'danger',
  medium: 'warn',
  low: 'info',
};

type StateFilter = 'active' | 'inactive' | 'all';

export function WatchlistPage() {
  const [stateFilter, setStateFilter] = useState<StateFilter>('active');
  const [categoryFilter, setCategoryFilter] = useState<'all' | WatchlistCategory>('all');
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<WatchlistEntry | null>(null);

  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = useCan('manage_watchlist');
  const canExport = useCan('export');

  const watchlist = useQuery({ queryKey: queryKeys.watchlist, queryFn: () => api.getWatchlist() });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.watchlist });
    queryClient.invalidateQueries({ queryKey: queryKeys.kpis });
  };

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.updateWatchlistEntry(id, { active }),
    onSuccess: (entry) => {
      invalidate();
      toast.push({
        tone: entry.active ? 'warning' : 'info',
        title: `${formatPlate(entry.plate)} ${entry.active ? 'is now being watched' : 'removed from active watch'}`,
      });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.removeWatchlistEntry(id),
    onSuccess: () => {
      invalidate();
      toast.push({ tone: 'success', title: 'Watchlist entry deleted' });
      setPendingDelete(null);
    },
  });

  const create = useMutation({
    mutationFn: (entry: Omit<WatchlistEntry, 'id' | 'addedAt' | 'hitCount'>) =>
      api.addWatchlistEntry(entry),
    onSuccess: (entry) => {
      invalidate();
      toast.push({
        tone: 'success',
        title: `${formatPlate(entry.plate)} added to the watchlist`,
        detail: `${WATCHLIST_CATEGORY_LABEL[entry.category]} · ${entry.caseRef}`,
      });
      setAddOpen(false);
    },
    onError: (error) =>
      toast.push({
        tone: 'critical',
        title: 'Could not add entry',
        detail: error instanceof Error ? error.message : 'Unknown error',
      }),
  });

  const filtered = useMemo(() => {
    const query = normalisePlate(search);
    return (watchlist.data ?? [])
      .filter((entry) => {
        if (stateFilter === 'active' && !entry.active) return false;
        if (stateFilter === 'inactive' && entry.active) return false;
        if (categoryFilter !== 'all' && entry.category !== categoryFilter) return false;
        if (query) {
          return (
            entry.plate.includes(query) ||
            entry.caseRef.toUpperCase().includes(query) ||
            entry.reason.toUpperCase().includes(query)
          );
        }
        return true;
      })
      .sort(
        (a, b) =>
          SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
          b.addedAt.localeCompare(a.addedAt),
      );
  }, [watchlist.data, stateFilter, categoryFilter, search]);

  const stats = useMemo(() => {
    const rows = watchlist.data ?? [];
    const active = rows.filter((entry) => entry.active);
    return {
      total: rows.length,
      active: active.length,
      critical: active.filter((entry) => entry.severity === 'critical').length,
      hits: rows.reduce((sum, entry) => sum + entry.hitCount, 0),
      expiring: active.filter(
        (entry) =>
          entry.expiresAt && new Date(entry.expiresAt).getTime() - Date.now() < 7 * 864e5,
      ).length,
    };
  }, [watchlist.data]);

  const exportCsv = () => {
    downloadFile(
      `netra-watchlist-${Date.now()}.csv`,
      toCsv(
        [
          'Plate',
          'Category',
          'Severity',
          'Reason',
          'Case reference',
          'Added by',
          'Added at',
          'Expires',
          'Active',
          'Notify',
          'Hits',
        ],
        filtered.map((entry) => [
          entry.plate,
          WATCHLIST_CATEGORY_LABEL[entry.category],
          entry.severity,
          entry.reason,
          entry.caseRef,
          entry.addedBy,
          formatDateTime(entry.addedAt),
          entry.expiresAt ? formatDateTime(entry.expiresAt) : 'no expiry',
          entry.active ? 'yes' : 'no',
          entry.notify.join(' / '),
          entry.hitCount,
        ]),
      ),
    );
  };

  const columns = useMemo<Array<Column<WatchlistEntry>>>(
    () => [
      {
        id: 'plate',
        header: 'Registration',
        width: '9.5rem',
        sortValue: (row) => row.plate,
        cell: (row) => (
          <PlateChip plate={formatPlate(row.plate)} size="sm" flagged={row.active} />
        ),
      },
      {
        id: 'category',
        header: 'Category',
        width: '11rem',
        sortValue: (row) => row.category,
        cell: (row) => (
          <span className="flex items-center gap-1.5">
            <Badge tone={SEVERITY_TONE[row.severity]} dot>
              {row.severity}
            </Badge>
            <span className="truncate text-[11px] text-ink-muted">
              {WATCHLIST_CATEGORY_LABEL[row.category]}
            </span>
          </span>
        ),
      },
      {
        id: 'reason',
        header: 'Reason',
        sortValue: (row) => row.reason,
        cell: (row) => (
          <span className="block min-w-0">
            <span className="block truncate text-[11px] text-ink-muted">{row.reason}</span>
            <span className="block truncate font-mono text-[10px] text-ink-dim">{row.caseRef}</span>
          </span>
        ),
      },
      {
        id: 'hits',
        header: 'Hits',
        width: '4.5rem',
        align: 'right',
        sortValue: (row) => row.hitCount,
        cell: (row) => (
          <span className={cn('nums text-[11px]', row.hitCount > 0 ? 'text-warn' : 'text-ink-dim')}>
            {row.hitCount}
          </span>
        ),
      },
      {
        id: 'notify',
        header: 'Notify',
        width: '8rem',
        hideOnNarrow: true,
        cell: (row) => (
          <span className="flex flex-wrap gap-1">
            {row.notify.map((channel) => (
              <Badge key={channel} tone="neutral">
                {NOTIFY_LABEL[channel]}
              </Badge>
            ))}
          </span>
        ),
      },
      {
        id: 'added',
        header: 'Listed',
        width: '7.5rem',
        hideOnNarrow: true,
        sortValue: (row) => row.addedAt,
        cell: (row) => (
          <span className="block min-w-0">
            <span className="block text-[10.5px] text-ink-muted">{formatRelative(row.addedAt)}</span>
            <span className="block truncate text-[10px] text-ink-dim">{row.addedBy}</span>
          </span>
        ),
      },
      {
        id: 'expiry',
        header: 'Expiry',
        width: '6.5rem',
        hideOnNarrow: true,
        sortValue: (row) => row.expiresAt ?? '9999',
        cell: (row) => {
          if (!row.expiresAt) return <span className="text-[10.5px] text-ink-dim">none</span>;
          const days = Math.round((new Date(row.expiresAt).getTime() - Date.now()) / 864e5);
          return (
            <span
              className={cn(
                'nums text-[10.5px]',
                days < 0 ? 'text-danger' : days < 7 ? 'text-warn' : 'text-ink-dim',
              )}
            >
              {days < 0 ? 'expired' : `${days}d`}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        width: '11rem',
        align: 'right',
        cell: (row) => (
          <span className="flex items-center justify-end gap-1.5">
            <Link to={`/track?plate=${row.plate}`}>
              <Button size="xs" variant="ghost" icon={<RouteIcon className="size-3" />}>
                Track
              </Button>
            </Link>
            <Toggle
              checked={row.active}
              onChange={(active) => canManage && toggleActive.mutate({ id: row.id, active })}
              label={row.active ? 'Deactivate watch' : 'Activate watch'}
              hideLabel
            />
            {canManage && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setPendingDelete(row)}
                aria-label={`Delete watchlist entry for ${row.plate}`}
              >
                <Trash2 className="size-3 text-danger" />
              </Button>
            )}
          </span>
        ),
      },
    ],
    [canManage, toggleActive],
  );

  return (
    <PageFixed>
      <section className="grid shrink-0 grid-cols-2 gap-2.5 lg:grid-cols-5">
        {watchlist.isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[86px]" />)
        ) : (
          <>
            <Stat
              label="Active watches"
              value={stats.active}
              unit={`/ ${stats.total}`}
              icon={<ShieldAlert className="size-4" />}
              tone="danger"
            />
            <Stat label="Critical" value={stats.critical} icon={<ShieldAlert className="size-4" />} tone="critical" />
            <Stat label="Total hits" value={formatCount(stats.hits)} icon={<Bell className="size-4" />} tone="warn" />
            <Stat
              label="Expiring in 7 days"
              value={stats.expiring}
              icon={<Bell className="size-4" />}
              tone="warn"
              hint="review before lapse"
            />
            <Stat
              label="Inactive"
              value={stats.total - stats.active}
              icon={<ShieldAlert className="size-4" />}
              tone="neutral"
              hint="retained for audit"
            />
          </>
        )}
      </section>

      <PageToolbar>
        <Segmented
          value={stateFilter}
          onChange={setStateFilter}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'all', label: 'All' },
          ]}
        />

        <Select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value as 'all' | WatchlistCategory)}
          aria-label="Filter by category"
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {WATCHLIST_CATEGORY_LABEL[category]}
            </option>
          ))}
        </Select>

        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value.toUpperCase())}
          placeholder="Plate, case reference or reason…"
          aria-label="Search watchlist"
          className="w-60"
        />

        <div className="ml-auto flex items-center gap-1.5">
          {canExport && filtered.length > 0 && (
            <Button icon={<Download className="size-3.5" />} onClick={exportCsv}>
              Export
            </Button>
          )}
          <Button
            variant="primary"
            icon={<Plus className="size-3.5" />}
            onClick={() => setAddOpen(true)}
            disabled={!canManage}
            title={!canManage ? 'Requires Investigator role or above' : undefined}
          >
            Add registration
          </Button>
        </div>
      </PageToolbar>

      <Panel flush className="min-h-0 flex-1">
        <PanelHeader
          className="border-b border-line p-3"
          title="Watchlist register"
          subtitle={`${formatCount(filtered.length)} entr${filtered.length === 1 ? 'y' : 'ies'} · a live sighting of any active entry raises an alert within the pipeline latency budget`}
          icon={<ShieldAlert className="size-4" />}
        />

        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(row) => row.id}
          loading={watchlist.isLoading}
          dense
          rowAccent={(row) => (row.active ? SEVERITY_COLOR[row.severity] : undefined)}
          empty={
            <EmptyState
              icon={<ShieldAlert className="size-7" />}
              title="No entries match"
              description="Adjust the filters, or add a registration to begin monitoring it across the network."
              action={
                canManage ? (
                  <Button variant="primary" onClick={() => setAddOpen(true)}>
                    Add registration
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </Panel>

      <AddEntryDialog
        open={addOpen}
        busy={create.isPending}
        onClose={() => setAddOpen(false)}
        onSubmit={(entry) => create.mutate(entry)}
      />

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete watchlist entry"
        description="This removes the entry and stops alerting on the registration."
        width="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={remove.isPending}
              onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}
            >
              Delete entry
            </Button>
          </>
        }
      >
        {pendingDelete && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <PlateChip plate={formatPlate(pendingDelete.plate)} size="lg" flagged />
              <Badge tone={SEVERITY_TONE[pendingDelete.severity]}>{pendingDelete.severity}</Badge>
            </div>
            <p className="text-xs leading-relaxed text-ink-muted">{pendingDelete.reason}</p>
            <p className="text-[11px] text-ink-dim">
              Case {pendingDelete.caseRef} · listed by {pendingDelete.addedBy} ·{' '}
              {pendingDelete.hitCount} recorded hit{pendingDelete.hitCount === 1 ? '' : 's'}.
            </p>
            <p className="rounded-md bg-warn/10 p-2.5 text-[11px] leading-relaxed text-warn ring-1 ring-inset ring-warn/30">
              If the entry is still under an active case, deactivate it instead — that preserves the
              audit trail while stopping the alerts.
            </p>
          </div>
        )}
      </Modal>
    </PageFixed>
  );
}

// ---------------------------------------------------------------------------
// Add dialog
// ---------------------------------------------------------------------------

function AddEntryDialog({
  open,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (entry: Omit<WatchlistEntry, 'id' | 'addedAt' | 'hitCount'>) => void;
}) {
  const [plate, setPlate] = useState('');
  const [category, setCategory] = useState<WatchlistCategory>('stolen');
  const [severity, setSeverity] = useState<Severity>('high');
  const [reason, setReason] = useState('');
  const [caseRef, setCaseRef] = useState('');
  const [expiryDays, setExpiryDays] = useState('90');
  const [notify, setNotify] = useState<Array<(typeof NOTIFY_CHANNELS)[number]>>(['control_room']);

  const normalised = normalisePlate(plate);
  // A plate must look like a real registration, and a watch must cite a case.
  const plateValid = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/.test(normalised);
  const valid = plateValid && reason.trim().length >= 8 && caseRef.trim().length >= 3;

  const submit = () => {
    if (!valid) return;
    onSubmit({
      plate: normalised,
      category,
      severity,
      reason: reason.trim(),
      caseRef: caseRef.trim().toUpperCase(),
      addedBy: 'You (Control Room)',
      expiresAt:
        expiryDays === 'never'
          ? null
          : new Date(Date.now() + Number(expiryDays) * 864e5).toISOString(),
      active: true,
      notify,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add registration to watchlist"
      description="Every entry is attributable and, by default, time-limited."
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} disabled={!valid} onClick={submit}>
            Add to watchlist
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div>
          <FieldLabel className="mb-1.5">Registration number</FieldLabel>
          <Input
            value={plate}
            onChange={(event) => setPlate(event.target.value.toUpperCase())}
            placeholder="MH12AB1234"
            className="font-mono tracking-wider"
            aria-invalid={plate.length > 0 && !plateValid}
          />
          {plate.length > 0 && !plateValid && (
            <p className="mt-1 text-[10.5px] text-danger">
              Expected format: two-letter state, RTO code, series letters, then up to four digits.
            </p>
          )}
          {plateValid && (
            <p className="mt-1 flex items-center gap-1.5 text-[10.5px] text-ink-dim">
              Will be stored as
              <PlateChip plate={formatPlate(normalised)} size="sm" />
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel className="mb-1.5">Category</FieldLabel>
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value as WatchlistCategory)}
              className="w-full"
            >
              {CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {WATCHLIST_CATEGORY_LABEL[option]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel className="mb-1.5">Severity</FieldLabel>
            <Select
              value={severity}
              onChange={(event) => setSeverity(event.target.value as Severity)}
              className="w-full"
            >
              {SEVERITIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <FieldLabel className="mb-1.5">Reason for listing</FieldLabel>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            placeholder="Why is this vehicle being monitored? This text appears on every alert raised."
          />
          {reason.length > 0 && reason.trim().length < 8 && (
            <p className="mt-1 text-[10.5px] text-danger">Give a substantive reason.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel className="mb-1.5">Case reference</FieldLabel>
            <Input
              value={caseRef}
              onChange={(event) => setCaseRef(event.target.value.toUpperCase())}
              placeholder="FIR/214/2026"
              className="font-mono"
            />
          </div>
          <div>
            <FieldLabel className="mb-1.5">Auto-expire after</FieldLabel>
            <Select
              value={expiryDays}
              onChange={(event) => setExpiryDays(event.target.value)}
              className="w-full"
            >
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="never">No expiry</option>
            </Select>
          </div>
        </div>

        <div>
          <FieldLabel className="mb-1.5">Notify on hit</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {NOTIFY_CHANNELS.map((channel) => {
              const selected = notify.includes(channel);
              return (
                <button
                  key={channel}
                  type="button"
                  onClick={() =>
                    setNotify((current) =>
                      selected ? current.filter((c) => c !== channel) : [...current, channel],
                    )
                  }
                  aria-pressed={selected}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition-colors',
                    selected
                      ? 'bg-brand/15 text-brand ring-brand/40'
                      : 'text-ink-dim ring-line hover:text-ink-muted',
                  )}
                >
                  {NOTIFY_LABEL[channel]}
                </button>
              );
            })}
          </div>
        </div>

        {expiryDays === 'never' && (
          <p className="rounded-md bg-warn/10 p-2.5 text-[11px] leading-relaxed text-warn ring-1 ring-inset ring-warn/30">
            An entry with no expiry will keep generating alerts indefinitely. Prefer a bounded window
            and renew it while the case remains open.
          </p>
        )}
      </div>
    </Modal>
  );
}
