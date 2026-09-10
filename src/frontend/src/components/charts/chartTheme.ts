/**
 * Shared Recharts styling.
 *
 * Recharts renders inline SVG, so it cannot inherit the Tailwind theme. These
 * constants keep every chart aligned with the shell instead of each chart
 * re-declaring its own greys.
 */

export const chartTooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--color-surface-2)',
    border: '1px solid var(--color-line-strong)',
    borderRadius: 8,
    fontSize: 11,
    padding: '7px 10px',
    boxShadow: '0 14px 32px -12px rgb(0 0 0 / 0.7)',
  },
  labelStyle: { color: 'var(--color-ink)', fontWeight: 600, marginBottom: 3 },
  itemStyle: { color: 'var(--color-ink-muted)', padding: 0 },
  cursor: { fill: 'var(--color-surface-3)', fillOpacity: 0.35 },
} as const;

export const axisStyle = {
  tick: { fontSize: 10, fill: 'var(--color-ink-dim)' },
  stroke: 'var(--color-line)',
} as const;

export const gridStyle = {
  stroke: 'var(--color-line)',
  strokeDasharray: '2 4',
} as const;

/** Categorical palette for series that need distinct, legible colours. */
export const SERIES_COLORS = [
  '#4fd6e8',
  '#3ddc97',
  '#f7c948',
  '#f97e3f',
  '#e5484d',
  '#a78bfa',
  '#60a5fa',
  '#f472b6',
];
