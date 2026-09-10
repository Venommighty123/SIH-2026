import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BellOff, BellRing, Pause, Play, Search, Wifi, WifiOff } from 'lucide-react';
import { DATA_MODE } from '@/api';
import { Badge, Button, cn, IconButton, Segmented } from '@/components/ui/primitives';
import { useLiveFeed } from '@/providers/LiveFeedProvider';
import {
  RANGE_LABEL,
  ROLE_LABEL,
  useAppStore,
  type OperatorRole,
  type RangePreset,
} from '@/store/useAppStore';
import { NAV_ITEMS } from './navigation';

const RANGE_OPTIONS: RangePreset[] = ['15m', '1h', '6h', '24h'];
const ROLE_OPTIONS: OperatorRole[] = ['viewer', 'operator', 'investigator', 'administrator'];

export function Topbar() {
  const location = useLocation();
  const active = NAV_ITEMS.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
  );

  const range = useAppStore((state) => state.range);
  const setRange = useAppStore((state) => state.setRange);
  const livePaused = useAppStore((state) => state.livePaused);
  const toggleLivePaused = useAppStore((state) => state.toggleLivePaused);
  const muteAlertToasts = useAppStore((state) => state.muteAlertToasts);
  const setMuteAlertToasts = useAppStore((state) => state.setMuteAlertToasts);
  const role = useAppStore((state) => state.role);
  const setRole = useAppStore((state) => state.setRole);
  const setCommandPaletteOpen = useAppStore((state) => state.setCommandPaletteOpen);

  const { connected, ratePerMinute } = useLiveFeed();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface-1 px-4">
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold tracking-tight text-ink">
          {active?.label ?? 'RAASTA'}
        </h1>
        <p className="hidden truncate text-[11px] text-ink-dim lg:block">
          {active?.description ?? 'City-wide ANPR intelligence'}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        className={cn(
          'ml-auto flex h-8 w-56 items-center gap-2 rounded-md bg-surface-0 px-2.5 text-xs',
          'text-ink-dim ring-1 ring-inset ring-line transition-colors hover:ring-line-strong xl:w-72',
        )}
      >
        <Search className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">Search plate, camera or page…</span>
        <kbd className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-dim ring-1 ring-inset ring-line">
          Ctrl K
        </kbd>
      </button>

      <div className="hidden items-center gap-2 md:flex">
        <Segmented
          value={range}
          onChange={setRange}
          size="xs"
          options={RANGE_OPTIONS.map((preset) => ({
            value: preset,
            label: preset,
            title: RANGE_LABEL[preset],
          }))}
        />
      </div>

      <div className="flex items-center gap-1.5 border-l border-line pl-3">
        <LiveIndicator connected={connected} paused={livePaused} ratePerMinute={ratePerMinute} />

        <IconButton
          label={livePaused ? 'Resume live feed' : 'Pause live feed'}
          onClick={toggleLivePaused}
          className={livePaused ? 'text-warn' : undefined}
        >
          {livePaused ? <Play className="size-4" /> : <Pause className="size-4" />}
        </IconButton>

        <IconButton
          label={muteAlertToasts ? 'Unmute alert pop-ups' : 'Mute alert pop-ups'}
          onClick={() => setMuteAlertToasts(!muteAlertToasts)}
          className={muteAlertToasts ? 'text-ink-dim' : 'text-brand'}
        >
          {muteAlertToasts ? <BellOff className="size-4" /> : <BellRing className="size-4" />}
        </IconButton>
      </div>

      <div className="hidden items-center gap-2 border-l border-line pl-3 lg:flex">
        {DATA_MODE === 'mock' && (
          <Badge tone="violet" title="UI is running against the built-in simulator">
            SIM
          </Badge>
        )}
        <label className="sr-only" htmlFor="role-select">
          Operator role
        </label>
        <select
          id="role-select"
          value={role}
          onChange={(event) => setRole(event.target.value as OperatorRole)}
          className="h-8 rounded-md bg-surface-0 px-2 pr-6 text-xs text-ink-muted ring-1 ring-inset ring-line focus:ring-brand"
          title="Switch role to see how permissions gate actions"
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {ROLE_LABEL[option]}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}

function LiveIndicator({
  connected,
  paused,
  ratePerMinute,
}: {
  connected: boolean;
  paused: boolean;
  ratePerMinute: number;
}) {
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2.5 pr-1">
      <span className="relative flex size-2 items-center justify-center" aria-hidden="true">
        {connected && !paused && (
          <span className="absolute size-2 animate-pulse-ring rounded-full bg-ok" />
        )}
        <span
          className={cn(
            'relative size-2 rounded-full',
            !connected ? 'bg-danger' : paused ? 'bg-warn' : 'bg-ok',
          )}
        />
      </span>

      <div className="hidden leading-tight sm:block">
        <p className="text-[11px] font-medium text-ink">
          {!connected ? 'Disconnected' : paused ? 'Feed paused' : 'Live'}
        </p>
        <p className="nums text-[10px] text-ink-dim">
          {connected && !paused ? `${ratePerMinute} reads/min` : '—'}
        </p>
      </div>

      <span className="nums hidden font-mono text-xs text-ink-muted xl:block">
        {clock.toLocaleTimeString('en-GB', { hour12: false })}
      </span>

      <span className="sr-only" role="status">
        {connected ? 'Realtime feed connected' : 'Realtime feed disconnected'}
      </span>

      {!connected && <WifiOff className="size-3.5 text-danger" aria-hidden="true" />}
      {connected && <Wifi className="hidden size-3.5 text-ok/60 2xl:block" aria-hidden="true" />}
    </div>
  );
}

/** Re-exported so pages can render a consistent "no permission" hint. */
export function PermissionHint({ children }: { children: React.ReactNode }) {
  return (
    <Button variant="ghost" size="xs" disabled title="Your role does not permit this action">
      {children}
    </Button>
  );
}
