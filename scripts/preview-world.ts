// Previsualización PNG del mundo (desarrollo): npx tsx scripts/preview-world.ts salida.png [semilla-aleatoria]
import { buildPolitical } from '../simulation/src/worldgen/political.js';
import { OFFICIAL_DESIGN } from '../simulation/src/scenario/official.js';
import { randomDesign } from '../simulation/src/scenario/random.js';
import { TERRAIN_INFO } from '../simulation/src/data/terrain.js';
import { writePng } from './png.js';
import { neighborsOf } from '../shared/src/hex.js';

const S = 6;
const design = process.argv[3] ? randomDesign(process.argv[3], 52) : OFFICIAL_DESIGN;
const t0 = Date.now();
const r = buildPolitical(design);
const g = r.geo;
console.log('ms', Date.now() - t0, 'provincias', g.provinces.length, 'mares', g.seaZones.length, 'países', Object.keys(r.capitals).length, 'errores', r.errors.slice(0, 5));
const counts: Record<string, number> = {};
for (const o of r.owner) counts[o] = (counts[o] ?? 0) + 1;
console.log(Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' '));
const colorOf: Record<string, string> = Object.fromEntries(design.countries.map((c) => [c.key, c.color]));
const W = g.width * S, H = g.height * S;
const rgb = new Uint8Array(W * H * 3);
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const nb: number[] = [];
const caps = new Set(Object.values(r.capitals).map((p) => g.provinces[p].anchor));
for (let row = 0; row < g.height; row++) for (let c = 0; c < g.width; c++) {
  const i = row * g.width + c;
  let col = hex(TERRAIN_INFO[g.terrain[i]].color);
  const p = g.cellProvince[i];
  if (p >= 0) {
    const oc = hex(colorOf[r.owner[p]] ?? '#ff00ff');
    col = col.map((v, k) => Math.round(v * 0.35 + oc[k] * 0.65));
    let pb = false, cb = false;
    for (const n of neighborsOf(i, g.width, g.height, nb)) {
      const q = g.cellProvince[n];
      if (q >= 0 && q !== p) { pb = true; if (r.owner[q] !== r.owner[p]) cb = true; }
    }
    if (cb) col = [20, 20, 20]; else if (pb) col = col.map((v) => v * 0.8);
  }
  if (g.river[i] && p >= 0) col = [60, 110, 200];
  if (caps.has(i)) col = [255, 255, 255];
  const off = (row & 1) ? S / 2 : 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = Math.min(W - 1, c * S + x + off), py = row * S + y;
    const k = (py * W + px) * 3; rgb[k] = col[0]; rgb[k + 1] = col[1]; rgb[k + 2] = col[2];
  }
}
writePng(process.argv[2] ?? 'preview.png', W, H, rgb);
