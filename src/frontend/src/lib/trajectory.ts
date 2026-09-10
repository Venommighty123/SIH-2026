import type { CityNetwork } from '@/mock/city';
import type {
  Detection,
  LngLat,
  Trajectory,
  TrajectoryLeg,
  TrajectoryPoint,
  Vehicle,
} from '@/types';

/**
 * Trajectory reconstruction.
 *
 * Simplified: no speed computation, no anomaly detection. Builds the route
 * from ordered sightings and the road graph topology.
 */

// ---------------------------------------------------------------------------
// Shortest path over the camera graph
// ---------------------------------------------------------------------------

interface PathResult {
  /** Full node sequence including both endpoints. Empty if unreachable. */
  nodes: string[];
  distanceKm: number;
}

/**
 * Dijkstra over road distance. The network is ~40 nodes, so a linear scan for
 * the next-closest node is cheaper than maintaining a heap.
 */
export function shortestPath(network: CityNetwork, fromId: string, toId: string): PathResult {
  if (fromId === toId) return { nodes: [fromId], distanceKm: 0 };

  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  const settled = new Set<string>();

  for (const camera of network.cameras) distances.set(camera.id, Infinity);
  distances.set(fromId, 0);

  while (settled.size < network.cameras.length) {
    let current: string | null = null;
    let best = Infinity;
    for (const [id, distance] of distances) {
      if (!settled.has(id) && distance < best) {
        best = distance;
        current = id;
      }
    }
    if (current === null) break;
    if (current === toId) break;
    settled.add(current);

    for (const link of network.adjacency.get(current) ?? []) {
      if (settled.has(link.toCameraId)) continue;
      const candidate = best + link.distanceKm;
      if (candidate < (distances.get(link.toCameraId) ?? Infinity)) {
        distances.set(link.toCameraId, candidate);
        previous.set(link.toCameraId, current);
      }
    }
  }

  const total = distances.get(toId) ?? Infinity;
  if (!Number.isFinite(total)) return { nodes: [], distanceKm: Infinity };

  const nodes: string[] = [toId];
  let cursor = toId;
  while (cursor !== fromId) {
    const parent = previous.get(cursor);
    if (!parent) return { nodes: [], distanceKm: Infinity };
    nodes.unshift(parent);
    cursor = parent;
  }

  return { nodes, distanceKm: Number(total.toFixed(3)) };
}

// ---------------------------------------------------------------------------
// Leg construction
// ---------------------------------------------------------------------------

function buildLeg(
  network: CityNetwork,
  fromDetection: Detection,
  toDetection: Detection,
): TrajectoryLeg {
  const fromId = fromDetection.cameraId;
  const toId = toDetection.cameraId;

  const directLink = (network.adjacency.get(fromId) ?? []).find((l) => l.toCameraId === toId);
  const path = directLink ? { nodes: [fromId, toId], distanceKm: directLink.distanceKm } : shortestPath(network, fromId, toId);

  const durationMin =
    (new Date(toDetection.timestamp).getTime() - new Date(fromDetection.timestamp).getTime()) / 60_000;

  const distanceKm = Number.isFinite(path.distanceKm) ? path.distanceKm : 0;

  return {
    fromCameraId: fromId,
    toCameraId: toId,
    distanceKm: Number(distanceKm.toFixed(3)),
    durationMin: Number(durationMin.toFixed(2)),
    inferred: !directLink,
    missingHops: Math.max(0, path.nodes.length - 2),
    viaCameraIds: path.nodes.slice(1, -1),
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function buildTrajectory(
  plate: string,
  reads: Detection[],
  network: CityNetwork,
  vehicle: Vehicle | null,
): Trajectory {
  const ordered = [...reads].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const points: TrajectoryPoint[] = ordered.map((detection, index) => ({
    detection,
    camera: network.camerasById.get(detection.cameraId)!,
    legIn: index === 0 ? undefined : buildLeg(network, ordered[index - 1], detection),
    seq: index + 1,
  }));

  const legs = points.map((p) => p.legIn).filter((l): l is TrajectoryLeg => Boolean(l));
  const totalDistanceKm = legs.reduce((sum, l) => sum + l.distanceKm, 0);
  const totalDurationMin =
    ordered.length < 2
      ? 0
      : (new Date(ordered[ordered.length - 1].timestamp).getTime() -
          new Date(ordered[0].timestamp).getTime()) /
        60_000;

  return {
    plate,
    vehicle,
    points,
    from: ordered[0]?.timestamp ?? '',
    to: ordered[ordered.length - 1]?.timestamp ?? '',
    totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
    totalDurationMin: Number(totalDurationMin.toFixed(1)),
    camerasVisited: new Set(ordered.map((d) => d.cameraId)).size,
  };
}

// ---------------------------------------------------------------------------
// Map geometry
// ---------------------------------------------------------------------------

export interface RouteSegment {
  coordinates: LngLat[];
  inferred: boolean;
  fromSeq: number;
  toSeq: number;
}

/**
 * Expands a trajectory into drawable segments that follow the road graph through
 * intermediate nodes, so an inferred stretch renders as the plausible route
 * rather than a straight line across the city.
 */
export function routeSegments(trajectory: Trajectory, network: CityNetwork): RouteSegment[] {
  const segments: RouteSegment[] = [];

  for (let i = 1; i < trajectory.points.length; i++) {
    const previous = trajectory.points[i - 1];
    const current = trajectory.points[i];
    const leg = current.legIn;
    if (!leg) continue;

    const via = leg.viaCameraIds
      .map((id) => network.camerasById.get(id)?.position)
      .filter((p): p is LngLat => Boolean(p));

    segments.push({
      coordinates: [previous.camera.position, ...via, current.camera.position],
      inferred: leg.inferred,
      fromSeq: previous.seq,
      toSeq: current.seq,
    });
  }

  return segments;
}
