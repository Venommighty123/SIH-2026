import clsx, { type ClassValue } from 'clsx';
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

// ---------------------------------------------------------------------------
// Panel / card
// ---------------------------------------------------------------------------

interface PanelProps extends ComponentPropsWithoutRef<'section'> {
  /** Removes internal padding when the panel hosts a table or a map. */
  flush?: boolean;
}

export function Panel({ className, flush, children, ...rest }: PanelProps) {
  return (
    <section
      className={cn(
        'panel flex min-w-0 flex-col overflow-hidden',
        !flush && 'p-4',
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

interface PanelHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PanelHeader({ title, subtitle, icon, actions, className }: PanelHeaderProps) {
  return (
    <header className={cn('flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 shrink-0 text-brand">{icon}</span>}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-ink-dim">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  );
}

/** Small uppercase label used above dense groups of figures. */
export function FieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'block text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-dim',
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

type BadgeTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'critical' | 'info' | 'violet';

/** Static map — Tailwind cannot see dynamically interpolated class names. */
const TONE_TEXT: Record<BadgeTone, string> = {
  neutral: 'text-ink-dim',
  brand: 'text-brand',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  critical: 'text-critical',
  info: 'text-info',
  violet: 'text-violet',
};

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-3 text-ink-muted ring-line-strong',
  brand: 'bg-brand/12 text-brand ring-brand/35',
  ok: 'bg-ok/12 text-ok ring-ok/35',
  warn: 'bg-warn/12 text-warn ring-warn/35',
  danger: 'bg-danger/14 text-danger ring-danger/40',
  critical: 'bg-critical/18 text-critical ring-critical/45',
  info: 'bg-info/12 text-info ring-info/35',
  violet: 'bg-violet/12 text-violet ring-violet/35',
};

interface BadgeProps extends ComponentPropsWithoutRef<'span'> {
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  dot?: boolean;
}

export function Badge({ tone = 'neutral', size = 'sm', dot, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        BADGE_TONES[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-surface-0 hover:bg-brand-strong font-semibold',
  secondary: 'bg-surface-3 text-ink hover:bg-line ring-1 ring-inset ring-line-strong',
  outline: 'bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink ring-1 ring-inset ring-line',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25 ring-1 ring-inset ring-danger/40',
};

interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: ButtonVariant;
  size?: 'xs' | 'sm' | 'md';
  icon?: ReactNode;
  /** Renders a spinner and blocks interaction. */
  busy?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'sm',
  icon,
  busy,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md transition-colors',
        'disabled:pointer-events-none disabled:opacity-45',
        size === 'xs' && 'h-6 px-2 text-[11px]',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'md' && 'h-9.5 px-4 text-sm',
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {busy ? <Spinner className="size-3.5" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  ...rest
}: ComponentPropsWithoutRef<'button'> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-md text-ink-dim transition-colors',
        'hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
      {...rest}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export function Input({ className, ...rest }: ComponentPropsWithoutRef<'input'>) {
  return (
    <input
      className={cn(
        'h-8 w-full rounded-md bg-surface-0 px-2.5 text-xs text-ink ring-1 ring-inset ring-line',
        'placeholder:text-ink-dim focus:ring-brand',
        className,
      )}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }: ComponentPropsWithoutRef<'select'>) {
  return (
    <select
      className={cn(
        'h-8 rounded-md bg-surface-0 px-2 pr-7 text-xs text-ink ring-1 ring-inset ring-line',
        'focus:ring-brand',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: ComponentPropsWithoutRef<'textarea'>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-md bg-surface-0 p-2.5 text-xs leading-relaxed text-ink ring-1 ring-inset ring-line',
        'placeholder:text-ink-dim focus:ring-brand',
        className,
      )}
      {...rest}
    />
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** Hides the visible text label but keeps it for assistive technology. */
  hideLabel?: boolean;
}

export function Toggle({ checked, onChange, label, hideLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={hideLabel ? label : undefined}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-xs text-ink-muted"
    >
      <span
        className={cn(
          'relative h-4 w-7 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand' : 'bg-surface-3 ring-1 ring-inset ring-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-3 rounded-full bg-surface-0 transition-transform',
            checked ? 'translate-x-3.5' : 'translate-x-0.5',
          )}
        />
      </span>
      {!hideLabel && label}
    </button>
  );
}

/** Segmented control for small mutually exclusive choices. */
interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  onChange: (value: T) => void;
  className?: string;
  size?: 'xs' | 'sm';
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  size = 'sm',
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      className={cn('inline-flex gap-0.5 rounded-md bg-surface-0 p-0.5 ring-1 ring-inset ring-line', className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-[5px] font-medium transition-colors whitespace-nowrap',
            size === 'xs' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
            value === option.value
              ? 'bg-surface-3 text-ink shadow-sm'
              : 'text-ink-dim hover:text-ink-muted',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback states
// ---------------------------------------------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-md bg-surface-2', className)}>
      <div className="absolute inset-y-0 w-1/3 animate-sweep bg-gradient-to-r from-transparent via-surface-3 to-transparent" />
    </div>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'grid-fade flex flex-1 flex-col items-center justify-center gap-2 rounded-lg px-6 py-10 text-center',
        className,
      )}
    >
      {icon && <span className="text-ink-dim/70">{icon}</span>}
      <p className="text-sm font-medium text-ink-muted">{title}</p>
      {description && <p className="max-w-sm text-xs leading-relaxed text-ink-dim">{description}</p>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <p className="text-sm font-medium text-danger">Could not load this view</p>
      <p className="max-w-sm text-xs leading-relaxed text-ink-dim">{message}</p>
      {retry && (
        <Button variant="secondary" onClick={retry} className="mt-1.5">
          Retry
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data display
// ---------------------------------------------------------------------------

interface ProgressBarProps {
  /** 0..1. Values above 1 are clamped but tinted to signal overflow. */
  value: number;
  color?: string;
  className?: string;
  height?: number;
}

export function ProgressBar({ value, color = 'var(--color-brand)', className, height = 4 }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full bg-surface-3', className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${clamped * 100}%`, backgroundColor: color }}
      />
    </div>
  );
}

interface StatProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  hint?: ReactNode;
  /** Signed change vs. the comparison period, as a fraction. */
  delta?: number;
  /** For metrics where a decrease is good (e.g. congestion). */
  invertDelta?: boolean;
  icon?: ReactNode;
  tone?: BadgeTone;
  className?: string;
  as?: ElementType;
}

export function Stat({
  label,
  value,
  unit,
  hint,
  delta,
  invertDelta,
  icon,
  tone = 'brand',
  className,
  as: Tag = 'div',
}: StatProps) {
  const improving = delta == null ? null : invertDelta ? delta < 0 : delta > 0;

  return (
    <Tag className={cn('panel flex min-w-0 flex-col gap-1.5 p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel className="truncate">{label}</FieldLabel>
        {icon && <span className={cn('shrink-0', TONE_TEXT[tone])}>{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="nums truncate text-xl font-semibold tracking-tight text-ink">{value}</span>
        {unit && <span className="text-xs text-ink-dim">{unit}</span>}
      </div>
      <div className="flex items-center gap-1.5">
        {delta != null && Number.isFinite(delta) && (
          <span
            className={cn(
              'nums text-[11px] font-medium',
              improving ? 'text-ok' : 'text-danger',
            )}
          >
            {delta > 0 ? '▲' : '▼'} {Math.abs(delta * 100).toFixed(1)}%
          </span>
        )}
        {hint && <span className="truncate text-[11px] text-ink-dim">{hint}</span>}
      </div>
    </Tag>
  );
}

/** Monospace plate chip — the single most-scanned element in the whole UI. */
export function PlateChip({
  plate,
  size = 'md',
  flagged,
  className,
}: {
  plate: string;
  size?: 'sm' | 'md' | 'lg';
  flagged?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded font-mono font-semibold tracking-wider whitespace-nowrap',
        'ring-1 ring-inset',
        flagged
          ? 'bg-critical/15 text-critical ring-critical/50'
          : 'bg-surface-0 text-ink ring-line-strong',
        size === 'sm' && 'px-1.5 py-0.5 text-[11px]',
        size === 'md' && 'px-2 py-0.5 text-xs',
        size === 'lg' && 'px-2.5 py-1 text-sm',
        className,
      )}
    >
      {plate}
    </span>
  );
}

/** Key/value row for dense detail panels. */
export function DetailRow({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1.5', className)}>
      <span className="shrink-0 text-[11px] text-ink-dim">{label}</span>
      <span className="min-w-0 truncate text-right text-xs font-medium text-ink">{children}</span>
    </div>
  );
}
