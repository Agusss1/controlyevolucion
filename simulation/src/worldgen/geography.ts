import { TERRAIN, neighborsOf, cellCenter, type CrossingKind } from '@cyo/shared';
import { Rng, Noise2D, clamp } from '../rng.js';
import { isSea, isWater } from '../data/terrain.js';

/**
 * Generador geográfico reproducible.
 * Produce relieve, climas, biomas, ríos, lagos, masas continentales, provincias y zonas marítimas
 * sobre una malla hexagonal, y valida que el resultado sea jugable (conectividad, fronteras).
 */

export interface ContinentBlob { x: number; y: number; rx: number; ry: number; rot?: number; weight?: number }
export interface Ridge { x1: number; y1: number; x2: number; y2: number; width?: number; height?: number }
export interface ClimateZone { x: number; y: number; r: number; moisture: number }
export interface ResourceHotspot { x: number; y: number; r: number; resource: 'oil' | 'gas' | 'coal' | 'minerals'; amount: number }

export interface GeoParams {
  seed: string;
  width: number;
  height: number;
  landFraction: number;
  blobs: ContinentBlob[];
  ridges: Ridge[];
  climateZones: ClimateZone[];
  hotspots: ResourceHotspot[];
  provinceCells: number;
  seaZoneCells: number;
  equator: number;
}

export interface GeoProvince {
  idx: number;
  cells: number[];
  landmass: number;
  anchor: number;
  neighbors: Map<number, { border: number; river: number; strait: boolean }>;
  seaZones: Set<number>;
}

export interface GeoSeaZone { idx: number; cells: number[]; anchor: number; neighbors: Set<number>; provinces: Set<number>; deep: boolean }
export interface GeoLandmass { id: number; cells: number[]; provinces: number[]; kind: 'continent' | 'island' | 'archipelago'; group: number }
export interface GeoComponent { kind: 'mountains' | 'desert' | 'forest' | 'lake' | 'sea' | 'plains'; cells: number[]; anchor: number }

export interface GeoResult {
  params: GeoParams;
  width: number;
  height: number;
  terrain: Uint8Array;
  elevation: Float32Array;
  temperature: Float32Array;
  moisture: Float32Array;
  river: Uint8Array;
  flow: Float32Array;
  riverPaths: { cells: number[]; navigable: boolean }[];
  cellProvince: Int32Array;
  cellSea: Int32Array;
  cellLandmass: Int32Array;
  provinces: GeoProvince[];
  seaZones: GeoSeaZone[];
  landmasses: GeoLandmass[];
  components: GeoComponent[];
  resourceField: Record<'oil' | 'gas' | 'coal' | 'minerals', Float32Array>;
}

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number { return this.keys.length; }
  push(key: number, val: number): void {
    const k = this.keys, v = this.vals;
    k.push(key); v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const k = this.keys, v = this.vals;
    const top: [number, number] = [k[0], v[0]];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length > 0) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

function segDist(px: number, py: number, r: Ridge): number {
  const dx = r.x2 - r.x1, dy = r.y2 - r.y1;
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = clamp(((px - r.x1) * dx + (py - r.y1) * dy) / len2, 0, 1);
  const qx = r.x1 + t * dx, qy = r.y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
}

