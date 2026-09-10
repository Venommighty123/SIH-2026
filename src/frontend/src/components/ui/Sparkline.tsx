import { useId } from 'react';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Fills the area under the line with a fading gradient. */
  fill?: boolean;
  strokeWidth?: number;
  className?: string;
  /** Accessible summary; the SVG is otherwise hidden from screen readers. */
  label?: string;
}

/**
 * Dependency-free sparkline. Recharts is used for real charts, but for the KPI
 * strip a hand-rolled SVG avoids mounting dozens of chart contexts.
 */
export function Sparkline({
  values,
  width = 120,
  height = 28,
  color = 'var(--color-brand)',
  fill = true,
  strokeWidth = 1.5,
  className,
  label,
}: SparklineProps) {
  const gradientId = useId();

  if (values.length < 2) {
    return <div className={className} style={{ width, height }} aria-hidden="true" />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padding = strokeWidth;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - padding - ((value - min) / span) * (height - padding * 2);
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      preserveAspectRatio="none"
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r={strokeWidth + 0.6} fill={color} />
    </svg>
  );
}
