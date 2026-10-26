import { SECTORS, type WorldState, type WorldMap, type GameEvent, type CommodityId, type SectorId, type ProvinceState } from '@cyo/shared';
import { Sim, pushSeries } from './context.js';
import { computeProduction, commodityDemand, worldTrade, macroStep, population, nominalGDP } from './economy.js';
import { fiscalStep, servicesStep, totalRevenue } from './fiscal.js';
import { demographyStep, migrationStep } from './population.js';
import { politicsStep, electionsStep, billsStep } from './politics.js';
import { techStep } from './tech.js';
import { militaryEconomyStep, supplyStep, movementStep, combatStep, navalAirStep, warSyncStep, plansStep } from './military.js';
import { diplomacyDailyStep, diplomacyMonthlyStep, respondProposal } from './diplomacy.js';
import { countryEventsStep, worldEventsStep, resolveDecision } from './events.js';
import { aiDaily, aiMonthly } from './ai.js';
import { projectsStep } from './projects.js';
import { hashString, approach } from '../rng.js';

/**
 * CICLO DIARIO DE SIMULACIÓN (servidor). dt = 1/360 años.
 * Orden: militar (bloqueos, combate) → producción → comercio mundial → macro, fiscal, servicios,
 * demografía, política, tecnología → diplomacia → eventos → IA → estadísticas.
 */
export const DT = 1 / 360;

export interface DayResult { day: number; events: GameEvent[] }

export function runDay(state: WorldState, map: WorldMap): DayResult {
  const sim = new Sim(state, map);
  const dt = DT;
  state.day += 1;
  const day = state.day;
  const countries = sim.aliveCountries();

  // ---- guerras y operaciones militares
  warSyncStep(sim);
  plansStep(sim);
  movementStep(sim, dt);
  navalAirStep(sim, dt);
  combatStep(sim, dt);

  // ---- contador de sanciones recibidas (para compras de armas)
  const sanctioned = new Map<string, number>();
  for (const r of Object.values(state.relations)) if (r.sanctions.length) { for (const x of [r.a, r.b]) if (!r.sanctions.includes(x) || r.sanctions.length > 1) sanctioned.set(x, (sanctioned.get(x) ?? 0) + 1); }
  for (const c of countries) c.cooldowns.sanctionedBy = sanctioned.get(c.id) ?? 0;
  sim.invalidateCaches();

  // ---- producción y comercio
  const ownedBy = new Map<string, ProvinceState[]>();
  for (const p of Object.values(state.provinces)) { const l = ownedBy.get(p.owner) ?? []; l.push(p); ownedBy.set(p.owner, l); }
  const prod = new Map<string, { output: Record<SectorId, number>; commodities: Record<CommodityId, number>; demand: Record<CommodityId, number>; share: Map<string, number[]>; potential: number }>();
  for (const c of countries) {
    const owned = ownedBy.get(c.id) ?? [];
    const pr = computeProduction(sim, c, owned);
    let pot = 0;
    for (const s of SECTORS) pot += pr.potential[s];
    prod.set(c.id, { output: pr.potential, commodities: pr.commodities, demand: commodityDemand(sim, c, pr.potential), share: pr.provinceShare, potential: pot });
  }
  worldTrade(sim, prod, dt);

  // ---- países
  for (const c of countries) {
    if (!c.alive) continue;
    const owned = ownedBy.get(c.id) ?? [];
    const pr = prod.get(c.id)!;
    macroStep(sim, c, { output: pr.output, potentialTotal: pr.potential, provinceShare: pr.share, owned }, dt);
    fiscalStep(sim, c, dt);
    servicesStep(sim, c, dt);
    militaryEconomyStep(sim, c, dt);
    projectsStep(sim, c, dt);
    demographyStep(sim, c, owned, dt);
    politicsStep(sim, c, owned, dt);
    billsStep(sim, c);
    electionsStep(sim, c);
    const ai = !sim.isHuman(c.id);
    techStep(sim, c, dt, ai || c.directives.continueResearch);
  }
  supplyStep(sim, dt);

  // ---- mundo
  diplomacyDailyStep(sim);
  if (day % 30 === 0) { diplomacyMonthlyStep(sim); migrationStep(sim, 30 * dt); }
  worldEventsStep(sim);
  updateWorldIndicators(sim, dt);

  // ---- eventos por país e IA (escalonados en el mes)
  for (const c of countries) {
    if (!c.alive) continue;
    const slot = hashString(c.id) % 30;
    if (day % 30 === slot) countryEventsStep(sim, c);
    const human = sim.isHuman(c.id);
    if (!human) {
      aiDaily(sim, c);
      if (day % 30 === (slot + 15) % 30) aiMonthly(sim, c);
    } else {
      absenceDirectives(sim, c);
    }
  }

  // ---- estadísticas mensuales
  if (day % 30 === 0) for (const c of countries) if (c.alive) recordStats(sim, c);
  sim.commit();
  return { day, events: sim.events };
}

