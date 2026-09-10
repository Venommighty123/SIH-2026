import type { ReactNode } from 'react';
import { cn } from '@/components/ui/primitives';

/**
 * Two page shapes, used consistently:
 *
 * `PageScroll` for dashboards that grow vertically past the viewport.
 * `PageFixed` for map- and table-driven screens that must fill the viewport
 * exactly and manage their own internal scroll regions.
 */

export function PageScroll({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('h-full overflow-y-auto', className)}>
      <div className="flex flex-col gap-3 p-3 xl:p-4">{children}</div>
    </div>
  );
}

export function PageFixed({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3 xl:p-4', className)}>
      {children}
    </div>
  );
}

/** Toolbar row that sits above the content of a fixed page. */
export function PageToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex shrink-0 flex-wrap items-center gap-2', className)}>{children}</div>
  );
}