export function generateGeography(params: GeoParams): GeoResult {
  const { width: W, height: H } = params;
  const N = W * H;
  const rng = new Rng(params.seed + ':geo');
  const nz = new Noise2D(params.seed + ':elev');
  const warp = new Noise2D(params.seed + ':warp');
  const mz = new Noise2D(params.seed + ':moist');
  const rz = new Noise2D(params.seed + ':ridge');
  const tz = new Noise2D(params.seed + ':temp');
  const nb: number[] = [];
  const nb2: number[] = [];

  // ---------------------------------------------------------------- relieve
  const raw = new Float32Array(N);
  const uplift = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const col = i % W, row = (i - col) / W;
    let u = (col + 0.5 * (row & 1)) / W, v = row / H;
    u += (warp.fbm(u * 6, v * 6, 4) - 0.5) * 0.07;
    v += (warp.fbm(u * 6 + 31.7, v * 6 + 11.3, 4) - 0.5) * 0.07;
    let field = -0.6;
    for (const b of params.blobs) {
      const rot = b.rot ?? 0;
      const dx = u - b.x, dy = (v - b.y) * (H / W) * 1.6;
      const cx = dx * Math.cos(rot) + dy * Math.sin(rot);
      const cy = -dx * Math.sin(rot) + dy * Math.cos(rot);
      const ry = b.ry * (H / W) * 1.6;
      const d = Math.sqrt((cx / b.rx) ** 2 + (cy / ry) ** 2);
      field = Math.max(field, (1 - d) * (b.weight ?? 1));
    }
    const n = nz.fbm(u * 9, v * 9, 6) - 0.5;
    let e = field * 0.9 + n * 0.55;
    // bordes del mapa siempre oceánicos
    const edge = Math.min(u, 1 - u, v * 1.4, (1 - v) * 1.4);
    if (edge < 0.06) e -= (0.06 - edge) * 9;
    let up = 0;
    for (const r of params.ridges) {
      const d = segDist(u, v * (H / W), { ...r, y1: r.y1 * (H / W), y2: r.y2 * (H / W) });
      const w = r.width ?? 0.025;
      up = Math.max(up, Math.exp(-(d * d) / (2 * w * w)) * (r.height ?? 1));
    }
    uplift[i] = up * (0.45 + 0.75 * rz.ridged(u * 14, v * 14));
    raw[i] = e;
  }
  const sorted = Array.from(raw).sort((a, b) => a - b);
  const seaLevel = sorted[Math.floor((1 - params.landFraction) * (N - 1))];
  const maxRaw = sorted[N - 1];
  const elevation = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const e = raw[i] - seaLevel;
    if (e <= 0) elevation[i] = e / Math.max(1e-6, seaLevel - sorted[0]);
    else {
      const base = e / Math.max(1e-6, maxRaw - seaLevel);
      elevation[i] = clamp(base * 0.55 + uplift[i] * 0.62 + (rz.ridged(i % W / 9, Math.floor(i / W) / 9) - 0.5) * 0.08 * base, 0.005, 1);
    }
  }

  // ---------------------------------------------------------------- clima
  const terrain = new Uint8Array(N);
  const temperature = new Float32Array(N);
  const moisture = new Float32Array(N);
  // distancia a la costa (BFS desde el mar)
  const coastDist = new Int32Array(N).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < N; i++) if (elevation[i] <= 0) { coastDist[i] = 0; queue.push(i); }
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi];
    for (const n of neighborsOf(c, W, H, nb)) if (coastDist[n] < 0) { coastDist[n] = coastDist[c] + 1; queue.push(n); }
  }
  // sombra orográfica: vientos dominantes de oeste a este (latitudes medias) y de este a oeste (trópicos)
  const shadow = new Float32Array(N);
  for (let row = 0; row < H; row++) {
    const lat = Math.abs(row / H - params.equator) * 2;
    const westerly = lat > 0.32;
    let carried = 1;
    for (let k = 0; k < W; k++) {
      const col = westerly ? k : W - 1 - k;
      const i = row * W + col;
      if (elevation[i] <= 0) carried = Math.min(1, carried + 0.12);
      else {
        carried = Math.max(0.15, carried - elevation[i] * 0.045 - 0.006);
      }
      shadow[i] = carried;
    }
  }
  for (let i = 0; i < N; i++) {
    const col = i % W, row = (i - col) / W;
    const u = col / W, v = row / H;
    const lat = Math.abs(v - params.equator) * 2; // 0 ecuador, ~1 polos
    const t = 1.02 - lat * 0.86 - Math.max(0, elevation[i]) * 0.38 + (tz.fbm(u * 5, v * 5, 3) - 0.5) * 0.12;
    temperature[i] = clamp(t, 0, 1);
    // cinturón subtropical seco (~0.3-0.5 de latitud) y ecuador húmedo
    const belt = Math.exp(-((lat - 0.42) ** 2) / 0.012) * 0.28;
    const wet = Math.exp(-(lat ** 2) / 0.02) * 0.18;
    let m = 0.42 * mz.fbm(u * 7, v * 7, 5) + 0.32 * Math.exp(-Math.max(0, coastDist[i]) / 7) + 0.3 * shadow[i] - belt + wet;
    for (const z of params.climateZones) {
      const d = Math.hypot(u - z.x, (v - z.y) * (H / W) * 1.6);
      if (d < z.r) m += z.moisture * (1 - d / z.r);
    }
    moisture[i] = clamp(m, 0, 1);
  }

  // ---------------------------------------------------------------- biomas
  for (let i = 0; i < N; i++) {
    const e = elevation[i];
    if (e <= 0) { terrain[i] = TERRAIN.OCEAN; continue; }
    const t = temperature[i], m = moisture[i];
    let ter: number;
    if (t < 0.07) ter = TERRAIN.ICE;
    else if (e > 0.6) ter = TERRAIN.MOUNTAINS;
    else if (t < 0.2) ter = TERRAIN.TUNDRA;
    else if (e > 0.4) ter = TERRAIN.HILLS;
    else if (m < 0.24 && t > 0.42) ter = TERRAIN.DESERT;
    else if (m < 0.36) ter = t > 0.62 ? TERRAIN.SAVANNA : TERRAIN.STEPPE;
    else if (t > 0.72 && m > 0.6) ter = TERRAIN.JUNGLE;
    else if (t > 0.72 && m < 0.52) ter = TERRAIN.SAVANNA;
    else if (m > 0.58) ter = TERRAIN.FOREST;
    else if (m > 0.47) ter = TERRAIN.PLAINS;
    else ter = TERRAIN.GRASSLAND;
    if (e < 0.05 && m > 0.66 && coastDist[i] <= 3 && t > 0.3 && rng.chance(0.6)) ter = TERRAIN.MARSH;
    terrain[i] = ter;
  }

  // ---------------------------------------------------------------- drenaje: priority-flood
  const filled = new Float32Array(N);
  const downstream = new Int32Array(N).fill(-1);
  const visited = new Uint8Array(N);
  const heap = new MinHeap();
  for (let i = 0; i < N; i++) {
    if (elevation[i] <= 0) {
      visited[i] = 1;
      filled[i] = elevation[i];
      for (const n of neighborsOf(i, W, H, nb)) if (elevation[n] > 0) { heap.push(0, i); break; }
    }
  }
  const order: number[] = [];
  while (heap.size) {
    const [, c] = heap.pop();
    for (const n of neighborsOf(c, W, H, nb)) {
      if (visited[n]) continue;
      visited[n] = 1;
      filled[n] = Math.max(elevation[n], filled[c] + 1e-5);
      downstream[n] = c;
      order.push(n);
      heap.push(filled[n], n);
    }
  }
  const flow = new Float32Array(N);
  for (let k = order.length - 1; k >= 0; k--) {
    const c = order[k];
    flow[c] += 0.15 + moisture[c] * 1.2;
    const d = downstream[c];
    if (d >= 0 && elevation[d] > 0) flow[d] += flow[c];
  }
  // lagos en depresiones
  for (let i = 0; i < N; i++) {
    if (elevation[i] > 0 && filled[i] - elevation[i] > 0.04 && terrain[i] !== TERRAIN.ICE && moisture[i] > 0.35) terrain[i] = TERRAIN.LAKE;
  }
  const landFlows = order.filter((c) => !isWater(terrain[c])).map((c) => flow[c]).sort((a, b) => a - b);
  const riverT = landFlows[Math.floor(landFlows.length * 0.94)] ?? 1e9;
  const navT = landFlows[Math.floor(landFlows.length * 0.985)] ?? 1e9;
  const river = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (isWater(terrain[i])) continue;
    if (flow[i] >= navT && elevation[i] < 0.42) river[i] = 2;
    else if (flow[i] >= riverT) river[i] = 1;
  }

  // ---------------------------------------------------------------- masas de tierra
  const cellLandmass = new Int32Array(N).fill(-1);
  let landmassCells: number[][] = [];
  for (let i = 0; i < N; i++) {
    if (isWater(terrain[i]) || cellLandmass[i] >= 0) continue;
    const id = landmassCells.length;
    const cells = [i];
    cellLandmass[i] = id;
    for (let qi = 0; qi < cells.length; qi++) {
      for (const n of neighborsOf(cells[qi], W, H, nb)) {
        if (!isWater(terrain[n]) && cellLandmass[n] < 0) { cellLandmass[n] = id; cells.push(n); }
      }
    }
    landmassCells.push(cells);
  }
  // islotes diminutos -> mar costero (no jugables)
  for (const cells of landmassCells) {
    if (cells.length < 4) for (const c of cells) { terrain[c] = TERRAIN.SHALLOW; river[c] = 0; elevation[c] = -0.01; }
  }
  // lagos aislados de 1-2 celdas dentro de tierra -> pantano para no fragmentar provincias
  cellLandmass.fill(-1);
  landmassCells = [];
  for (let i = 0; i < N; i++) {
    if (isWater(terrain[i]) || cellLandmass[i] >= 0) continue;
    const id = landmassCells.length;
    const cells = [i];
    cellLandmass[i] = id;
    for (let qi = 0; qi < cells.length; qi++) {
      for (const n of neighborsOf(cells[qi], W, H, nb)) {
        if (!isWater(terrain[n]) && cellLandmass[n] < 0) { cellLandmass[n] = id; cells.push(n); }
      }
    }
    landmassCells.push(cells);
  }
  // mar costero
  for (let i = 0; i < N; i++) {
    if (terrain[i] !== TERRAIN.OCEAN) continue;
    for (const n of neighborsOf(i, W, H, nb)) {
      if (!isWater(terrain[n])) { terrain[i] = TERRAIN.SHALLOW; break; }
      for (const n2 of neighborsOf(n, W, H, nb2)) if (!isWater(terrain[n2]) && rng.chance(0.5)) { terrain[i] = TERRAIN.SHALLOW; break; }
      if (terrain[i] === TERRAIN.SHALLOW) break;
    }
  }

  // ---------------------------------------------------------------- recursos (campos continuos)
  const rf = {
    oil: new Float32Array(N), gas: new Float32Array(N), coal: new Float32Array(N), minerals: new Float32Array(N)
  };
  const oz = new Noise2D(params.seed + ':oil'), gz = new Noise2D(params.seed + ':gas');
  const cz = new Noise2D(params.seed + ':coal'), mnz = new Noise2D(params.seed + ':min');
  for (let i = 0; i < N; i++) {
    if (isWater(terrain[i]) && terrain[i] !== TERRAIN.SHALLOW) continue;
    const col = i % W, row = (i - col) / W;
    const u = col / W, v = row / H;
    const t = terrain[i];
    const sedimentary = t === TERRAIN.DESERT || t === TERRAIN.PLAINS || t === TERRAIN.STEPPE || t === TERRAIN.MARSH || t === TERRAIN.SHALLOW || t === TERRAIN.TUNDRA || t === TERRAIN.SAVANNA || t === TERRAIN.JUNGLE;
    let oil = sedimentary ? Math.max(0, oz.fbm(u * 11, v * 11, 4) - 0.63) * 6 : 0;
    let gas = sedimentary || t === TERRAIN.HILLS ? Math.max(0, gz.fbm(u * 10, v * 10, 4) - 0.64) * 5 + oil * 0.35 : 0;
    let coal = (t === TERRAIN.HILLS || t === TERRAIN.PLAINS || t === TERRAIN.FOREST || t === TERRAIN.STEPPE) ? Math.max(0, cz.fbm(u * 9, v * 9, 4) - 0.6) * 4 : 0;
    let min = (t === TERRAIN.MOUNTAINS || t === TERRAIN.HILLS || t === TERRAIN.DESERT) ? Math.max(0, mnz.fbm(u * 12, v * 12, 4) - 0.52) * 3.5 * (t === TERRAIN.MOUNTAINS ? 1.4 : 1) : 0;
    for (const h of params.hotspots) {
      const d = Math.hypot(u - h.x, (v - h.y) * (H / W) * 1.6);
      if (d < h.r) {
        const add = h.amount * (1 - d / h.r);
        if (h.resource === 'oil' && sedimentary) oil += add;
        else if (h.resource === 'gas') gas += add;
        else if (h.resource === 'coal') coal += add;
        else if (h.resource === 'minerals') min += add;
      }
    }
    rf.oil[i] = oil; rf.gas[i] = gas; rf.coal[i] = coal; rf.minerals[i] = min;
  }

  // ---------------------------------------------------------------- provincias
  const habit = (c: number): number => {
    const t = terrain[c];
    const base = t === TERRAIN.PLAINS ? 1 : t === TERRAIN.GRASSLAND ? 0.9 : t === TERRAIN.SAVANNA ? 0.6 : t === TERRAIN.FOREST ? 0.55 :
      t === TERRAIN.HILLS ? 0.6 : t === TERRAIN.STEPPE ? 0.45 : t === TERRAIN.JUNGLE ? 0.4 : t === TERRAIN.MARSH ? 0.3 :
      t === TERRAIN.MOUNTAINS ? 0.2 : t === TERRAIN.DESERT ? 0.12 : t === TERRAIN.TUNDRA ? 0.12 : 0.02;
    return base * (river[c] ? 1.35 : 1) * (coastDist[c] <= 1 ? 1.2 : 1);
  };
  const landCells: number[] = [];
  for (let i = 0; i < N; i++) if (!isWater(terrain[i])) landCells.push(i);
  const target = Math.max(1, Math.round(landCells.length / params.provinceCells));
  const seeds: number[] = [];
  const seedMark = new Int32Array(N).fill(-1);
  const baseR = Math.sqrt(params.provinceCells) * 0.95;
  const centers = landCells.map((c) => cellCenter(c, W));
  const candidates = rng.shuffle(landCells.map((_, k) => k));
  const tooClose = (k: number, r: number): boolean => {
    const [x, y] = centers[k];
    for (const s of seeds) {
      const [sx, sy] = cellCenter(s, W);
      if ((x - sx) ** 2 + (y - sy) ** 2 < r * r) return true;
    }
    return false;
  };
  for (let pass = 0; pass < 3 && seeds.length < target; pass++) {
    for (const k of candidates) {
      if (seeds.length >= target * 1.05) break;
      const c = landCells[k];
      if (seedMark[c] >= 0) continue;
      const r = baseR * 1.7 * (1.3 - 0.45 * Math.min(1, habit(c))) * (1 - pass * 0.18);
      if (tooClose(k, r)) continue;
      seedMark[c] = seeds.length;
      seeds.push(c);
    }
  }
  // cada masa de tierra recibe al menos una semilla
  for (const cells of landmassCells) {
    if (cells.length < 4) continue;
    if (!cells.some((c) => seedMark[c] >= 0)) {
      const c = cells[Math.floor(cells.length / 2)];
      seedMark[c] = seeds.length;
      seeds.push(c);
    }
  }
  const cellProvince = new Int32Array(N).fill(-1);
  const growCost = new Float64Array(N).fill(Infinity);
  const jitter = new Noise2D(params.seed + ':jit');
  const ph = new MinHeap();
  seeds.forEach((s, k) => { growCost[s] = 0; cellProvince[s] = k; ph.push(0, s); });
  while (ph.size) {
    const [cost, c] = ph.pop();
    if (cost > growCost[c]) continue;
    const k = cellProvince[c];
    for (const n of neighborsOf(c, W, H, nb)) {
      if (isWater(terrain[n])) continue;
      const t = terrain[n];
      let step = 1;
      if (t === TERRAIN.MOUNTAINS) step += 2.2;
      else if (t === TERRAIN.HILLS) step += 0.6;
      if ((river[n] > 0) !== (river[c] > 0)) step += 1.4;
      const col = n % W, row = (n - col) / W;
      step += jitter.value(col * 0.45, row * 0.45) * 0.6;
      const nc = cost + step;
      if (nc < growCost[n]) { growCost[n] = nc; cellProvince[n] = k; ph.push(nc, n); }
    }
  }
  // agrupar celdas
  let provCells: number[][] = seeds.map(() => []);
  for (const c of landCells) if (cellProvince[c] >= 0) provCells[cellProvince[c]].push(c);
  // fusionar provincias diminutas
  const minCells = Math.max(4, Math.round(params.provinceCells * 0.28));
  for (let iter = 0; iter < 4; iter++) {
    let changed = false;
    for (let k = 0; k < provCells.length; k++) {
      const cells = provCells[k];
      if (cells.length === 0 || cells.length >= minCells) continue;
      const counts = new Map<number, number>();
      for (const c of cells) for (const n of neighborsOf(c, W, H, nb)) {
        const o = cellProvince[n];
        if (o >= 0 && o !== k) counts.set(o, (counts.get(o) ?? 0) + 1);
      }
      if (counts.size === 0) continue; // isla sola: se mantiene
      let best = -1, bestCount = -1;
      for (const [o, cnt] of counts) if (cnt > bestCount) { best = o; bestCount = cnt; }
      for (const c of cells) { cellProvince[c] = best; provCells[best].push(c); }
      provCells[k] = [];
      changed = true;
    }
    if (!changed) break;
  }
  // reindexar
  const remap = new Int32Array(provCells.length).fill(-1);
  const finalCells: number[][] = [];
  provCells.forEach((cells, k) => { if (cells.length) { remap[k] = finalCells.length; finalCells.push(cells); } });
  for (const c of landCells) cellProvince[c] = cellProvince[c] >= 0 ? remap[cellProvince[c]] : -1;
  provCells = finalCells;

  // ---------------------------------------------------------------- zonas marítimas
  const seaCells: number[] = [];
  for (let i = 0; i < N; i++) if (isSea(terrain[i])) seaCells.push(i);
  const cellSea = new Int32Array(N).fill(-1);
  const seaSeeds: number[] = [];
  const seaR = Math.sqrt(params.seaZoneCells) * 1.15;
  for (const c of rng.shuffle([...seaCells])) {
    const [x, y] = cellCenter(c, W);
    let ok = true;
    for (const s of seaSeeds) {
      const [sx, sy] = cellCenter(s, W);
      if ((x - sx) ** 2 + (y - sy) ** 2 < seaR * seaR) { ok = false; break; }
    }
    if (ok) seaSeeds.push(c);
  }
  const seaCost = new Float64Array(N).fill(Infinity);
  const sh = new MinHeap();
  seaSeeds.forEach((s, k) => { seaCost[s] = 0; cellSea[s] = k; sh.push(0, s); });
  while (sh.size) {
    const [cost, c] = sh.pop();
    if (cost > seaCost[c]) continue;
    for (const n of neighborsOf(c, W, H, nb)) {
      if (!isSea(terrain[n])) continue;
      const nc = cost + 1;
      if (nc < seaCost[n]) { seaCost[n] = nc; cellSea[n] = cellSea[c]; sh.push(nc, n); }
    }
  }
  // componentes marinos aislados que no recibieron semilla: cada uno forma su propia zona
  for (const c of seaCells) {
    if (cellSea[c] >= 0) continue;
    const k = seaSeeds.length;
    seaSeeds.push(c);
    cellSea[c] = k;
    const q = [c];
    for (let qi = 0; qi < q.length; qi++) for (const n of neighborsOf(q[qi], W, H, nb)) if (isSea(terrain[n]) && cellSea[n] < 0) { cellSea[n] = k; q.push(n); }
  }
  let seaGroups: number[][] = seaSeeds.map(() => []);
  for (const c of seaCells) if (cellSea[c] >= 0) seaGroups[cellSea[c]].push(c);
  // fusionar zonas pequeñas
  for (let k = 0; k < seaGroups.length; k++) {
    const cells = seaGroups[k];
    if (!cells.length || cells.length >= params.seaZoneCells * 0.25) continue;
    const counts = new Map<number, number>();
    for (const c of cells) for (const n of neighborsOf(c, W, H, nb)) {
      const o = cellSea[n];
      if (o >= 0 && o !== k) counts.set(o, (counts.get(o) ?? 0) + 1);
    }
    if (!counts.size) continue;
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    for (const c of cells) { cellSea[c] = best; seaGroups[best].push(c); }
    seaGroups[k] = [];
  }
  const seaRemap = new Int32Array(seaGroups.length).fill(-1);
  const seaFinal: number[][] = [];
  seaGroups.forEach((cells, k) => { if (cells.length) { seaRemap[k] = seaFinal.length; seaFinal.push(cells); } });
  for (const c of seaCells) cellSea[c] = cellSea[c] >= 0 ? seaRemap[cellSea[c]] : -1;
  seaGroups = seaFinal;

  // ---------------------------------------------------------------- adyacencias
  const anchorOf = (cells: number[]): number => {
    let sx = 0, sy = 0;
    for (const c of cells) { const [x, y] = cellCenter(c, W); sx += x; sy += y; }
    sx /= cells.length; sy /= cells.length;
    let best = cells[0], bd = Infinity;
    for (const c of cells) {
      const [x, y] = cellCenter(c, W);
      // preferir celdas interiores
      let interior = 0;
      for (const n of neighborsOf(c, W, H, nb)) if (cellProvince[n] === cellProvince[c] || cellSea[n] === cellSea[c]) interior++;
      const d = (x - sx) ** 2 + (y - sy) ** 2 + (6 - interior) * 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
  const provinces: GeoProvince[] = provCells.map((cells, idx) => ({
    idx, cells, landmass: cellLandmass[cells[0]], anchor: anchorOf(cells), neighbors: new Map(), seaZones: new Set()
  }));
  const seaZones: GeoSeaZone[] = seaGroups.map((cells, idx) => {
    let deep = 0;
    for (const c of cells) if (terrain[c] === TERRAIN.OCEAN) deep++;
    return { idx, cells, anchor: anchorOf(cells), neighbors: new Set(), provinces: new Set(), deep: deep > cells.length * 0.5 };
  });
  for (const p of provinces) {
    for (const c of p.cells) {
      for (const n of neighborsOf(c, W, H, nb)) {
        const o = cellProvince[n];
        if (o >= 0 && o !== p.idx) {
          const link = p.neighbors.get(o) ?? { border: 0, river: 0, strait: false };
          link.border++;
          if (river[c] || river[n]) link.river++;
          p.neighbors.set(o, link);
        } else if (cellSea[n] >= 0) {
          p.seaZones.add(cellSea[n]);
          seaZones[cellSea[n]].provinces.add(p.idx);
        }
      }
    }
  }
  // estrechos: canales de una o dos celdas de mar entre provincias de distintas masas de tierra
  for (const c of seaCells) {
    const touching = new Set<number>();
    for (const n of neighborsOf(c, W, H, nb)) {
      if (cellProvince[n] >= 0) touching.add(cellProvince[n]);
      else if (cellSea[n] >= 0) for (const m of neighborsOf(n, W, H, nb)) if (cellProvince[m] >= 0) touching.add(cellProvince[m]);
    }
    const list = [...touching];
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const pa = provinces[list[a]], pb = provinces[list[b]];
      if (pa.landmass === pb.landmass || pa.neighbors.has(pb.idx)) continue;
      pa.neighbors.set(pb.idx, { border: 1, river: 0, strait: true });
      pb.neighbors.set(pa.idx, { border: 1, river: 0, strait: true });
    }
  }
  for (const z of seaZones) {
    for (const c of z.cells) for (const n of neighborsOf(c, W, H, nb)) {
      const o = cellSea[n];
      if (o >= 0 && o !== z.idx) z.neighbors.add(o);
    }
  }

  // ---------------------------------------------------------------- masas: tipo y agrupamiento
  const landmasses: GeoLandmass[] = landmassCells.map((cells, id) => ({
    id, cells, provinces: [], kind: cells.length > 380 ? 'continent' : 'island', group: id
  }));
  for (const p of provinces) landmasses[p.landmass].provinces.push(p.idx);
  // archipiélagos: islas cercanas entre sí
  const parent = landmasses.map((l) => l.id);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const islandList = landmasses.filter((l) => l.kind === 'island' && l.cells.length >= 4);
  const centroid = (cells: number[]): [number, number] => {
    let sx = 0, sy = 0;
    for (const c of cells) { const [x, y] = cellCenter(c, W); sx += x; sy += y; }
    return [sx / cells.length, sy / cells.length];
  };
  const cents = new Map(islandList.map((l) => [l.id, centroid(l.cells)]));
  for (let a = 0; a < islandList.length; a++) for (let b = a + 1; b < islandList.length; b++) {
    const ca = cents.get(islandList[a].id)!, cb = cents.get(islandList[b].id)!;
    if (Math.hypot(ca[0] - cb[0], ca[1] - cb[1]) < 16) parent[find(islandList[a].id)] = find(islandList[b].id);
  }
  const groupSize = new Map<number, number>();
  for (const l of islandList) groupSize.set(find(l.id), (groupSize.get(find(l.id)) ?? 0) + 1);
  for (const l of islandList) { l.group = find(l.id); if ((groupSize.get(l.group) ?? 0) >= 3) l.kind = 'archipelago'; }

  // ---------------------------------------------------------------- trazado de ríos
  const riverPaths: { cells: number[]; navigable: boolean }[] = [];
  const hasUpstreamRiver = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (river[i] && downstream[i] >= 0) hasUpstreamRiver[downstream[i]] = 1;
  const usedRiver = new Uint8Array(N);
  const sources = [];
  for (let i = 0; i < N; i++) if (river[i] && !hasUpstreamRiver[i]) sources.push(i);
  sources.sort((a, b) => elevation[b] - elevation[a]);
  for (const s of sources) {
    const path: number[] = [];
    let c = s, nav = false;
    while (c >= 0 && !usedRiver[c]) {
      path.push(c);
      usedRiver[c] = 1;
      if (river[c] === 2) nav = true;
      const d = downstream[c];
      if (d < 0) break;
      if (isWater(terrain[d])) { path.push(d); break; }
      c = d;
    }
    if (c >= 0 && usedRiver[c] && path[path.length - 1] !== c) path.push(c);
    if (path.length >= 3) riverPaths.push({ cells: path, navigable: nav });
  }

  // ---------------------------------------------------------------- componentes con nombre
  const components: GeoComponent[] = [];
  const compMark = new Uint8Array(N);
  const collect = (start: number, pred: (c: number) => boolean): number[] => {
    const out = [start];
    compMark[start] = 1;
    for (let qi = 0; qi < out.length; qi++) for (const n of neighborsOf(out[qi], W, H, nb)) if (!compMark[n] && pred(n)) { compMark[n] = 1; out.push(n); }
    return out;
  };
  for (let i = 0; i < N; i++) {
    if (compMark[i]) continue;
    const t = terrain[i];
    if (t === TERRAIN.MOUNTAINS) {
      const cells = collect(i, (c) => terrain[c] === TERRAIN.MOUNTAINS || terrain[c] === TERRAIN.HILLS && elevation[c] > 0.5);
      if (cells.length >= 10) components.push({ kind: 'mountains', cells, anchor: anchorOf(cells) });
    } else if (t === TERRAIN.DESERT) {
      const cells = collect(i, (c) => terrain[c] === TERRAIN.DESERT);
      if (cells.length >= 14) components.push({ kind: 'desert', cells, anchor: anchorOf(cells) });
    } else if (t === TERRAIN.JUNGLE || t === TERRAIN.FOREST) {
      const cells = collect(i, (c) => terrain[c] === t);
      if (cells.length >= 40) components.push({ kind: 'forest', cells, anchor: anchorOf(cells) });
    } else if (t === TERRAIN.LAKE) {
      const cells = collect(i, (c) => terrain[c] === TERRAIN.LAKE);
      if (cells.length >= 3) components.push({ kind: 'lake', cells, anchor: cells[0] });
    } else if (t === TERRAIN.STEPPE || t === TERRAIN.PLAINS || t === TERRAIN.GRASSLAND) {
      const cells = collect(i, (c) => terrain[c] === t);
      if (cells.length >= 90) components.push({ kind: 'plains', cells, anchor: anchorOf(cells) });
    }
  }

  return {
    params, width: W, height: H, terrain, elevation, temperature, moisture, river, flow, riverPaths,
    cellProvince, cellSea, cellLandmass, provinces, seaZones, landmasses, components, resourceField: rf
  };
}

