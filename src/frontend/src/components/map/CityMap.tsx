import { useEffect, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import type { Camera, HeatPoint, TrajectoryPoint } from '@/types';
import type { RouteSegment } from '@/lib/trajectory';
import { CAMERA_STATUS_COLOR } from '@/lib/format';
import { cn } from '@/components/ui/primitives';

/**
 * Leaflet-based map surface — drop-in replacement for the MapLibre CityMap.
 *
 * Accepts the same props as the previous implementation so TrajectoryPage
 * (and any other consumer) needs zero changes.
 *
 * Trajectory tracking logic:
 *  - Camera markers show on the map with colour-coded dots (status-based)
 *  - When routePoints are provided (plate search result), numbered sequence
 *    pins appear and OSRM road routes are fetched and drawn as polylines
 *  - Observed legs → solid cyan; inferred legs → dashed grey
 *  - fitTo prop re-fits the map bounds whenever a new plate is traced
 */

// Dwarka Mor Junction centre
const CITY_CENTER: [number, number] = [28.612, 77.063];
const DEFAULT_ZOOM = 14;

export interface MapLayerVisibility {
  cameras: boolean;
  heatmap: boolean;
  congestion: boolean;
  zones: boolean;
  labels: boolean;
}

export interface ZonePolygon {
  id: string;
  name: string;
  ring: [number, number][];
}

interface CityMapProps {
  cameras?: Camera[];
  cameraReads?: Map<string, number>;
  heatPoints?: HeatPoint[];
  zonePolygons?: ZonePolygon[];
  route?: RouteSegment[];
  routePoints?: TrajectoryPoint[];
  layers: MapLayerVisibility;
  selectedCameraId?: string | null;
  onSelectCamera?: (cameraId: string | null) => void;
  activeSeq?: number | null;
  onSelectSeq?: (seq: number) => void;
  fitTo?: [number, number][] | null;
  followPosition?: [number, number] | null;
  className?: string;
  children?: ReactNode;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Fetch a road route via OSRM. Returns an array of [lat, lng] waypoints. */
async function fetchRoadRoute(
  from: [number, number], // [lat, lng]
  to: [number, number],
): Promise<[number, number][]> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('OSRM request failed');
  const data = await res.json();
  if (!data.routes?.length) throw new Error('No route found');
  // GeoJSON coords are [lng, lat] — flip to Leaflet [lat, lng]
  return (data.routes[0].geometry.coordinates as [number, number][]).map(
    ([lng, lat]) => [lat, lng],
  );
}

/** Build a circular camera-dot icon coloured by camera status. */
function cameraIcon(color: string, selected: boolean): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="netra-cam-dot${selected ? ' selected' : ''}" style="background:${color};box-shadow:0 0 0 ${selected ? '3px white,' : ''}3px ${color}33"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

/** Build a numbered sequence-pin icon for trajectory waypoints. */
function seqPin(seq: number, active: boolean): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<button type="button" class="netra-pin${active ? ' is-active' : ''}">${seq}</button>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// ─── component ────────────────────────────────────────────────────────────────

export function CityMap({
  cameras = [],
  cameraReads,
  zonePolygons: _zonePolygons,
  route = [],
  routePoints = [],
  layers,
  selectedCameraId,
  onSelectCamera,
  activeSeq,
  onSelectSeq,
  fitTo,
  followPosition,
  className,
  children,
}: CityMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [ready, setReady] = useState(false);

  // Refs for all mutable map objects (so effect closures stay stable)
  const cameraMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const routeLayersRef = useRef<L.Layer[]>([]);
  const seqMarkersRef = useRef<Map<number, L.Marker>>(new Map());

  // Keep callback refs current without re-running heavy effects
  const onSelectCameraRef = useRef(onSelectCamera);
  onSelectCameraRef.current = onSelectCamera;
  const onSelectSeqRef = useRef(onSelectSeq);
  onSelectSeqRef.current = onSelectSeq;

  // ── init map once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: CITY_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapRef.current = map;

    // Clicking empty map clears selection
    map.on('click', () => {
      onSelectCameraRef.current?.(null);
    });

    setReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // ── camera markers ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    // Remove previous markers
    cameraMarkersRef.current.forEach((m) => m.remove());
    cameraMarkersRef.current.clear();

    if (!layers.cameras) return;

    cameras.forEach((camera) => {
      const [lng, lat] = camera.position; // position is [lng, lat]
      const color = CAMERA_STATUS_COLOR[camera.status];
      const reads = cameraReads?.get(camera.id) ?? 0;
      const selected = camera.id === selectedCameraId;

      const marker = L.marker([lat, lng], {
        icon: cameraIcon(color, selected),
        zIndexOffset: selected ? 500 : 0,
      }).addTo(map);

      marker.bindPopup(
        `<div style="padding:8px 10px;min-width:180px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>
            <strong style="font-size:12px">${camera.name}</strong>
          </div>
          <div style="font-size:10.5px;opacity:.68;margin-bottom:4px">${camera.code} · ${camera.location}</div>
          <div style="font-size:11px">
            <b>${reads}</b> reads &nbsp;·&nbsp; <span style="opacity:.7">${camera.status}</span>
          </div>
        </div>`,
        { closeButton: false, offset: [0, -4] },
      );

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectCameraRef.current?.(camera.id);
      });

      marker.on('mouseover', () => marker.openPopup());
      marker.on('mouseout', () => marker.closePopup());

      cameraMarkersRef.current.set(camera.id, marker);
    });
  }, [cameras, cameraReads, layers.cameras, ready]);

  // Update selected state without rebuilding all markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    cameraMarkersRef.current.forEach((marker, id) => {
      const camera = cameras.find((c) => c.id === id);
      if (!camera) return;
      const color = CAMERA_STATUS_COLOR[camera.status];
      const selected = id === selectedCameraId;
      marker.setIcon(cameraIcon(color, selected));
      marker.setZIndexOffset(selected ? 500 : 0);
    });
  }, [selectedCameraId, cameras, ready]);

  // ── trajectory sequence pins ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    // Clear old pins
    seqMarkersRef.current.forEach((m) => m.remove());
    seqMarkersRef.current.clear();

    routePoints.forEach((point) => {
      const [lng, lat] = point.camera.position;
      const active = point.seq === activeSeq;

      const marker = L.marker([lat, lng], {
        icon: seqPin(point.seq, active),
        zIndexOffset: active ? 1000 : 100,
      }).addTo(map);

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectSeqRef.current?.(point.seq);
      });

      seqMarkersRef.current.set(point.seq, marker);
    });

    return () => {
      seqMarkersRef.current.forEach((m) => m.remove());
      seqMarkersRef.current.clear();
    };
  }, [routePoints, ready]);

  // Update active pin highlight without rebuilding all pins
  useEffect(() => {
    seqMarkersRef.current.forEach((marker, seq) => {
      const active = seq === activeSeq;
      marker.setIcon(seqPin(seq, active));
      marker.setZIndexOffset(active ? 1000 : 100);
    });
  }, [activeSeq]);

  // ── route polylines (OSRM road routing) ───────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    // Clear previous route layers
    routeLayersRef.current.forEach((l) => map.removeLayer(l));
    routeLayersRef.current = [];

    if (route.length === 0) return;

    // Draw each segment. For inferred segments we draw a straight dashed line;
    // for observed segments we fetch the real road route from OSRM.
    route.forEach(async (segment) => {
      const coords = segment.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);

      if (segment.inferred || coords.length < 2) {
        // Inferred / straight-line fallback
        const line = L.polyline(coords, {
          color: '#8b9bb4',
          weight: 2.4,
          opacity: 0.85,
          dashArray: '8, 6',
        });
        line.addTo(map);
        routeLayersRef.current.push(line);
        return;
      }

      // Try to fetch a real road route for observed segments
      try {
        const from = coords[0];
        const to = coords[coords.length - 1];
        const roadCoords = await fetchRoadRoute(from, to);

        if (!mapRef.current) return; // component may have unmounted

        // Glow / casing
        const glow = L.polyline(roadCoords, {
          color: '#4fd6e8',
          weight: 10,
          opacity: 0.15,
          lineJoin: 'round',
        });
        // Main line
        const line = L.polyline(roadCoords, {
          color: '#4fd6e8',
          weight: 3.2,
          opacity: 0.92,
          lineCap: 'round',
          lineJoin: 'round',
        });

        glow.addTo(map);
        line.addTo(map);
        routeLayersRef.current.push(glow, line);
      } catch {
        // OSRM unreachable — draw straight dashed cyan
        const fallback = L.polyline(coords, {
          color: '#4fd6e8',
          weight: 3,
          opacity: 0.6,
          dashArray: '8, 6',
        });
        fallback.addTo(map);
        routeLayersRef.current.push(fallback);
      }
    });
  }, [route, ready]);

  // ── fitTo bounds ───────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !fitTo || fitTo.length === 0) return;

    if (fitTo.length === 1) {
      // LngLat → [lat, lng] for Leaflet
      map.setView([fitTo[0][1], fitTo[0][0]], 15);
      return;
    }

    const latLngs = fitTo.map(([lng, lat]) => [lat, lng] as [number, number]);
    map.fitBounds(latLngs, { padding: [60, 60], maxZoom: 16 });
  }, [fitTo, ready]);

  // ── follow position (playback panning) ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !followPosition) return;
    map.panTo([followPosition[1], followPosition[0]]);
  }, [followPosition, ready]);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className={cn('relative isolate size-full overflow-hidden', className)}>
      <div ref={containerRef} className="size-full" />
      {!ready && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-surface-0/60">
          <span className="text-xs text-ink-dim">Initialising map…</span>
        </div>
      )}
      {children}
    </div>
  );
}
