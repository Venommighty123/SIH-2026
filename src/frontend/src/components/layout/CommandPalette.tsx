import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Cctv, CornerDownLeft, Search, ShieldAlert } from 'lucide-react';
import { api, queryKeys } from '@/api';
import { Badge, cn, PlateChip, Spinner } from '@/components/ui/primitives';
import { formatPlate, normalisePlate } from '@/mock/vehicles';
import { formatRelative } from '@/lib/format';
import { useAppStore } from '@/store/useAppStore';
import { NAV_ITEMS } from './navigation';

/**
 * Command palette.
 *
 * The primary entry point for the trajectory workflow: an operator receives a
 * plate over the radio, hits Ctrl+K, types it, and lands on the reconstructed
 * route. Plate suggestions come from the OCR-aware fuzzy matcher, so a partially
 * misheard registration still resolves.
 */

type Row =
  | { kind: 'page'; id: string; label: string; description: string; to: string; icon: typeof Cctv }
  | { kind: 'plate'; id: string; plate: string; sightings: number; lastSeen: string; flagged: boolean; explanation: string[] }
  | { kind: 'camera'; id: string; cameraId: string; label: string; code: string; location: string };

const DEBOUNCE_MS = 160;

export function CommandPalette() {
  const open = useAppStore((state) => state.commandPaletteOpen);
  const setOpen = useAppStore((state) => state.setCommandPaletteOpen);
  const recentPlates = useAppStore((state) => state.recentPlates);
  const pushRecentPlate = useAppStore((state) => state.pushRecentPlate);
  const setSelectedCameraId = useAppStore((state) => state.setSelectedCameraId);

  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [rawQuery, setRawQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [cursor, setCursor] = useState(0);

  // --- Global shortcut ---------------------------------------------------
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
        return;
      }
      // "/" is the muscle memory for search, but not while typing in a field.
      const target = event.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (event.key === '/' && !typing) {
        event.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setOpen]);

  useEffect(() => {
    if (open) {
      setRawQuery('');
      setDebounced('');
      setCursor(0);
      // Focus after the element is actually painted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(rawQuery.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  // --- Data --------------------------------------------------------------
  const looksLikePlate = /[0-9]/.test(debounced) || /^[A-Za-z]{2}\s*\d/.test(debounced);

  const { data: plateMatches = [], isFetching } = useQuery({
    queryKey: queryKeys.plateSuggest(normalisePlate(debounced)),
    queryFn: () => api.suggestPlates(debounced, 8),
    enabled: open && looksLikePlate && normalisePlate(debounced).length >= 2,
    staleTime: 30_000,
  });

  const { data: cameras = [] } = useQuery({
    queryKey: queryKeys.cameras,
    queryFn: () => api.getCameras(),
    enabled: open,
    staleTime: 60_000,
  });

  // --- Row assembly ------------------------------------------------------
  const rows = useMemo<Row[]>(() => {
    const query = debounced.toLowerCase();
    const result: Row[] = [];

    for (const match of plateMatches) {
      result.push({
        kind: 'plate',
        id: `plate:${match.plate}`,
        plate: match.plate,
        sightings: match.sightings,
        lastSeen: match.lastSeen,
        flagged: match.isBlacklisted,
        explanation: match.explanation,
      });
    }

    if (query.length === 0) {
      for (const plate of recentPlates.slice(0, 4)) {
        result.push({
          kind: 'plate',
          id: `recent:${plate}`,
          plate,
          sightings: 0,
          lastSeen: '',
          flagged: false,
          explanation: [],
        });
      }
    }

    const pages = NAV_ITEMS.filter(
      (item) =>
        query.length === 0 ||
        item.label.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query),
    ).slice(0, query.length === 0 ? 5 : 6);

    for (const page of pages) {
      result.push({
        kind: 'page',
        id: `page:${page.to}`,
        label: page.label,
        description: page.description,
        to: page.to,
        icon: page.icon,
      });
    }

    if (query.length >= 2) {
      const cameraMatches = cameras
        .filter(
          (camera) =>
            camera.name.toLowerCase().includes(query) ||
            camera.code.toLowerCase().includes(query) ||
            camera.location.toLowerCase().includes(query),
        )
        .slice(0, 5);

      for (const camera of cameraMatches) {
        result.push({
          kind: 'camera',
          id: `camera:${camera.id}`,
          cameraId: camera.id,
          label: camera.name,
          code: camera.code,
          location: camera.location,
        });
      }
    }

    return result;
  }, [plateMatches, cameras, debounced, recentPlates]);

  useEffect(() => {
    setCursor((current) => Math.min(current, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const commit = (row: Row) => {
    setOpen(false);

    if (row.kind === 'plate') {
      pushRecentPlate(row.plate);
      navigate(`/track?plate=${row.plate}`);
      return;
    }
    if (row.kind === 'page') {
      navigate(row.to);
      return;
    }
    setSelectedCameraId(row.cameraId);
    navigate('/cameras');
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((current) => (rows.length === 0 ? 0 : (current + 1) % rows.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((current) => (rows.length === 0 ? 0 : (current - 1 + rows.length) % rows.length));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      // Enter on a plate-shaped query with no match still opens the tracker, so
      // the operator sees an explicit "no sightings" answer rather than nothing.
      if (rows.length === 0 && looksLikePlate) {
        const plate = normalisePlate(rawQuery);
        if (plate.length >= 4) {
          setOpen(false);
          navigate(`/track?plate=${plate}`);
        }
        return;
      }
      const row = rows[cursor];
      if (row) commit(row);
    }
  };

  if (!open) return null;

  let lastKind: Row['kind'] | null = null;

  return (
    <div
      className="fixed inset-0 z-90 flex items-start justify-center bg-surface-0/70 px-4 pt-[12vh] backdrop-blur-sm"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="flex max-h-[68vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-surface-1 shadow-2xl ring-1 ring-line-strong"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-3.5">
          <Search className="size-4 shrink-0 text-ink-dim" />
          <input
            ref={inputRef}
            value={rawQuery}
            onChange={(event) => setRawQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Plate (MH12AB1234 · wildcards MH12??1234), camera or page…"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-dim"
          />
          {isFetching && <Spinner className="size-4 shrink-0 text-ink-dim" />}
        </div>

        <ul
          ref={listRef}
          id="palette-results"
          role="listbox"
          className="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          {rows.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-ink-dim">
              {looksLikePlate
                ? 'No matching registration in the read archive. Press Enter to open the tracker anyway.'
                : 'Type a plate, camera name or page.'}
            </li>
          )}

          {rows.map((row, index) => {
            const active = index === cursor;
            const showHeader = row.kind !== lastKind;
            lastKind = row.kind;

            return (
              <li key={row.id}>
                {showHeader && (
                  <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-dim/70">
                    {row.kind === 'plate' ? 'Registrations' : row.kind === 'page' ? 'Go to' : 'Cameras'}
                  </p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-active={active}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => commit(row)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                    active ? 'bg-brand/12' : 'hover:bg-surface-2',
                  )}
                >
                  {row.kind === 'plate' && (
                    <>
                      {row.flagged ? (
                        <ShieldAlert className="size-4 shrink-0 text-critical" />
                      ) : (
                        <Search className="size-4 shrink-0 text-ink-dim" />
                      )}
                      <PlateChip plate={formatPlate(row.plate)} flagged={row.flagged} />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-ink-dim">
                        {row.sightings > 0
                          ? `${row.sightings} sighting${row.sightings === 1 ? '' : 's'} · last ${formatRelative(row.lastSeen)}`
                          : 'Recently viewed'}
                        {row.explanation.length > 0 && ` · fuzzy: ${row.explanation.join(', ')}`}
                      </span>
                      {row.flagged && <Badge tone="critical">Watchlist</Badge>}
                    </>
                  )}

                  {row.kind === 'page' && (
                    <>
                      <row.icon className="size-4 shrink-0 text-ink-dim" />
                      <span className="shrink-0 text-xs font-medium text-ink">{row.label}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-ink-dim">
                        {row.description}
                      </span>
                    </>
                  )}

                  {row.kind === 'camera' && (
                    <>
                      <Cctv className="size-4 shrink-0 text-ink-dim" />
                      <span className="shrink-0 text-xs font-medium text-ink">{row.label}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-ink-dim">
                        {row.code} · {row.location}
                      </span>
                    </>
                  )}

                  {active && <CornerDownLeft className="size-3.5 shrink-0 text-brand" />}
                </button>
              </li>
            );
          })}
        </ul>

        <footer className="flex items-center gap-3 border-t border-line px-3 py-2 text-[10px] text-ink-dim">
          <Hint keys="↑ ↓">navigate</Hint>
          <Hint keys="↵">open</Hint>
          <Hint keys="esc">close</Hint>
          <span className="ml-auto">Fuzzy matching tolerates OCR confusions (0/O, 1/I, 8/B)</span>
        </footer>
      </div>
    </div>
  );
}

function Hint({ keys, children }: { keys: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="rounded bg-surface-2 px-1.5 py-0.5 font-mono ring-1 ring-inset ring-line">{keys}</kbd>
      {children}
    </span>
  );
}