/** Directivas de ausencia: mantienen el país sin reemplazar las decisiones estratégicas del jugador. */
function absenceDirectives(sim: Sim, c: ReturnType<Sim['country']>): void {
  const online = sim.isOnline(c.id);
  if (online) return;
  const d = c.directives;
  if (d.autoDecisions) for (const dec of [...c.decisions]) if (sim.day >= dec.expiresDay) resolveDecision(sim, c, dec.id, dec.defaultOption);
  if (d.balanceBudget && sim.day % 30 === 0) {
    const ngdp = nominalGDP(c);
    const def = -c.fiscal.balance / ngdp;
    if (def > 0.03) for (const k of ['subsidies', 'transfers', 'infrastructure', 'administration'] as const) c.budget[k] = Math.max(0, c.budget[k] * 0.97);
  }
  if (d.acceptFriendlyTrade) {
    for (const p of Object.values(sim.state.proposals)) {
      if (p.status !== 'pending' || p.to !== c.id || p.type !== 'trade_agreement') continue;
      const rel = sim.state.relations[[p.from, p.to].sort().join('|')];
      if (rel && rel.opinion > 50) respondProposal(sim, c, p.id, 'accept');
    }
  }
}

function updateWorldIndicators(sim: Sim, dt: number): void {
  let gdp = 0, infl = 0;
  for (const c of sim.aliveCountries()) { gdp += c.econ.realGDP; infl += c.econ.inflation * c.econ.realGDP; }
  const wInfl = gdp > 0 ? infl / gdp : 0.03;
  // la inflación mundial media se calcula sin los casos de hiperinflación extrema
  sim.state.worldInflation = approach(sim.state.worldInflation, Math.min(0.15, wInfl), dt, 0.5);
  sim.state.worldPriceLevel *= Math.exp(sim.state.worldInflation * dt);
  const oil = sim.state.markets.oil.price;
  sim.state.worldInterestRate = approach(sim.state.worldInterestRate, 0.03 + sim.state.worldInflation * 0.8 + (oil > 1.5 ? 0.01 : 0), dt, 2);
}

function recordStats(sim: Sim, c: ReturnType<Sim['country']>): void {
  const e = c.econ;
  const ngdp = nominalGDP(c);
  pushSeries(c, 'gdp', e.realGDP);
  pushSeries(c, 'growth', e.growth);
  pushSeries(c, 'inflation', e.inflation);
  pushSeries(c, 'unemployment', e.unemployment);
  pushSeries(c, 'population', population(c));
  pushSeries(c, 'debt', (c.fiscal.debtDomestic + c.fiscal.debtForeign * e.exchangeRate) / Math.max(1e-6, ngdp));
  pushSeries(c, 'balance', c.fiscal.balance / Math.max(1e-6, ngdp));
  pushSeries(c, 'revenue', totalRevenue(c.fiscal.revenue) / Math.max(1e-6, ngdp));
  pushSeries(c, 'approval', c.politics.approval);
  pushSeries(c, 'stability', c.politics.stability);
  pushSeries(c, 'legitimacy', c.politics.legitimacy);
  pushSeries(c, 'poverty', e.poverty);
  pushSeries(c, 'gini', e.gini);
  pushSeries(c, 'exchange', e.exchangeRate);
  pushSeries(c, 'reserves', e.reserves);
  pushSeries(c, 'exports', e.exports);
  pushSeries(c, 'imports', e.imports);
  pushSeries(c, 'treasury', c.fiscal.treasury);
}
