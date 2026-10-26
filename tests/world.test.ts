import { describe, it, expect } from 'vitest';
import { REAL_MS_PER_DAY, DAYS_PER_REAL_HOUR, dayToDate, dateToDay, formatDate, decodeU16, neighborsOf } from '@cyo/shared';
import { buildPolitical, OFFICIAL_DESIGN, randomDesign, generateGeography, validateGeography, createWorld } from '@cyo/simulation';
import { hashState, officialWorld } from './helpers.js';

describe('calendario', () => {
  it('1 hora real = 6 meses simulados exactos (180 días de 20 s)', () => {
    expect(REAL_MS_PER_DAY).toBe(20_000);
    expect(DAYS_PER_REAL_HOUR).toBe(180);
    expect(dayToDate(0)).toEqual({ year: 1990, month: 1, day: 1 });
    expect(dayToDate(180)).toEqual({ year: 1990, month: 7, day: 1 });
    expect(dayToDate(360)).toEqual({ year: 1991, month: 1, day: 1 });
    expect(dateToDay({ year: 2026, month: 3, day: 15 })).toBe(36 * 360 + 2 * 30 + 14);
    expect(formatDate(0)).toBe('1 de enero de 1990');
  });
});

describe('mundo oficial', () => {
  const { map, state } = officialWorld();
  it('tiene entre 40 y 70 países ficticios con capital, provincias, bandera, moneda e historia', () => {
    const countries = Object.values(state.countries);
    expect(countries.length).toBeGreaterThanOrEqual(40);
    expect(countries.length).toBeLessThanOrEqual(70);
    for (const c of countries) {
      expect(state.provinces[c.capital].owner).toBe(c.id);
      expect(c.flag.colors.length).toBeGreaterThan(0);
      expect(c.currency.name.length).toBeGreaterThan(0);
      expect(c.history.length).toBeGreaterThan(0);
      expect(c.econ.realGDP).toBeGreaterThan(0);
      expect(c.parties.length).toBeGreaterThan(0);
      expect(Object.values(state.provinces).some((p) => p.owner === c.id)).toBe(true);
    }
  });
  it('es desigual: hay gigantes poblados y microestados petroleros', () => {
    const c = Object.values(state.countries);
    const pops = c.map((x) => x.demography.young + x.demography.adult + x.demography.old);
    expect(Math.max(...pops)).toBeGreaterThan(100);
    expect(Math.min(...pops)).toBeLessThan(5);
    const zah = state.countries.ZAH;
    expect(zah.econ.sectors.oil.output / zah.econ.realGDP).toBeGreaterThan(0.2);
  });
  it('las provincias son contiguas, las adyacencias simétricas y cada celda de tierra tiene provincia', () => {
    const cellProv = decodeU16(map.cells.province);
    const byProv = new Map<number, number[]>();
    cellProv.forEach((p, i) => { if (p > 0) { const l = byProv.get(p - 1) ?? []; l.push(i); byProv.set(p - 1, l); } });
    for (const [idx, cells] of byProv) {
      const set = new Set(cells), seen = new Set([cells[0]]), q = [cells[0]];
      for (let k = 0; k < q.length; k++) for (const n of neighborsOf(q[k], map.width, map.height)) if (set.has(n) && !seen.has(n)) { seen.add(n); q.push(n); }
      expect(seen.size, `provincia ${idx}`).toBe(set.size);
    }
    const byId = new Map(map.provinces.map((p) => [p.id, p]));
    for (const p of map.provinces) for (const l of p.neighbors) expect(byId.get(l.to)!.neighbors.some((x) => x.to === p.id)).toBe(true);
    for (const z of map.seaZones) for (const n of z.neighbors) expect(map.seaZones.find((s) => s.id === n)!.neighbors).toContain(z.id);
  });
  it('tiene continentes, islas, ríos navegables, montañas, desiertos y recursos repartidos', () => {
    expect(map.landmasses.filter((l) => l.kind === 'continent').length).toBeGreaterThanOrEqual(3);
    expect(map.landmasses.filter((l) => l.kind !== 'continent').length).toBeGreaterThanOrEqual(3);
    expect(map.rivers.some((r) => r.navigable)).toBe(true);
    expect(map.features.some((f) => f.kind === 'mountains')).toBe(true);
    expect(map.features.some((f) => f.kind === 'desert')).toBe(true);
    const oil = map.provinces.filter((p) => p.resources.oil > 0).length;
    expect(oil).toBeGreaterThan(5);
    expect(oil).toBeLessThan(map.provinces.length * 0.7);
  });
  it('es idéntico en cada generación (mismo diseño, misma semilla)', () => {
    const a = buildPolitical(OFFICIAL_DESIGN), b = buildPolitical(OFFICIAL_DESIGN);
    expect(hashState(a.map)).toBe(hashState(b.map));
    expect(a.errors).toEqual([]);
  });
  it('en 1990 no existen tecnologías posteriores (por ejemplo, la web masiva)', () => {
    for (const c of Object.values(state.countries)) {
      expect(c.tech.known).not.toContain('world_web');
      expect(c.tech.known).not.toContain('mobile_data');
    }
  });
});

describe('mundo aleatorio', () => {
  for (const seed of ['alfa', 'beta-77', 'gamma']) {
    it(`semilla «${seed}»: geografía válida, reproducible y con 40-70 países`, () => {
      const d = randomDesign(seed, 50);
      const g = generateGeography(d.geo);
      expect(validateGeography(g)).toEqual([]);
      const w1 = createWorld({ mode: 'random', seed, countries: 50 });
      const w2 = createWorld({ mode: 'random', seed, countries: 50 });
      expect(hashState(w1.map)).toBe(hashState(w2.map));
      expect(hashState(w1.state)).toBe(hashState(w2.state));
      const n = Object.keys(w1.state.countries).length;
      expect(n).toBeGreaterThanOrEqual(40);
      expect(n).toBeLessThanOrEqual(70);
      // distinto de otro mundo
      expect(hashState(w1.map)).not.toBe(hashState(officialWorld().map));
    });
  }
});
