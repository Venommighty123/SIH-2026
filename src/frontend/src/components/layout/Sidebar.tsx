import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { api, DATA_MODE, queryKeys } from '@/api';
import { Badge, cn, IconButton } from '@/components/ui/primitives';
import { useAppStore } from '@/store/useAppStore';
import { NAV_GROUPS, NAV_ITEMS } from './navigation';

export function Sidebar() {
  const collapsed = useAppStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);

  // Badge count for the alerts nav item.
  const { data: openAlerts = 0 } = useQuery({
    queryKey: queryKeys.alerts('open-count'),
    queryFn: async () => {
      const rows = await api.getAlerts({ status: ['new', 'acknowledged'], limit: 500 });
      return rows.length;
    },
    refetchInterval: 20_000,
  });

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-line bg-surface-1 transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-58',
      )}
    >
      <div className={cn('flex h-14 items-center gap-2.5 border-b border-line px-3', collapsed && 'justify-center px-0')}>
        <BrandMark />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold tracking-tight text-ink">RAASTA</p>
            <p className="truncate text-[10px] leading-tight text-ink-dim">City ANPR Command</p>
          </div>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => {
          const items = NAV_ITEMS.filter((item) => item.group === group);
          if (items.length === 0) return null;

          return (
            <div key={group} className="mb-4 last:mb-0">
              {!collapsed && (
                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-dim/70">
                  {group}
                </p>
              )}
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const badgeCount = item.badge === 'alerts' ? openAlerts : 0;

                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/'}
                        title={collapsed ? item.label : undefined}
                        className={({ isActive }) =>
                          cn(
                            'group relative flex items-center gap-2.5 rounded-md px-2 py-2 text-xs font-medium transition-colors',
                            collapsed && 'justify-center px-0',
                            isActive
                              ? 'bg-brand/12 text-brand'
                              : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand" />
                            )}
                            <Icon className="size-4 shrink-0" />
                            {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                            {badgeCount > 0 &&
                              (collapsed ? (
                                <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-danger" />
                              ) : (
                                <Badge tone="danger" className="shrink-0">
                                  {badgeCount > 99 ? '99+' : badgeCount}
                                </Badge>
                              ))}
                          </>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className={cn('flex items-center gap-2 border-t border-line p-2', collapsed && 'justify-center')}>
        <IconButton
          label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          onClick={toggleSidebar}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </IconButton>
        {!collapsed && (
          <span className="truncate text-[10px] text-ink-dim">
            {DATA_MODE === 'mock' ? 'Simulator dataset' : 'Live backend'}
          </span>
        )}
      </div>
    </aside>
  );
}

function BrandMark() {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/12 ring-1 ring-inset ring-brand/30">
      <svg viewBox="0 0 24 24" className="size-4.5 text-brand" fill="none" aria-hidden="true">
        <path
          d="M12 4.6c3.9 0 6.9 2.7 8 6.2.15.4.15.8 0 1.2-1.1 3.5-4.1 6.2-8 6.2s-6.9-2.7-8-6.2a2 2 0 0 1 0-1.2c1.1-3.5 4.1-6.2 8-6.2Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <circle cx="12" cy="11.4" r="2.6" fill="currentColor" />
      </svg>
    </span>
  );
}