/** Conectividad: devuelve los errores encontrados (lista vacía = mapa jugable). */
export function validateGeography(g: GeoResult): string[] {
  const errors: string[] = [];
  const W = g.width, H = g.height;
  const nb: number[] = [];
  for (const p of g.provinces) {
    if (!p.cells.length) { errors.push(`provincia ${p.idx} vacía`); continue; }
    // celdas conexas
    const set = new Set(p.cells);
    const seen = new Set([p.cells[0]]);
    const q = [p.cells[0]];
    for (let qi = 0; qi < q.length; qi++) for (const n of neighborsOf(q[qi], W, H, nb)) if (set.has(n) && !seen.has(n)) { seen.add(n); q.push(n); }
    if (seen.size !== set.size) errors.push(`provincia ${p.idx} no es contigua (${seen.size}/${set.size})`);
    for (const [o] of p.neighbors) if (!g.provinces[o].neighbors.has(p.idx)) errors.push(`adyacencia asimétrica ${p.idx}-${o}`);
    for (const z of p.seaZones) if (!g.seaZones[z].provinces.has(p.idx)) errors.push(`costa asimétrica ${p.idx}-${z}`);
  }
  for (const z of g.seaZones) for (const o of z.neighbors) if (!g.seaZones[o].neighbors.has(z.idx)) errors.push(`mar asimétrico ${z.idx}-${o}`);
  for (const l of g.landmasses) {
    if (l.cells.length >= 4 && l.provinces.length === 0) errors.push(`masa ${l.id} sin provincias`);
    // las provincias de una masa deben estar conectadas por tierra entre sí
    if (l.provinces.length > 1) {
      const seen = new Set([l.provinces[0]]);
      const q = [l.provinces[0]];
      for (let qi = 0; qi < q.length; qi++) for (const [o, link] of g.provinces[q[qi]].neighbors) if (!link.strait && !seen.has(o)) { seen.add(o); q.push(o); }
      if (seen.size !== l.provinces.length) errors.push(`masa ${l.id}: provincias desconectadas`);
    }
  }
  // toda celda de tierra pertenece a una provincia y toda celda marina a una zona
  for (let i = 0; i < W * H; i++) {
    const t = g.terrain[i];
    if (!isWater(t) && g.cellProvince[i] < 0) { errors.push(`celda de tierra ${i} sin provincia`); break; }
    if (isSea(t) && g.cellSea[i] < 0) { errors.push(`celda marina ${i} sin zona`); break; }
  }
  return errors;
}

export function crossingKind(link: { border: number; river: number; strait: boolean }): CrossingKind {
  if (link.strait) return 'strait';
  return link.river / Math.max(1, link.border) > 0.4 ? 'river' : 'land';
}
