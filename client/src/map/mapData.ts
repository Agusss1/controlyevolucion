import { cellCenter, decodeU16, decodeU8, edgeBetween, neighborsOf, SQRT3, type WorldMap } from '@cyo/shared';

/**
 * Geometría precalculada del mapa (en unidades de "tamaño de hexágono = 1").
 * Se calcula una sola vez por partida; las fronteras de países se recalculan cuando cambia
 * la soberanía o el control.
 */
export interface MapGeometry {
  map: WorldMap;
  width: number;
  height: number;
  /** tamaño del lienzo del mapa en unidades */
  worldW: number;
  worldH: number;
  terrain: Uint8Array;
  elevation: Uint8Array;
  cellProv: Uint16Array;
  cellSea: Uint16Array;
  river: Uint8Array;
  provIndex: Map<string, number>;
  provCells: number[][];
  provinceBorders: Path2D;
  coast: Path2D;
  riverPaths: { path: Path2D; navigable: boolean }[];
  /** cruces por estrecho: segmento entre las celdas más próximas de ambas provincias */
  straits: [number, number, number, number][];
  /** aristas compartidas entre pares de provincias (clave "i|j") */
  edges: Map<string, [number, number, number, number][]>;
}

let cached: MapGeometry | null = null;

export function getGeometry(map: WorldMap): MapGeometry {
  if (cached && cached.map === map) return cached;
  const W = map.width, H = map.height;
  const terrain = decodeU8(map.cells.terrain);
  const elevation = decodeU8(map.cells.elevation);
  const cellProv = decodeU16(map.cells.province);
  const cellSea = decodeU16(map.cells.sea);
  const river = decodeU8(map.cells.river);
  const provIndex = new Map(map.provinces.map((p, i) => [p.id, i]));
  const provCells: number[][] = map.provinces.map(() => []);
  for (let i = 0; i < W * H; i++) if (cellProv[i] > 0) provCells[cellProv[i] - 1].push(i);
  const provinceBorders = new Path2D();
  const coast = new Path2D();
  const edges = new Map<string, [number, number, number, number][]>();
  const nb: number[] = [];
  for (let i = 0; i < W * H; i++) {
    const a = cellProv[i];
    for (const n of neighborsOf(i, W, H, nb)) {
      if (n < i) continue;
      const b = cellProv[n];
      if (a === b) continue;
      const e = edgeBetween(i, n, W);
      if (!e) continue;
      const [[x1, y1], [x2, y2]] = e;
      if (a > 0 && b > 0) {
        provinceBorders.moveTo(x1, y1); provinceBorders.lineTo(x2, y2);
        const key = a < b ? `${a - 1}|${b - 1}` : `${b - 1}|${a - 1}`;
        const l = edges.get(key) ?? [];
        l.push([x1, y1, x2, y2]);
        edges.set(key, l);
      } else if (a > 0 || b > 0) {
        coast.moveTo(x1, y1); coast.lineTo(x2, y2);
      }
    }
  }
  const riverPaths = map.rivers.map((r) => {
    const path = new Path2D();
    r.cells.forEach((c, k) => { const [x, y] = cellCenter(c, W); if (k === 0) path.moveTo(x, y); else path.lineTo(x, y); });
    return { path, navigable: r.navigable };
  });
  const straits: [number, number, number, number][] = [];
  map.provinces.forEach((p, i) => {
    for (const l of p.neighbors) {
      const j = provIndex.get(l.to);
      if (l.kind !== 'strait' || j === undefined || j < i) continue;
      let best: [number, number, number, number] | null = null, bd = Infinity;
      for (const a of provCells[i]) {
        const [ax, ay] = cellCenter(a, W);
        for (const b of provCells[j]) { const [bx, by] = cellCenter(b, W); const d = (ax - bx) ** 2 + (ay - by) ** 2; if (d < bd) { bd = d; best = [ax, ay, bx, by]; } }
      }
      if (best) straits.push(best);
    }
  });
  cached = {
    map, width: W, height: H, worldW: SQRT3 * (W + 0.5), worldH: 1.5 * H + 0.5, terrain, elevation, cellProv, cellSea, river, provIndex, provCells,
    provinceBorders, coast, riverPaths, straits, edges
  };
  return cached;
}

/** Fronteras entre provincias cuyo "dueño" (según la función) difiere. */
export function bordersBy(geo: MapGeometry, ownerOf: (provIdx: number) => string): Path2D {
  const p = new Path2D();
  for (const [key, segs] of geo.edges) {
    const [a, b] = key.split('|').map(Number);
    if (ownerOf(a) === ownerOf(b)) continue;
    for (const [x1, y1, x2, y2] of segs) { p.moveTo(x1, y1); p.lineTo(x2, y2); }
  }
  // costas de países también son fronteras exteriores
  return p;
}

/** Segmentos de frente: aristas entre provincias controladas por bandos en guerra. */
export function frontSegments(geo: MapGeometry, controller: string[], hostile: (a: string, b: string) => boolean): Path2D {
  const p = new Path2D();
  for (const [key, segs] of geo.edges) {
    const [a, b] = key.split('|').map(Number);
    const ca = controller[a], cb = controller[b];
    if (ca === cb || !hostile(ca, cb)) continue;
    for (const [x1, y1, x2, y2] of segs) { p.moveTo(x1, y1); p.lineTo(x2, y2); }
  }
  return p;
}

export function provinceCenter(geo: MapGeometry, id: string): [number, number] {
  const p = geo.map.provinces[geo.provIndex.get(id) ?? -1];
  if (p) return [p.cx, p.cy];
  const z = geo.map.seaZones.find((s) => s.id === id);
  return z ? [z.cx, z.cy] : [0, 0];
}
