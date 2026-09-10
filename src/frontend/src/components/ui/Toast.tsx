import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from 'lucide-react';
import { cn, IconButton } from './primitives';

type ToastTone = 'info' | 'success' | 'warning' | 'critical';

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
  /** Optional click-through, used by watchlist-hit toasts to open the case. */
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  push: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLE: Record<ToastTone, { ring: string; icon: ReactNode }> = {
  info: { ring: 'ring-info/40', icon: <Info className="size-4 text-info" /> },
  success: { ring: 'ring-ok/40', icon: <CheckCircle2 className="size-4 text-ok" /> },
  warning: { ring: 'ring-warn/40', icon: <AlertTriangle className="size-4 text-warn" /> },
  critical: { ring: 'ring-critical/50', icon: <ShieldAlert className="size-4 text-critical" /> },
};

/** Critical alerts linger; routine confirmations disappear quickly. */
const TTL: Record<ToastTone, number> = {
  info: 4000,
  success: 3200,
  warning: 6000,
  critical: 9000,
};

const MAX_VISIBLE = 4;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current++;
      // Cap the stack so a burst of live alerts cannot bury the whole screen.
      setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { ...toast, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TTL[toast.tone]),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-100 flex w-[22rem] flex-col gap-2"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            aria-live={toast.tone === 'critical' ? 'assertive' : 'polite'}
            className={cn(
              'pointer-events-auto animate-slide-in rounded-lg bg-surface-2 p-3 shadow-xl ring-1',
              TONE_STYLE[toast.tone].ring,
            )}
          >
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0">{TONE_STYLE[toast.tone].icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink">{toast.title}</p>
                {toast.detail && (
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-dim">{toast.detail}</p>
                )}
                {toast.action && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.action!.onClick();
                      dismiss(toast.id);
                    }}
                    className="mt-1.5 text-[11px] font-semibold text-brand hover:underline"
                  >
                    {toast.action.label} →
                  </button>
                )}
              </div>
              <IconButton
                label="Dismiss notification"
                onClick={() => dismiss(toast.id)}
                className="-mr-1 -mt-1 size-6"
              >
                <X className="size-3.5" />
              </IconButton>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
