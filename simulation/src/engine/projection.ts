import { SECTORS, type WorldState, type WorldMap, type CountryId } from '@cyo/shared';
import { Sim } from './context.js';
import { computeProduction, macroStep, nominalGDP } from './economy.js';
import { fiscalStep, servicesStep } from './fiscal.js';

/**
 * PROYECCIONES CON INCERTIDUMBRE.
 * Simula solo la economía y las finanzas del país con las políticas vigentes (resto del mundo
 * constante) en tres escenarios. Es una estimación del propio gobierno: no conoce el futuro y su
 * precisión depende de la capacidad administrativa (banda más ancha si es baja).
 */
export interface ProjectionPoint { month: number; gdp: number; inflation: number; unemployment: number; balance: number; debt: number; treasury: number }
export interface Projection { base: ProjectionPoint[]; low: ProjectionPoint[]; high: ProjectionPoint[]; uncertainty: number }

export function projectCountry(state: WorldState, map: WorldMap, id: CountryId, months = 24): Projection | null {
  const c0 = state.countries[id];
  if (!c0) return null;
  const uncertainty = 0.5 + 1.5 * (1 - c0.politics.adminCapacity / 100);
  const run = (shock: number): ProjectionPoint[] => {
    const c = structuredClone(c0);
    const provinces = { ...state.provinces };
    const owned = Object.values(state.provinces).filter((p) => p.owner === id).map((p) => structuredClone(p));
    for (const p of owned) provinces[p.id] = p;
    const shadow: WorldState = { ...state, countries: { ...state.countries, [id]: c }, provinces, recentEvents: [], rng: [...state.rng] as WorldState['rng'] };
    const sim = new Sim(shadow, map);
    c.cooldowns.confidenceShock = (c.cooldowns.confidenceShock ?? 0) + shock * 12;
    const out: ProjectionPoint[] = [];
    const dt = 1 / 12;
    for (let m = 1; m <= months; m++) {
      const pr = computeProduction(sim, c, owned);
      let pot = 0;
      for (const s of SECTORS) pot += pr.potential[s];
      c.econ.outputGap += shock * 0.004;
      macroStep(sim, c, { output: pr.potential, potentialTotal: pot, provinceShare: pr.provinceShare, owned }, dt);
      fiscalStep(sim, c, dt);
      servicesStep(sim, c, dt);
      const ng = nominalGDP(c);
      out.push({
        month: m, gdp: round(c.econ.realGDP), inflation: round(c.econ.inflation, 4), unemployment: round(c.econ.unemployment, 4),
        balance: round(c.fiscal.balance / Math.max(1e-6, ng), 4), debt: round((c.fiscal.debtDomestic + c.fiscal.debtForeign * c.econ.exchangeRate) / Math.max(1e-6, ng), 4), treasury: round(c.fiscal.treasury)
      });
    }
    return out;
  };
  return { base: run(0), low: run(-uncertainty), high: run(uncertainty), uncertainty: round(uncertainty, 2) };
}

function round(v: number, d = 2): number { const f = 10 ** d; return Math.round(v * f) / f; }
