import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn, IconButton } from './primitives';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
}

const WIDTHS = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * Dialog built on the native `<dialog>` element so focus trapping, the top
 * layer and Escape handling come from the platform rather than a hand-rolled
 * focus manager.
 */
export function Modal({ open, onClose, title, description, children, footer, width = 'md' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // `cancel` fires on Escape; route it through the caller so state stays in sync.
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      // Clicking the backdrop closes; clicks inside the panel are stopped below.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        'w-[calc(100vw-2rem)] rounded-xl bg-surface-1 p-0 text-ink shadow-2xl ring-1 ring-line-strong',
        'backdrop:bg-surface-0/75 backdrop:backdrop-blur-sm',
        'open:animate-fade-in',
        WIDTHS[width],
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
              {description && <p className="mt-0.5 text-xs text-ink-dim">{description}</p>}
            </div>
            <IconButton label="Close dialog" onClick={onClose} className="-mr-1.5 -mt-1">
              <X className="size-4" />
            </IconButton>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

          {footer && (
            <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}
