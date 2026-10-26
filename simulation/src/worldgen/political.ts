import {
  TERRAIN, cellCenter, encodeU16, encodeU8,
  type ProvinceStatic, type SeaZoneStatic, type LandmassStatic, type WorldMap, type MapFeature, type Climate, type ResourceDeposits
} from '@cyo/shared';
import { Rng, Noise2D, clamp } from '../rng.js';
import { TERRAIN_INFO, isSea, isWater } from '../data/terrain.js';
import { generateGeography, validateGeography, crossingKind, type GeoResult } from './geography.js';
import { NameRegistry } from './names.js';
import type { WorldDesign } from '../scenario/design.js';

export const GENERATOR_VERSION = '1.1.0';

export interface PoliticalResult {
  map: WorldMap;
  geo: GeoResult;
  /** país propietario de cada provincia (clave de diseño) */
  owner: string[];
  capitals: Record<string, number>;
  claims: Record<string, number[]>;
  errors: string[];
}

/** Distancia entre provincias (unidades de hex). */
function provCenter(g: GeoResult, idx: number): [number, number] { return cellCenter(g.provinces[idx].anchor, g.width); }

export function buildPolitical(design: WorldDesign): PoliticalResult {
  const geo = generateGeography(design.geo);
  const errors = validateGeography(geo);
  const W = geo.width, H = geo.height;
  const rng = new Rng(design.seed + ':political');
  const names = new NameRegistry(rng.fork('names'));
  for (const c of design.countries) names.reserve(c.name);
  const toNorm = (cell: number): [number, number] => {
    const col = cell % W, row = (cell - col) / W;
    return [(col + 0.5 * (row & 1)) / W, row / H];
  };
  const fromNorm = (x: number, y: number): number => {
    const row = clamp(Math.round(y * H), 0, H - 1);
    const col = clamp(Math.round(x * W - 0.5 * (row & 1)), 0, W - 1);
    return row * W + col;
  };
  const P = geo.provinces.length;

  // ------------------------------------------------------------ capitales
  const capitals: Record<string, number> = {};
  const usedCap = new Set<number>();
  for (const c of design.countries) {
    const target = fromNorm(c.anchor[0], c.anchor[1]);
    const [tx, ty] = cellCenter(target, W);
    let best = -1, bd = Infinity;
    for (const p of geo.provinces) {
      if (usedCap.has(p.idx)) continue;
      const [x, y] = cellCenter(p.anchor, W);
      const d = (x - tx) ** 2 + (y - ty) ** 2;
      if (d < bd) { bd = d; best = p.idx; }
    }
    if (best < 0) { errors.push(`sin provincia para la capital de ${c.name}`); continue; }
    capitals[c.key] = best;
    usedCap.add(best);
  }

  // ------------------------------------------------------------ crecimiento territorial con pesos ajustados
  const keys = design.countries.map((c) => c.key).filter((k) => capitals[k] !== undefined);
  const landmassOf = (k: string) => geo.provinces[capitals[k]].landmass;
  const mult: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 1]));
  const weight: Record<string, number> = Object.fromEntries(design.countries.map((c) => [c.key, c.weight]));
  let owner = new Array<string>(P).fill('');
  const edgeCost = (a: number, b: number, kind: string): number => {
    const [ax, ay] = provCenter(geo, a), [bx, by] = provCenter(geo, b);
    const d = Math.hypot(ax - bx, ay - by);
    const rough = 1 + 0.6 * (TERRAIN_INFO[geoTerrain(geo, b)].move - 1);
    return d * rough * (kind === 'river' ? 1.6 : kind === 'strait' ? 5 : 1);
  };
  for (let iter = 0; iter < 10; iter++) {
    const best = new Float64Array(P).fill(Infinity);
    owner = new Array<string>(P).fill('');
    // Dijkstra con varias fuentes: cada país expande con coste / (peso * multiplicador)
    const frontier: [number, number, string][] = [];
    for (const k of keys) { best[capitals[k]] = 0; owner[capitals[k]] = k; frontier.push([0, capitals[k], k]); }
    while (frontier.length) {
      let mi = 0;
      for (let i = 1; i < frontier.length; i++) if (frontier[i][0] < frontier[mi][0]) mi = i;
      const [cost, p, k] = frontier[mi];
      frontier[mi] = frontier[frontier.length - 1];
      frontier.pop();
      if (cost > best[p] || owner[p] !== k) continue;
      for (const [o, link] of geo.provinces[p].neighbors) {
        const kind = crossingKind(link);
        if (kind === 'strait' && geo.provinces[o].landmass !== landmassOf(k)) continue;
        const nc = cost + edgeCost(p, o, kind) / (weight[k] * mult[k]);
        if (nc < best[o] && !usedCapOther(o, k)) { best[o] = nc; owner[o] = k; frontier.push([nc, o, k]); }
      }
    }
    // ajustar multiplicadores hacia el área objetivo por masa continental
    const byLand = new Map<number, string[]>();
    for (const k of keys) { const l = landmassOf(k); byLand.set(l, [...(byLand.get(l) ?? []), k]); }
    const counts: Record<string, number> = {};
    for (const o of owner) if (o) counts[o] = (counts[o] ?? 0) + 1;
    for (const [l, ks] of byLand) {
      const total = geo.landmasses[l].provinces.length;
      const wsum = ks.reduce((s, k) => s + weight[k], 0);
      for (const k of ks) {
        const target = Math.max(1, (total * weight[k]) / wsum);
        mult[k] *= Math.pow(target / Math.max(1, counts[k] ?? 1), 0.6);
      }
    }
  }
  function usedCapOther(p: number, k: string): boolean { return usedCap.has(p) && capitals[k] !== p; }

  // ------------------------------------------------------------ territorios de ultramar y masas sin capital
  for (const t of design.territories) {
    const cell = fromNorm(t.x, t.y);
    let lm = geo.cellLandmass[cell];
    if (lm < 0) {
      // buscar la masa más cercana
      let bd = Infinity;
      const [tx, ty] = cellCenter(cell, W);
      for (const p of geo.provinces) {
        const [x, y] = cellCenter(p.anchor, W);
        const d = (x - tx) ** 2 + (y - ty) ** 2;
        if (d < bd) { bd = d; lm = p.landmass; }
      }
    }
    if (lm >= 0 && capitals[t.owner] !== undefined) for (const p of geo.landmasses[lm].provinces) if (!owner[p]) owner[p] = t.owner;
  }
  for (const p of geo.provinces) {
    if (owner[p.idx]) continue;
    const [x, y] = provCenter(geo, p.idx);
    let bk = keys[0], bd = Infinity;
    for (const k of keys) {
      const [cx, cy] = provCenter(geo, capitals[k]);
      const d = Math.hypot(cx - x, cy - y) / Math.sqrt(weight[k]);
      if (d < bd) { bd = d; bk = k; }
    }
    // flood del resto de la masa con el mismo dueño
    for (const q of geo.landmasses[p.landmass].provinces) if (!owner[q]) owner[q] = bk;
  }

  // ------------------------------------------------------------ culturas y religiones
  const jitter = new Noise2D(design.seed + ':culture');
  const countryByKey = Object.fromEntries(design.countries.map((c) => [c.key, c]));
  const cultureAnchors: { id: string; x: number; y: number; w: number }[] = [];
  for (const c of design.cultures) for (const [x, y] of c.anchors) cultureAnchors.push({ id: c.id, x, y, w: 1 });
  const religionAnchors: { id: string; x: number; y: number; w: number }[] = [];
  for (const r of design.religions) for (const [x, y] of r.anchors) religionAnchors.push({ id: r.id, x, y, w: 1 });
  const provCulture: string[] = [];
  const provReligion: string[] = [];
  for (const p of geo.provinces) {
    const [x, y] = toNorm(p.anchor);
    const own = countryByKey[owner[p.idx]];
    const [ox, oy] = own ? toNorm(geo.provinces[capitals[own.key]].anchor) : [x, y];
    // la cultura del propio país domina salvo que haya un ancla minoritaria más cercana
    const dOwn = Math.hypot(x - ox, (y - oy) * 0.7) * 0.55;
    let bestC = own?.culture ?? cultureAnchors[0].id, bd = own ? dOwn : Infinity;
    for (const a of cultureAnchors) {
      const d = Math.hypot(x - a.x, (y - a.y) * 0.7) + (jitter.value(x * 30, y * 30) - 0.5) * 0.02;
      if (d < bd) { bd = d; bestC = a.id; }
    }
    provCulture.push(bestC);
    let bestR = own?.religion ?? religionAnchors[0].id, br = own ? dOwn * 1.2 : Infinity;
    for (const a of religionAnchors) {
      const d = Math.hypot(x - a.x, (y - a.y) * 0.7);
      if (d < br) { br = d; bestR = a.id; }
    }
    provReligion.push(bestR);
  }

  // ------------------------------------------------------------ reivindicaciones
  const claims: Record<string, number[]> = {};
  for (const cl of design.claims) {
    for (const p of geo.provinces) {
      const [x, y] = toNorm(p.anchor);
      if (Math.hypot(x - cl.x, (y - cl.y) * 0.7) <= cl.r && owner[p.idx] !== cl.claimant) {
        (claims[cl.claimant] ??= []).push(p.idx);
      }
    }
  }

  // ------------------------------------------------------------ recursos normalizados
  const raw: ResourceDeposits[] = geo.provinces.map(() => ({ oil: 0, gas: 0, coal: 0, minerals: 0, fertile: 0, timber: 0, fish: 0, hydro: 0 }));
  const nb: number[] = [];
  for (const p of geo.provinces) {
    const r = raw[p.idx];
    for (const c of p.cells) {
      const t = geo.terrain[c];
      r.oil += geo.resourceField.oil[c];
      r.gas += geo.resourceField.gas[c];
      r.coal += geo.resourceField.coal[c];
      r.minerals += geo.resourceField.minerals[c];
      const fert = t === TERRAIN.PLAINS ? 1 : t === TERRAIN.GRASSLAND ? 0.8 : t === TERRAIN.SAVANNA ? 0.5 : t === TERRAIN.FOREST ? 0.3 : t === TERRAIN.STEPPE ? 0.35 : t === TERRAIN.HILLS ? 0.3 : t === TERRAIN.JUNGLE ? 0.25 : t === TERRAIN.MARSH ? 0.2 : 0.03;
      r.fertile += fert * (0.6 + geo.moisture[c] * 0.6) * (geo.river[c] ? 1.5 : 1) * clamp(geo.temperature[c] * 1.6, 0.1, 1);
      if (t === TERRAIN.FOREST || t === TERRAIN.JUNGLE) r.timber += 1; else if (t === TERRAIN.TUNDRA || t === TERRAIN.HILLS) r.timber += 0.2;
      if (geo.river[c] && geo.elevation[c] > 0.3) r.hydro += geo.elevation[c] * (geo.river[c] === 2 ? 2 : 1);
    }
    // pesca: costa con mar costero
    for (const z of p.seaZones) r.fish += Math.min(4, geo.seaZones[z].cells.length / 60);
    for (const c of p.cells) for (const n of [0]) void n;
    void nb;
  }
  // normalización: totales mundiales coherentes con una economía mundial de ~1990 (miles de millones de UMI)
  const totals = { oil: 0, gas: 0, coal: 0, minerals: 0 };
  for (const r of raw) { totals.oil += r.oil; totals.gas += r.gas; totals.coal += r.coal; totals.minerals += r.minerals; }
  const targetReserve = { oil: 26000, gas: 15000, coal: 22000, minerals: 30000 };
  for (const r of raw) {
    r.oil = round1(r.oil * targetReserve.oil / Math.max(1e-6, totals.oil));
    r.gas = round1(r.gas * targetReserve.gas / Math.max(1e-6, totals.gas));
    r.coal = round1(r.coal * targetReserve.coal / Math.max(1e-6, totals.coal));
    r.minerals = round1(r.minerals * targetReserve.minerals / Math.max(1e-6, totals.minerals));
    r.fertile = round1(r.fertile);
    r.timber = round1(r.timber);
    r.fish = round1(r.fish);
    r.hydro = round1(r.hydro);
  }

  // ------------------------------------------------------------ provincias estáticas
  const cultureLang = Object.fromEntries(design.cultures.map((c) => [c.id, c.language]));
  const provinces: ProvinceStatic[] = geo.provinces.map((p) => {
    const terrCount = new Map<number, number>();
    let rough = 0, temp = 0, moist = 0, riverMax: 0 | 1 | 2 = 0, coastalCells = 0;
    for (const c of p.cells) {
      const t = geo.terrain[c];
      terrCount.set(t, (terrCount.get(t) ?? 0) + 1);
      rough += t === TERRAIN.MOUNTAINS ? 1 : t === TERRAIN.HILLS ? 0.5 : t === TERRAIN.JUNGLE ? 0.6 : t === TERRAIN.FOREST ? 0.35 : t === TERRAIN.MARSH ? 0.4 : 0;
      temp += geo.temperature[c];
      moist += geo.moisture[c];
      if (geo.river[c] > riverMax) riverMax = geo.river[c] as 0 | 1 | 2;
    }
    for (const c of p.cells) {
      let coast = false;
      for (const z of p.seaZones) void z;
      for (const n of neighborsList(c, W, H)) if (isSea(geo.terrain[n])) coast = true;
      if (coast) coastalCells++;
    }
    const n = p.cells.length;
    const dominant = [...terrCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
    temp /= n; moist /= n;
    const climate: Climate = temp < 0.22 ? 'polar' : temp < 0.4 ? 'cold' : moist < 0.3 && temp > 0.45 ? 'arid' : temp > 0.7 ? 'tropical' : 'temperate';
    let hab = 0;
    for (const c of p.cells) hab += TERRAIN_INFO[geo.terrain[c]].habitability;
    hab = hab / n * (riverMax ? 1.25 : 1) * (coastalCells ? 1.15 : 1) * (climate === 'polar' ? 0.4 : climate === 'arid' ? 0.7 : 1);
    const lang = cultureLang[provCulture[p.idx]] ?? 'aurel';
    const name = names.place(lang);
    const cityName = rng.chance(0.55) ? name : names.place(lang);
    const neighbors = [...p.neighbors.entries()].map(([o, link]) => ({ to: pid(o), kind: crossingKind(link), border: link.border }));
    const [cx, cy] = cellCenter(p.anchor, W);
    return {
      id: pid(p.idx), idx: p.idx, name, cityName, landmass: p.landmass, cells: n, cx: round2(cx), cy: round2(cy),
      terrain: dominant as ProvinceStatic['terrain'], roughness: round2(rough / n), climate,
      coastal: p.seaZones.size > 0, harbor: p.seaZones.size > 0 && (riverMax > 0 || rng.chance(0.55)),
      seaZones: [...p.seaZones].map(sid), neighbors, river: riverMax, resources: raw[p.idx],
      habitability: round2(hab), culture: provCulture[p.idx], religion: provReligion[p.idx]
    };
  });
  // las capitales costeras siempre tienen puerto natural
  for (const k of keys) { const cp = provinces[capitals[k]]; if (cp.coastal) cp.harbor = true; cp.cityName = countryByKey[k].capitalName; }

  // ------------------------------------------------------------ zonas marítimas y masas
  const nearestLang = (cell: number): string => {
    const [x, y] = cellCenter(cell, W);
    let bd = Infinity, lang = 'aurel';
    for (const p of provinces) {
      const d = (p.cx - x) ** 2 + (p.cy - y) ** 2;
      if (d < bd) { bd = d; lang = cultureLang[p.culture] ?? 'aurel'; }
    }
    return lang;
  };
  const seaZones: SeaZoneStatic[] = geo.seaZones.map((z) => {
    const [cx, cy] = cellCenter(z.anchor, W);
    const prov = [...z.provinces];
    const label = prov.length ? `${z.deep ? 'Aguas de' : 'Mar de'} ${provinces[prov[0]].name}` : `Alta mar ${names.feature(nearestLang(z.anchor))}`;
    return { id: sid(z.idx), idx: z.idx, name: label, cells: z.cells.length, cx: round2(cx), cy: round2(cy), neighbors: [...z.neighbors].map(sid), provinces: prov.map(pid), deep: z.deep };
  });
  const groupNames = new Map<number, string>();
  const landmasses: LandmassStatic[] = geo.landmasses.map((l) => {
    let name: string;
    const designName = design.oceans.length ? null : null;
    void designName;
    const lang = nearestLang(l.cells[0]);
    if (l.kind === 'archipelago') {
      if (!groupNames.has(l.group)) groupNames.set(l.group, `Archipiélago de ${names.feature(lang)}`);
      name = groupNames.get(l.group)!;
    } else if (l.kind === 'island') name = `Isla de ${names.feature(lang)}`;
    else name = names.feature(lang);
    return { id: l.id, name, kind: l.kind, cells: l.cells.length, provinces: l.provinces.map(pid) };
  });

  // ------------------------------------------------------------ rasgos con nombre
  const features: MapFeature[] = [];
  for (const o of design.oceans) {
    const cell = fromNorm(o.x, o.y);
    const [cx, cy] = cellCenter(cell, W);
    features.push({ kind: 'ocean', name: o.name, cx: round2(cx), cy: round2(cy) });
  }
  for (const comp of geo.components) {
    const lang = nearestLang(comp.anchor);
    const [cx, cy] = cellCenter(comp.anchor, W);
    const base = names.feature(lang);
    const name = comp.kind === 'mountains' ? (comp.cells.length > 60 ? `Cordillera ${base}` : `Montes ${base}`) :
      comp.kind === 'desert' ? `Desierto de ${base}` : comp.kind === 'forest' ? (geo.terrain[comp.anchor] === TERRAIN.JUNGLE ? `Selva de ${base}` : `Bosque de ${base}`) :
      comp.kind === 'lake' ? `Lago ${base}` : `Llanura de ${base}`;
    features.push({ kind: comp.kind, name, cx: round2(cx), cy: round2(cy) });
  }
  const rivers = geo.riverPaths
    .sort((a, b) => b.cells.length - a.cells.length)
    .map((r, i) => {
      const lang = nearestLang(r.cells[0]);
      return { name: i < 30 ? `Río ${names.feature(lang)}` : '', navigable: r.navigable, cells: r.cells };
    });
  for (const r of rivers.slice(0, 18)) {
    const mid = r.cells[Math.floor(r.cells.length / 2)];
    const [cx, cy] = cellCenter(mid, W);
    features.push({ kind: 'river', name: r.name, cx: round2(cx), cy: round2(cy) });
  }

  // nombres diseñados (mundo oficial)
  const normOf = (cx: number, cy: number): [number, number] => [cx / (Math.sqrt(3) * W), cy / (1.5 * H)];
  for (const n of design.landmassNames ?? []) {
    let best: LandmassStatic | null = null, bd = Infinity;
    for (const p of provinces) {
      const [x, y] = normOf(p.cx, p.cy);
      const d = Math.hypot(x - n.x, y - n.y);
      if (d < bd) { bd = d; best = landmasses[p.landmass]; }
    }
    if (best) best.name = n.name;
  }
  for (const n of design.featureNames ?? []) {
    let best: MapFeature | null = null, bd = 0.09;
    for (const f of features) {
      if (f.kind !== n.kind) continue;
      const [x, y] = normOf(f.cx, f.cy);
      const d = Math.hypot(x - n.x, y - n.y);
      if (d < bd) { bd = d; best = f; }
    }
    if (best) {
      const old = best.name;
      best.name = n.name;
      if (n.kind === 'river') { const r = rivers.find((rv) => rv.name === old); if (r) r.name = n.name; }
    }
  }

  const cellProv = new Uint16Array(W * H);
  const cellSea = new Uint16Array(W * H);
  const elev = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    cellProv[i] = geo.cellProvince[i] >= 0 ? geo.cellProvince[i] + 1 : 0;
    cellSea[i] = geo.cellSea[i] >= 0 ? geo.cellSea[i] + 1 : 0;
    elev[i] = Math.round(clamp((geo.elevation[i] + 1) / 2, 0, 1) * 255);
  }

  const map: WorldMap = {
    formatVersion: 1,
    generator: { version: GENERATOR_VERSION, seed: design.seed, mode: design.mode, name: design.name },
    width: W, height: H,
    cells: { terrain: encodeU8(geo.terrain), elevation: encodeU8(elev), province: encodeU16(cellProv), sea: encodeU16(cellSea), river: encodeU8(geo.river) },
    provinces, seaZones, landmasses, rivers, features,
    cultures: design.cultures.map(({ anchors: _a, ...c }) => c),
    religions: design.religions.map(({ anchors: _a, ...r }) => r)
  };
  void isWater;
  return { map, geo, owner, capitals, claims, errors };
}

function geoTerrain(g: GeoResult, p: number): number { return g.terrain[g.provinces[p].anchor]; }
function neighborsList(c: number, W: number, H: number): number[] {
  const col = c % W, row = (c - col) / W;
  const dirs = row & 1 ? [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]] : [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
  const out: number[] = [];
  for (const [dc, dr] of dirs) { const cc = col + dc, rr = row + dr; if (cc >= 0 && cc < W && rr >= 0 && rr < H) out.push(rr * W + cc); }
  return out;
}
export function pid(i: number): string { return 'P' + String(i).padStart(3, '0'); }
export function sid(i: number): string { return 'S' + String(i).padStart(3, '0'); }
function round1(v: number): number { return Math.round(v * 10) / 10; }
function round2(v: number): number { return Math.round(v * 100) / 100; }
