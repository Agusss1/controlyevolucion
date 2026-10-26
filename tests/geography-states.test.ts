import { describe, it, expect } from 'vitest';
import type { WorldState, WorldMap } from '@cyo/shared';
import { runDay, applyCommand, Sim, createUnit, issueOrder, findLandPath, checkRecruit, stateCollapse, COLLAPSE_MONTHS, population } from '@cyo/simulation';
import { officialWorld } from './helpers.js';

function days(state: WorldState, map: WorldMap, n: number) { for (let i = 0; i < n; i++) runDay(state, map); }
const totalPop = (state: WorldState) => Object.values(state.countries).filter((c) => c.alive).reduce((a, c) => a + population(c), 0);

describe('geografía jugable', () => {
  it('las conexiones respetan la geografía: tierra y río dentro de una masa, estrechos sobre un mar común, todo simétrico', () => {
    const { map } = officialWorld();
    const prov = new Map(map.provinces.map((p) => [p.id, p]));
    const zones = new Map(map.seaZones.map((z) => [z.id, z]));
    let straits = 0;
    for (const p of map.provinces) {
      for (const l of p.neighbors) {
        const q = prov.get(l.to)!;
        expect(q, `${p.id}→${l.to}`).toBeTruthy();
        expect(q.neighbors.some((b) => b.to === p.id && b.kind === l.kind)).toBe(true);
        if (l.kind === 'strait') {
          straits++;
          expect(p.coastal && q.coastal).toBe(true);
          expect(p.seaZones.some((z) => q.seaZones.includes(z))).toBe(true);
        } else {
          expect(q.landmass).toBe(p.landmass);
        }
      }
      for (const z of p.seaZones) { expect(p.coastal).toBe(true); expect(zones.get(z)!.provinces).toContain(p.id); }
    }
    for (const z of map.seaZones) for (const n of z.neighbors) expect(zones.get(n)!.neighbors).toContain(z.id);
    expect(straits).toBeGreaterThan(0);
  });

  it('una unidad terrestre no cruza el mar sin flota de desembarco y sus rutas solo pasan por provincias vecinas', () => {
    const { state, map } = officialWorld();
    const sim = new Sim(state, map);
    const c = state.countries.CAS;
    const capLm = sim.idx.provinces.get(c.capital)!.landmass;
    // provincias propias alcanzables por tierra, río o estrecho
    const reach = new Set([c.capital]);
    const q = [c.capital];
    while (q.length) for (const l of sim.idx.provinces.get(q.shift()!)!.neighbors) if (state.provinces[l.to].owner === c.id && !reach.has(l.to)) { reach.add(l.to); q.push(l.to); }
    const overseas = Object.values(state.provinces).find((p) => p.owner === c.id && sim.idx.provinces.get(p.id)!.landmass !== capLm && !reach.has(p.id));
    expect(overseas, 'Castrenia tiene territorio de ultramar sin conexión terrestre').toBeTruthy();
    const u = createUnit(sim, c, 'infantry', c.capital, true);
    expect(findLandPath(sim, u, overseas!.id)).toBeNull();
    const r = issueOrder(sim, c, [u.id], 'move', overseas!.id);
    expect(r.ok && r.moved > 0).toBe(false);
    // una ruta interior válida solo usa enlaces existentes
    const inland = [...reach].find((id) => id !== c.capital && sim.idx.provinces.get(id)!.landmass === capLm)!;
    const path = findLandPath(sim, u, inland)!;
    expect(path.length).toBeGreaterThan(0);
    let at = c.capital;
    for (const step of path) { expect(sim.idx.provinces.get(at)!.neighbors.some((l) => l.to === step)).toBe(true); at = step; }
  });

  it('un país sin costa no puede construir flotas', () => {
    const { state, map } = officialWorld();
    const sim = new Sim(state, map);
    const c = state.countries.VEL;
    expect(Object.values(state.provinces).filter((p) => p.owner === 'VEL').every((p) => !sim.idx.provinces.get(p.id)!.coastal)).toBe(true);
    c.military.equipment.ships = 100; c.military.equipment.arms = 100; c.military.manpower = 10; c.fiscal.treasury = 1e9;
    const r = checkRecruit(sim, c, 'surface_fleet', c.capital);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/puerto/);
  });
});

