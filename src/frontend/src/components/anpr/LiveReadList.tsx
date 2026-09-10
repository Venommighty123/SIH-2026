import { ShieldAlert } from 'lucide-react';
import type { Camera, Detection } from '@/types';
import { formatPlate } from '@/mock/vehicles';
import { formatTime } from '@/lib/format';
import { cn, EmptyState, PlateChip, Skeleton } from '@/components/ui/primitives';

interface LiveReadListProps {
  detections: Detection[];
  camerasById: Map<string, Camera>;
  /** Plates on an active watchlist, highlighted inline. */
  flaggedPlates?: Set<string>;
  onSelect?: (detection: Detection) => void;
  selectedId?: string | null;
  loading?: boolean;
  className?: string;
  /** Hides the camera column when the list is already scoped to one node. */
  hideCamera?: boolean;
}

/**
 * The live read ticker.
 *
 * Simplified: shows timestamp, plate, and camera name only.
 */
export function LiveReadList({
  detections,
  camerasById,
  flaggedPlates,
  onSelect,
  selectedId,
  loading,
  className,
  hideCamera,
}: LiveReadListProps) {
  if (loading) {
    return (
      <div className={cn('flex flex-col gap-1 p-2', className)}>
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    );
  }

  if (detections.length === 0) {
    return (
      <EmptyState
        title="No reads yet"
        description="Reads appear here the moment a plate is recognised at any node on the network."
        className={className}
      />
    );
  }

  return (
    <ul className={cn('flex min-h-0 flex-col overflow-y-auto', className)}>
      {detections.map((detection) => {
        const camera = camerasById.get(detection.cameraId);
        const flagged = flaggedPlates?.has(detection.plate) ?? false;
        const selected = detection.id === selectedId;

        return (
          <li key={detection.id}>
            <button
              type="button"
              onClick={() => onSelect?.(detection)}
              disabled={!onSelect}
              className={cn(
                'flex w-full items-center gap-2.5 border-b border-line/50 px-3 py-1.5 text-left transition-colors',
                onSelect && 'hover:bg-surface-2',
                selected && 'bg-brand/10',
                flagged && 'bg-critical/8',
              )}
            >
              <span className="nums shrink-0 font-mono text-[11px] text-ink-dim">
                {formatTime(detection.timestamp)}
              </span>

              {flagged && <ShieldAlert className="size-3.5 shrink-0 text-critical" />}

              <PlateChip plate={formatPlate(detection.plate)} flagged={flagged} size="sm" />

              {!hideCamera && (
                <span className="min-w-0 flex-1 truncate text-[11px] text-ink-muted">
                  {camera?.name ?? detection.cameraId}
                </span>
              )}

              {hideCamera && (
                <span className="min-w-0 flex-1 truncate text-[11px] text-ink-dim">
                  {camera?.location ?? ''}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
