import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn, Skeleton } from './primitives';

/**
 * Compact sortable table.
 *
 * Deliberately not a virtualised grid: every table in this app is capped at a
 * few hundred rows by its query, and keeping real DOM rows means Ctrl+F and
 * screen readers work normally.
 */

export interface Column<T> {
  id: string;
  header: ReactNode;
  /** Cell renderer. */
  cell: (row: T, index: number) => ReactNode;
  /** Return a comparable value to make the column sortable. */
  sortValue?: (row: T) => string | number;
  width?: string;
  align?: 'left' | 'right' | 'center';
  /** Hides the column below the lg breakpoint. */
  hideOnNarrow?: boolean;
}

interface DataTableProps<T> {
  rows: T[];
  columns: Array<Column<T>>;
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  /** Marks a row as selected. */
  isRowActive?: (row: T) => boolean;
  /** Optional accent stripe on the left edge of a row. */
  rowAccent?: (row: T) => string | undefined;
  loading?: boolean;
  skeletonRows?: number;
  empty?: ReactNode;
  className?: string;
  /** Column id to sort by initially. */
  defaultSort?: { columnId: string; direction: 'asc' | 'desc' };
  /** Keeps the header visible while the body scrolls. */
  stickyHeader?: boolean;
  dense?: boolean;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  isRowActive,
  rowAccent,
  loading,
  skeletonRows = 8,
  empty,
  className,
  defaultSort,
  stickyHeader = true,
  dense,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.id === sort.columnId);
    if (!column?.sortValue) return rows;

    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
      return String(left).localeCompare(String(right)) * factor;
    });
  }, [rows, columns, sort]);

  const toggleSort = (columnId: string) => {
    setSort((current) => {
      if (current?.columnId !== columnId) return { columnId, direction: 'desc' };
      if (current.direction === 'desc') return { columnId, direction: 'asc' };
      return null;
    });
  };

  const cellPadding = dense ? 'px-2.5 py-1.5' : 'px-3 py-2';

  if (loading) {
    return (
      <div className={cn('flex flex-col gap-1.5 p-3', className)}>
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <Skeleton key={i} className="h-7" />
        ))}
      </div>
    );
  }

  if (sorted.length === 0 && empty) {
    return <div className={cn('flex flex-1', className)}>{empty}</div>;
  }

  return (
    <div className={cn('min-w-0 flex-1 overflow-auto', className)}>
      <table className="w-full border-collapse text-left">
        <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
          <tr className="bg-surface-2">
            {columns.map((column) => {
              const sortable = Boolean(column.sortValue);
              const active = sort?.columnId === column.id;
              return (
                <th
                  key={column.id}
                  scope="col"
                  style={{ width: column.width }}
                  className={cn(
                    'border-b border-line px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-dim',
                    column.align === 'right' && 'text-right',
                    column.align === 'center' && 'text-center',
                    column.hideOnNarrow && 'hidden lg:table-cell',
                  )}
                  aria-sort={active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.id)}
                      className={cn(
                        'inline-flex items-center gap-1 transition-colors hover:text-ink',
                        active && 'text-brand',
                        column.align === 'right' && 'flex-row-reverse',
                      )}
                    >
                      {column.header}
                      {active &&
                        (sort!.direction === 'asc' ? (
                          <ChevronUp className="size-3" />
                        ) : (
                          <ChevronDown className="size-3" />
                        ))}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => {
            const accent = rowAccent?.(row);
            const active = isRowActive?.(row);
            return (
              <tr
                key={rowKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                className={cn(
                  'border-b border-line/60 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-surface-2',
                  active && 'bg-brand/8',
                )}
              >
                {columns.map((column, columnIndex) => (
                  <td
                    key={column.id}
                    className={cn(
                      cellPadding,
                      'text-xs text-ink-muted align-middle',
                      column.align === 'right' && 'text-right',
                      column.align === 'center' && 'text-center',
                      column.hideOnNarrow && 'hidden lg:table-cell',
                      columnIndex === 0 && 'relative',
                    )}
                  >
                    {columnIndex === 0 && accent && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 w-0.5"
                        style={{ backgroundColor: accent }}
                      />
                    )}
                    {column.cell(row, index)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
