import type { CountryState } from '@cyo/shared';
import { TECHS, TECH_BY_ID, FUTURE_YEAR, type TechDef } from '../data/techs.js';
import { hashString, clamp } from '../rng.js';
import { Sim, hasTreaty, sharedOrganizations } from './context.js';
import { techEffect } from './economy.js';

/**
 * INVESTIGACIÓN Y DIFUSIÓN TECNOLÓGICA.
 * Puntos de investigación = f(gasto científico real, capital humano, cooperación).
 * El coste efectivo de una tecnología baja cuando ya se difundió por el mundo y entre socios
 * comerciales/científicos, sube si se intenta antes de su madurez de referencia, y varía por país.
 * Las tecnologías posteriores a 2026 tienen coste muy incierto y su descubrimiento es probabilístico.
 */

/** Escala global de costes (calibrada para que un país rico adopte 1-3 tecnologías por año). */
export const TECH_COST_SCALE = 0.55;

export function currentYear(day: number): number { return 1990 + Math.floor(day / 360); }

export function researchPoints(sim: Sim, c: CountryState): number {
  const scienceReal = Math.max(0, c.budget.science) / 100 * c.econ.realGDP;
  const hc = c.stocks.humanCapital;
  let base = 90 * Math.sqrt(scienceReal) * (0.4 + hc) * (1 + techEffect(c, 'research')) + 40 * hc + 0.6 * c.econ.sectors.tech.output;
  // cooperación científica: una fracción de la investigación de los socios
  let coop = 0;
  for (const other of sim.aliveCountries()) {
    if (other.id === c.id) continue;
    let share = hasTreaty(sim.state, c.id, other.id, 'science_cooperation') ? 0.08 : 0;
    for (const o of sharedOrganizations(sim.state, c.id, other.id)) share = Math.max(share, o.scienceShare * 0.5);
    if (share > 0) coop += share * other.tech.points;
  }
  base += coop;
  return base;
}

export function adoption(sim: Sim, techId: string): number {
  let known = 0, total = 0;
  for (const c of sim.aliveCountries()) { total += c.econ.realGDP; if (c.tech.known.includes(techId)) known += c.econ.realGDP; }
  return total > 0 ? known / total : 0;
}

export function techCost(sim: Sim, c: CountryState, t: TechDef): number {
  const h = hashString(c.id + ':' + t.id) / 4294967296;
  const variance = t.year > FUTURE_YEAR ? 0.6 + 1.2 * h : 0.85 + 0.3 * h;
  const ad = adoption(sim, t.id);
  let partners = 0;
  for (const o of sim.aliveCountries()) {
    if (o.id === c.id || !o.tech.known.includes(t.id)) continue;
    if (hasTreaty(sim.state, c.id, o.id, 'trade_agreement') || hasTreaty(sim.state, c.id, o.id, 'science_cooperation') || sharedOrganizations(sim.state, c.id, o.id).length) partners++;
  }
  const lp = sim.params(c);
  const diffusion = clamp(1 - 0.8 * Math.pow(ad, 0.6) * (0.5 + 0.5 * (1 - lp.tradeBarriers)) - 0.04 * Math.min(4, partners) - 0.08 * lp.fdiOpenness * ad, 0.15, 1);
  const early = 1 + Math.max(0, t.year - currentYear(sim.day) - 2) * 0.09;
  return TECH_COST_SCALE * t.cost * variance * diffusion * early;
}

export function canResearch(c: CountryState, t: TechDef): { ok: boolean; reason?: string } {
  if (c.tech.known.includes(t.id)) return { ok: false, reason: 'Ya conocida.' };
  const missing = t.prereqs.filter((p) => !c.tech.known.includes(p));
  if (missing.length) return { ok: false, reason: `Faltan requisitos: ${missing.map((m) => TECH_BY_ID[m]?.name ?? m).join(', ')}` };
  return { ok: true };
}

export function availableTechs(c: CountryState): TechDef[] {
  return TECHS.filter((t) => canResearch(c, t).ok);
}

export function techStep(sim: Sim, c: CountryState, dt: number, autoPick: boolean): void {
  const rp = researchPoints(sim, c);
  c.tech.points = rp;
  c.tech.queue = c.tech.queue.filter((id) => TECH_BY_ID[id] && !c.tech.known.includes(id));
  if (c.tech.queue.length === 0 && autoPick) {
    const pick = availableTechs(c).sort((a, b) => a.year - b.year || a.cost - b.cost).slice(0, 2).map((t) => t.id);
    c.tech.queue = pick;
  }
  const active = c.tech.queue.filter((id) => canResearch(c, TECH_BY_ID[id]).ok).slice(0, 2);
  if (!active.length) return;
  const split = active.length === 1 ? [1] : [0.65, 0.35];
  active.forEach((id, i) => {
    const t = TECH_BY_ID[id];
    c.tech.progress[id] = (c.tech.progress[id] ?? 0) + rp * split[i] * dt;
    const cost = techCost(sim, c, t);
    if (c.tech.progress[id] >= cost) {
      // las tecnologías futuras requieren además un avance que puede demorarse
      if (t.year > FUTURE_YEAR && !sim.rng.chance(dt * 4)) return;
      discover(sim, c, id);
    }
  });
}

export function discover(sim: Sim, c: CountryState, id: string): void {
  const t = TECH_BY_ID[id];
  if (!t || c.tech.known.includes(id)) return;
  const first = !sim.aliveCountries().some((o) => o.tech.known.includes(id));
  c.tech.known.push(id);
  c.tech.discoveredDay[id] = sim.day;
  delete c.tech.progress[id];
  c.tech.queue = c.tech.queue.filter((q) => q !== id);
  if (first) sim.emit('tech_first', 'world', 'major', [c.id], `${c.name} logra un avance histórico: ${t.name}`, `Científicos de ${c.name} desarrollan por primera vez en Vereth: ${t.name}.`);
  else sim.emit('tech', 'national', 'info', [c.id], `${c.name} incorpora ${t.name}`, `${c.name} domina ahora la tecnología «${t.name}».`);
}
