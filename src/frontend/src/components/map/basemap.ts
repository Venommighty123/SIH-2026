import type { StyleSpecification } from 'maplibre-gl';

/**
 * Basemap style.
 *
 * Deliberately raster-only and keyless: no API token to leak, no vector glyph
 * server to depend on. Because there are no glyphs available, this application
 * never uses MapLibre text symbol layers — all map text is rendered as DOM
 * markers instead, which also makes it selectable and screen-reader visible.
 */

const DEFAULT_DARK_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
];

export const BASEMAP_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China, and the GIS User Community';

export function buildBasemapStyle(): StyleSpecification {
  const override = import.meta.env.VITE_BASEMAP_TILE_URL;
  const tiles = override
    ? // Expand a {s} subdomain placeholder if the operator supplied one.
      override.includes('{s}')
      ? ['a', 'b', 'c'].map((host) => override.replace('{s}', host))
      : [override]
    : DEFAULT_DARK_TILES;

  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles,
        tileSize: 256,
        maxzoom: 19,
        attribution: BASEMAP_ATTRIBUTION,
      },
    },
    layers: [
      // Solid backdrop so the canvas matches the shell before tiles arrive, and
      // stays legible if the tile host is unreachable.
      {
        id: 'backdrop',
        type: 'background',
        paint: { 'background-color': '#0b1017' },
      },
      {
        id: 'basemap',
        type: 'raster',
        source: 'basemap',
        paint: {
          'raster-opacity': 0.9,
          'raster-saturation': -0.2,
          'raster-contrast': 0.08,
          'raster-fade-duration': 240,
        },
      },
    ],
  };
}

/**
 * Draws a small arrowhead into an offscreen canvas so it can be registered as a
 * MapLibre sprite. Symbol layers can then place it along a line to show
 * direction of travel without needing a font stack.
 */
export function createArrowImage(color = '#4fd6e8', size = 24): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable; cannot build map sprites.');

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(8,12,18,0.85)';
  ctx.lineWidth = size * 0.09;
  ctx.lineJoin = 'round';

  // Arrow pointing right; MapLibre rotates it to follow the line.
  const inset = size * 0.2;
  ctx.beginPath();
  ctx.moveTo(size - inset, size / 2);
  ctx.lineTo(inset, inset);
  ctx.lineTo(size * 0.42, size / 2);
  ctx.lineTo(inset, size - inset);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}
