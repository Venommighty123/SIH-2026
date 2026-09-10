import type { LngLat } from '@/types';

/** Geometry helpers used by the map layers. */

/**
 * Andrew's monotone chain convex hull. Used to draw a zone boundary from the
 * camera sites inside it — the deployment has no surveyed zone polygons, and a
 * hull over its own nodes is an honest representation of covered area.
 */
export function convexHull(points: LngLat[]): LngLat[] {
  if (points.length < 3) return [...points];

  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const cross = (o: LngLat, a: LngLat, b: LngLat) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const build = (input: LngLat[]) => {
    const stack: LngLat[] = [];
    for (const point of input) {
      while (stack.length >= 2 && cross(stack[stack.length - 2], stack[stack.length - 1], point) <= 0) {
        stack.pop();
      }
      stack.push(point);
    }
    return stack;
  };

  const lower = build(sorted);
  const upper = build([...sorted].reverse());

  // Drop each chain's last point; it duplicates the other chain's first.
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Expands a ring outward from its centroid, so hulls do not clip their nodes. */
export function padRing(ring: LngLat[], factor = 1.14): LngLat[] {
  if (ring.length === 0) return ring;
  const cx = ring.reduce((sum, p) => sum + p[0], 0) / ring.length;
  const cy = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;
  return ring.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor] as LngLat);
}

/** Bounding box covering every supplied coordinate, with optional padding. */
export function boundsOf(
  positions: LngLat[],
  paddingDegrees = 0.004,
): [[number, number], [number, number]] | null {
  if (positions.length === 0) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of positions) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  return [
    [minLng - paddingDegrees, minLat - paddingDegrees],
    [maxLng + paddingDegrees, maxLat + paddingDegrees],
  ];
}

/** Point along a two-point segment at fraction t, for placing midpoint markers. */
export function interpolate(a: LngLat, b: LngLat, t: number): LngLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
