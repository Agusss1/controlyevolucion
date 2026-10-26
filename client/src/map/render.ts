import { cellCenter, hexCorners, neighborsOf, TERRAIN } from '@cyo/shared';
import { TERRAIN_INFO } from '@cyo/simulation';
import type { MapGeometry } from './mapData';

export const PX = 9; // píxeles por unidad de mapa en los mapas de bits base

function hexToRgb(h: string): [number, number, number] {
  const v = h.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

let provincePaths: { geo: MapGeometry; paths: Path2D[] } | null = null;
/** Un Path2D por provincia con todos sus hexágonos (en unidades de mapa). */
export function getProvincePaths(geo: MapGeometry): Path2D[] {
  if (provincePaths?.geo === geo) return provincePaths.paths;
  const paths = geo.provCells.map((cells) => {
    const p = new Path2D();
    for (const c of cells) {
      const [x, y] = cellCenter(c, geo.width);
      const pts = hexCorners(x, y, 1.02);
      p.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < 6; k++) p.lineTo(pts[k][0], pts[k][1]);
      p.closePath();
    }
    return p;
  });
  provincePaths = { geo, paths };
  return paths;
}

/** Relieve: color de bioma + sombreado por pendiente + profundidad marina. */
export function renderTerrain(geo: MapGeometry): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(geo.worldW * PX);
  cv.height = Math.ceil(geo.worldH * PX);
  const ctx = cv.getContext('2d')!;
  ctx.scale(PX, PX);
  ctx.fillStyle = '#0e2238';
  ctx.fillRect(0, 0, geo.worldW, geo.worldH);
  const W = geo.width, H = geo.height;
  const nb: number[] = [];
  for (let i = 0; i < W * H; i++) {
    const t = geo.terrain[i];
    const e = geo.elevation[i];
    let rgb: [number, number, number];
    if (t === TERRAIN.OCEAN || t === TERRAIN.SHALLOW) {
      const depth = Math.max(0, 128 - e) / 128;
      const base: [number, number, number] = t === TERRAIN.SHALLOW ? [44, 92, 128] : [22, 52, 84];
      rgb = base.map((v) => v * (1 - depth * 0.45)) as [number, number, number];
    } else if (t === TERRAIN.LAKE) rgb = [58, 112, 150];
    else {
      rgb = hexToRgb(TERRAIN_INFO[t].color);
      // sombreado: luz desde el noroeste
      neighborsOf(i, W, H, nb);
      const row = Math.floor(i / W), col = i % W;
      const nwRow = row - 1, nwCol = row & 1 ? col : col - 1;
      const nw = nwRow >= 0 && nwCol >= 0 ? nwRow * W + nwCol : i;
      const slope = (e - geo.elevation[nw]) / 255;
      const shade = 1 + Math.max(-0.35, Math.min(0.35, slope * 4.5)) + (e - 128) / 255 * 0.25;
      rgb = rgb.map((v) => Math.max(0, Math.min(255, v * shade))) as [number, number, number];
    }
    const [x, y] = cellCenter(i, W);
    const pts = hexCorners(x, y, 1.04);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < 6; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.closePath();
    ctx.fillStyle = `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`;
    ctx.fill();
  }
  // costas
  ctx.strokeStyle = 'rgba(12,24,38,0.75)';
  ctx.lineWidth = 0.18;
  ctx.stroke(geo.coast);
  // ríos
  for (const r of geo.riverPaths) {
    ctx.strokeStyle = r.navigable ? 'rgba(88,160,220,0.95)' : 'rgba(96,150,200,0.7)';
    ctx.lineWidth = r.navigable ? 0.42 : 0.24;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(r.path);
  }
  return cv;
}

export type ProvinceColor = (idx: number) => string | null;

/** Capa temática: rellena provincias con un color (o nada) y raya las ocupadas. */
export function renderOverlay(geo: MapGeometry, colorOf: ProvinceColor, hatchOf?: (idx: number) => string | null): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(geo.worldW * PX / 2);
  cv.height = Math.ceil(geo.worldH * PX / 2);
  const ctx = cv.getContext('2d')!;
  ctx.scale(PX / 2, PX / 2);
  const paths = getProvincePaths(geo);
  paths.forEach((p, idx) => {
    const col = colorOf(idx);
    if (!col) return;
    ctx.fillStyle = col;
    ctx.fill(p);
  });
  if (hatchOf) {
    paths.forEach((p, idx) => {
      const col = hatchOf(idx);
      if (!col) return;
      ctx.save();
      ctx.clip(p);
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.55;
      const prov = geo.map.provinces[idx];
      for (let d = -30; d < 30; d += 1.6) { ctx.beginPath(); ctx.moveTo(prov.cx + d - 20, prov.cy - 20); ctx.lineTo(prov.cx + d + 20, prov.cy + 20); ctx.stroke(); }
      ctx.restore();
    });
  }
  return cv;
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Escala de color secuencial (bajo → alto). */
export function ramp(t: number, scheme: 'heat' | 'green' | 'blue' | 'diverging' = 'heat', alpha = 0.65): string {
  const x = Math.max(0, Math.min(1, t));
  let c: [number, number, number];
  if (scheme === 'green') c = [lerp(30, 120, x), lerp(50, 210, x), lerp(40, 90, x)];
  else if (scheme === 'blue') c = [lerp(20, 90, x), lerp(40, 170, x), lerp(80, 255, x)];
  else if (scheme === 'diverging') c = x < 0.5 ? [lerp(210, 235, x * 2), lerp(60, 225, x * 2), lerp(55, 200, x * 2)] : [lerp(235, 60, (x - 0.5) * 2), lerp(225, 170, (x - 0.5) * 2), lerp(200, 90, (x - 0.5) * 2)];
  else c = [lerp(40, 245, x), lerp(60, 200 - 120 * x, x), lerp(120, 40, x)];
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;
}
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