describe('colapso estatal', () => {
  it('un Estado fragmentado da lugar a sucesores completos y se conserva la población', () => {
    const { state, map } = officialWorld();
    const sim = new Sim(state, map);
    const c = state.countries.YAR;
    const provs0 = Object.values(state.provinces).filter((p) => p.owner === 'YAR').length;
    const pop0 = totalPop(state);
    const regime0 = c.regime;
    const created = stateCollapse(sim, c);
    sim.commit();
    expect(created.length).toBeGreaterThan(0);
    const n = state.countries[created[0].id];
    expect(n.alive).toBe(true);
    expect(n.successorOf).toBe('YAR');
    expect(n.flag.colors.length).toBeGreaterThan(0);
    expect(n.econ.realGDP).toBeGreaterThan(0);
    expect(n.parties.length).toBeGreaterThan(0);
    const mine = Object.values(state.provinces).filter((p) => p.owner === n.id);
    const rest = Object.values(state.provinces).filter((p) => p.owner === 'YAR');
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.length + rest.length).toBe(provs0);
    expect(rest.some((p) => p.id === c.capital)).toBe(true);
    // el bloque separado es contiguo
    const ids = new Set(mine.map((p) => p.id));
    const seen = new Set([mine[0].id]); const q = [mine[0].id];
    while (q.length) for (const l of sim.idx.provinces.get(q.shift()!)!.neighbors) if (ids.has(l.to) && !seen.has(l.to)) { seen.add(l.to); q.push(l.to); }
    expect(seen.size).toBe(ids.size);
    expect(c.regime).not.toBe(regime0);
    expect(Math.abs(totalPop(state) - pop0) / pop0).toBeLessThan(1e-9);
    // los sucesores funcionan en todos los sistemas
    days(state, map, 30);
    expect(state.countries[n.id].alive).toBe(true);
    expect(Number.isFinite(state.countries[n.id].econ.realGDP) && state.countries[n.id].econ.realGDP > 0).toBe(true);
    expect(applyCommand(state, map, n.id, { type: 'setBudget', budget: { education: 4 } }).result.ok).toBe(true);
    for (const p of Object.values(state.provinces)) expect(state.countries[p.owner].alive).toBe(true);
  });

  it('en un colapso solo se separan las regiones inquietas', () => {
    const { state, map } = officialWorld();
    const sim = new Sim(state, map);
    const c = state.countries.KHA;
    const minority = Object.values(state.provinces).filter((p) => p.owner === 'KHA' && p.culture !== c.culture && p.id !== c.capital);
    const cultures = [...new Set(minority.map((p) => p.culture))].sort();
    expect(cultures.length).toBeGreaterThan(1);
    const restless = cultures[0];
    for (const p of Object.values(state.provinces)) if (p.owner === 'KHA') p.unrest = p.culture === restless ? 0.8 : 0.1;
    const created = stateCollapse(sim, c);
    sim.commit();
    expect(created.length).toBe(1);
    const provs = Object.values(state.provinces).filter((p) => p.owner === created[0].id);
    expect(provs.every((p) => p.culture === restless)).toBe(true);
    expect(Object.values(state.provinces).filter((p) => p.owner === 'KHA' && p.culture !== c.culture && p.culture !== restless).length).toBeGreaterThan(0);
  });

  it('meses de ingobernabilidad sostenida terminan en colapso sin intervención directa', () => {
    const { state, map } = officialWorld();
    const before = Object.keys(state.countries).length;
    let collapsed = false;
    for (let d = 0; d < 30 * (COLLAPSE_MONTHS + 3) && !collapsed; d++) {
      const c = state.countries.YAR;
      c.politics.stability = 5; c.politics.legitimacy = 10; c.fiscal.inDefault = true; c.fiscal.defaultSinceDay ??= state.day;
      collapsed = runDay(state, map).events.some((e) => e.type === 'state_collapse');
    }
    expect(collapsed).toBe(true);
    expect(Object.keys(state.countries).length).toBeGreaterThan(before);
  });
});
