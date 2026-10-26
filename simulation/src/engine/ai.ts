import { BUDGET_CATEGORIES, TAXES, type CountryState, type Proposal, type BudgetCategory, type TaxId, type UnitType } from '@cyo/shared';
import { clamp, hashString } from '../rng.js';
import { Sim, relation, hasTreaty, atWar, warBetween, sharedOrganizations } from './context.js';
import { nominalGDP, sumBudget, population } from './economy.js';
import { computeRevenue, totalRevenue, canBorrow } from './fiscal.js';
import { LAWS, lawOption } from '../data/laws.js';
import { TECHS, TECH_BY_ID } from '../data/techs.js';
import { UNIT_INFO } from '../data/units.js';
import { GROUP_INFO, dimDistance } from '../data/politics.js';
import { proposeLaw, checkLawProposal } from './politics.js';
import { availableTechs } from './tech.js';
import { recruit, declareWar, joinWar, warParticipants, breakTreaty } from './military.js';
import { createProposal, respondProposal, govIdeology } from './diplomacy.js';
import { aiChooseDecision, resolveDecision } from './events.js';
import { startBuild } from './projects.js';
import type { TechArea } from '../data/techs.js';

/**
 * INTELIGENCIA ARTIFICIAL DE LOS ESTADOS.
 * Planificación por puntuación de decisiones (sin modelos de lenguaje externos). La IA usa los
 * mismos comandos y el mismo motor que los jugadores, y solo información estimada de otros
 * países (con el error que corresponde a su servicio de inteligencia).
 */

interface Profile { name: string; budget: Partial<Record<BudgetCategory, number>>; research: Partial<Record<TechArea, number>>; aggression: number; trade: number; production: { arms: number; vehicles: number; aircraft: number; ships: number }; army: number }

export const AI_PROFILES: Record<string, Profile> = {
  balanced: { name: 'Equilibrado', budget: {}, research: {}, aggression: 0.2, trade: 0.5, production: { arms: 4, vehicles: 3, aircraft: 2, ships: 1 }, army: 1 },
  trader: { name: 'Comerciante', budget: { defense: 0.7, infrastructure: 1.3, education: 1.1 }, research: { computing: 1.5, telecom: 1.4, internet: 1.5, industry: 1.2 }, aggression: 0.05, trade: 1, production: { arms: 3, vehicles: 2, aircraft: 3, ships: 2 }, army: 0.7 },
  nationalist: { name: 'Nacionalista', budget: { defense: 1.4, security: 1.2 }, research: { defense: 1.6, industry: 1.2 }, aggression: 0.5, trade: 0.2, production: { arms: 4, vehicles: 4, aircraft: 2, ships: 1 }, army: 1.3 },
  hegemon: { name: 'Hegemónico', budget: { defense: 1.5, science: 1.2, intelligence: 1.4 }, research: { defense: 1.6, aerospace: 1.5, energy: 1.2 }, aggression: 0.45, trade: 0.4, production: { arms: 4, vehicles: 4, aircraft: 3, ships: 2 }, army: 1.4 },
  defensive: { name: 'Defensivo', budget: { defense: 1.2 }, research: { defense: 1.2 }, aggression: 0.05, trade: 0.5, production: { arms: 5, vehicles: 2, aircraft: 1, ships: 0.5 }, army: 1.1 },
  developmental: { name: 'Desarrollista', budget: { infrastructure: 1.5, education: 1.3, subsidies: 1.2 }, research: { industry: 1.5, agriculture: 1.4, energy: 1.3 }, aggression: 0.15, trade: 0.6, production: { arms: 4, vehicles: 3, aircraft: 1, ships: 1 }, army: 0.9 },
  aggressive: { name: 'Agresivo', budget: { defense: 1.7 }, research: { defense: 2 }, aggression: 0.8, trade: 0.2, production: { arms: 4, vehicles: 4, aircraft: 2, ships: 1 }, army: 1.6 },
  scientific: { name: 'Científico', budget: { science: 1.8, education: 1.4 }, research: { computing: 1.6, ai: 1.8, medicine: 1.4, biotech: 1.5 }, aggression: 0.02, trade: 0.9, production: { arms: 2, vehicles: 2, aircraft: 3, ships: 2 }, army: 0.6 },
  pacifist: { name: 'Pacifista', budget: { defense: 0.4, health: 1.2, education: 1.2 }, research: { medicine: 1.5, agriculture: 1.2 }, aggression: 0, trade: 0.8, production: { arms: 3, vehicles: 1, aircraft: 1, ships: 1 }, army: 0.4 },
  socialist: { name: 'Socialista', budget: { subsidies: 1.4, transfers: 1.2, defense: 1.2 }, research: { industry: 1.4, defense: 1.2 }, aggression: 0.25, trade: 0.3, production: { arms: 4, vehicles: 4, aircraft: 2, ships: 1 }, army: 1.2 },
  rentier: { name: 'Rentista', budget: { subsidies: 1.5, transfers: 1.3, defense: 1.2 }, research: { energy: 1.3 }, aggression: 0.15, trade: 0.8, production: { arms: 3, vehicles: 3, aircraft: 3, ships: 1 }, army: 0.9 },
  ideological: { name: 'Ideológico', budget: { defense: 1.3, security: 1.3 }, research: { defense: 1.4 }, aggression: 0.45, trade: 0.2, production: { arms: 5, vehicles: 3, aircraft: 1, ships: 1 }, army: 1.3 }
};

export function profileOf(c: CountryState): Profile { return AI_PROFILES[c.ai.profile] ?? AI_PROFILES.balanced; }

/** Estimación de un valor ajeno según la calidad de inteligencia del observador (determinista). */
export function estimate(sim: Sim, observer: CountryState | null, target: CountryState, key: string, value: number): number {
  if (observer && observer.id === target.id) return value;
  const intel = observer ? observer.stocks.intelligence : 0.3;
  const err = 0.35 * (1 - intel) * (1 - 0.5 * sim.params(target).pressFreedom);
  const h = hashString(`${observer?.id ?? 'pub'}:${target.id}:${key}:${Math.floor(sim.day / 30)}`) / 4294967296;
  return value * (1 + (h * 2 - 1) * err);
}

export function landStrength(sim: Sim, owner: string): number {
  let s = 0;
  for (const u of sim.unitsOf(owner)) if (u.domain === 'land') { const i = UNIT_INFO[u.type]; s += (i.attack + i.defense) * u.strength * (0.4 + 0.6 * u.equipment) * u.tech; }
  return s;
}

export function estimatedStrength(sim: Sim, observer: CountryState, target: CountryState): number {
  return estimate(sim, observer, target, 'land', landStrength(sim, target.id));
}

export function threatLevel(sim: Sim, c: CountryState): number {
  const own = landStrength(sim, c.id) + 1;
  let threat = 0;
  for (const o of sim.aliveCountries()) {
    if (o.id === c.id) continue;
    const r = relation(sim.state, c.id, o.id);
    if (!r.border && !atWar(sim.state, c.id, o.id)) continue;
    const hostility = atWar(sim.state, c.id, o.id) ? 1.5 : clamp((-r.opinion + 10) / 100, 0, 1) * (0.5 + profileOf(o).aggression);
    threat += estimatedStrength(sim, c, o) * hostility;
  }
  return threat / own;
}

// ---------------------------------------------------------------------------

export function aiDaily(sim: Sim, c: CountryState): void {
  // propuestas pendientes dirigidas a este país
  for (const p of Object.values(sim.state.proposals)) {
    if (p.status !== 'pending' || p.to !== c.id) continue;
    if (sim.day - p.createdDay < 2) continue;
    const score = evaluateProposal(sim, c, p);
    respondProposal(sim, c, p.id, score > 0 ? 'accept' : 'reject');
  }
  // llamadas a las armas
  for (const w of Object.values(sim.state.wars)) {
    if (w.status === 'ended') continue;
    for (const call of w.callsToArms) {
      if (call.country !== c.id || call.status !== 'pending') continue;
      respondCallToArms(sim, c, w.id, evaluateCallToArms(sim, c, w.id));
    }
  }
  for (const d of [...c.decisions]) resolveDecision(sim, c, d.id, aiChooseDecision(sim, c, d));
}

export function evaluateCallToArms(sim: Sim, c: CountryState, warId: string): boolean {
  const w = sim.state.wars[warId];
  const call = w?.callsToArms.find((x) => x.country === c.id);
  if (!w || !call) return false;
  const enemies = warParticipants(w, call.side === 'attacker' ? 'defender' : 'attacker');
  let enemyStr = 0, enemyOp = 0;
  for (const e of enemies) { const ec = sim.state.countries[e]; if (ec) { enemyStr += estimatedStrength(sim, c, ec); enemyOp += relation(sim.state, c.id, e).opinion; } }
  const own = landStrength(sim, c.id);
  const friend = warParticipants(w, call.side).reduce((a, x) => a + relation(sim.state, c.id, x).opinion, 0);
  const obligation = call.treaty ? 40 : 15;
  const score = obligation + friend * 0.3 - enemyOp * 0.3 - 30 * clamp(enemyStr / Math.max(1, own) - 1.5, 0, 3) - 40 * sim.params(c).democracy * (call.side === 'attacker' ? 1 : 0) + 20 * profileOf(c).aggression;
  return score > 20;
}

export function respondCallToArms(sim: Sim, c: CountryState, warId: string, accept: boolean): { ok: boolean; error?: string } {
  const w = sim.state.wars[warId];
  const call = w?.callsToArms.find((x) => x.country === c.id && x.status === 'pending');
  if (!w || !call) return { ok: false, error: 'No hay llamada a las armas pendiente.' };
  call.status = accept ? 'accepted' : 'declined';
  if (accept) joinWar(sim, w, c.id, call.side);
  else {
    if (call.treaty) breakTreaty(sim, call.treaty, c.id);
    sim.emit('call_declined', 'world', 'minor', [c.id], `${c.name} no se une a la ${w.name}`, call.treaty ? 'Incumple así su alianza.' : 'Se mantiene al margen.');
  }
  return { ok: true };
}

export function evaluateProposal(sim: Sim, c: CountryState, p: Proposal): number {
  const st = sim.state;
  const from = st.countries[p.from];
  if (!from) return -1;
  const r = relation(st, c.id, from.id);
  const prof = profileOf(c);
  const lp = sim.params(c);
  let s = r.opinion / 40 + (r.trust - 50) / 60;
  switch (p.type) {
    case 'trade_agreement': s += 0.6 + prof.trade - lp.tradeBarriers - (lp.tradeBarriers > 0.6 ? 1 : 0); break;
    case 'customs_union': s += prof.trade - lp.tradeBarriers * 1.5 - 0.3; break;
    case 'non_aggression': {
      s += 0.4 + clamp(estimatedStrength(sim, c, from) / Math.max(1, landStrength(sim, c.id)) - 0.5, 0, 2) * 0.6;
      if (c.claims.some((pid) => st.provinces[pid]?.owner === from.id)) s -= prof.aggression * 2;
      break;
    }
    case 'defensive_alliance': case 'military_alliance': {
      if (lp.militaryPosture < 0.2) return -5;
      const commonRival = st.relations && Object.values(st.countries).some((x) => x.alive && relation(st, c.id, x.id).opinion < -40 && relation(st, from.id, x.id).opinion < -40);
      s += (commonRival ? 1.2 : -0.3) - (Object.values(st.wars).some((w) => w.status !== 'ended' && w.participants.some((q) => q.country === from.id)) ? 1.5 : 0) - (p.type === 'military_alliance' ? 0.5 : 0);
      break;
    }
    case 'economic_aid': s += (p.terms.lender === c.id ? -1 : 1.5); break;
    case 'loan': {
      const needs = c.fiscal.balance < 0 || !canBorrow(sim, c).ok;
      s += needs && (p.terms.rate ?? 0.05) <= sim.state.worldInterestRate + c.econ.riskPremium + 0.02 ? 1.5 : -0.5;
      break;
    }
    case 'energy_agreement': case 'science_cooperation': case 'migration_cooperation': s += 0.5; break;
    case 'military_access': s += hasTreaty(st, c.id, from.id, 'defensive_alliance') || sharedOrganizations(st, c.id, from.id).some((o) => o.mutualDefense) ? 1 : -0.8; break;
    case 'recognition': s += 0.8 - (from.successorOf && relation(st, c.id, from.successorOf).opinion > 40 ? 1.5 : 0); break;
    case 'debt_relief': s += 2; break;
    case 'join_organization': {
      const org = st.organizations[p.terms.organization ?? ''];
      if (!org) return -1;
      const avgOp = org.members.reduce((a, m) => a + relation(st, c.id, m).opinion, 0) / Math.max(1, org.members.length);
      s += avgOp / 30 + (org.kind === 'economic' ? prof.trade : org.mutualDefense ? (lp.militaryPosture < 0.2 ? -5 : 0.3) : 0) - 0.3;
      break;
    }
    case 'unification': s += (r.opinion > 50 ? 1 : -2) + (from.econ.realGDP > c.econ.realGDP * 2 ? -0.5 : 0.5) - 1; break;
    case 'territorial_cession': {
      const giving = (p.terms.provincesTo ?? from.id) === from.id;
      if (giving) s -= (p.terms.provinces?.length ?? 0) * 1.5 - (p.terms.amount ?? 0) / Math.max(1, c.econ.realGDP) * 20;
      else s += 2;
      break;
    }
    case 'ceasefire': case 'mediation': {
      const war = warBetween(st, c.id, from.id) ?? (p.terms.warId ? st.wars[p.terms.warId] : null);
      if (!war) return p.type === 'mediation' ? 0.5 : -1;
      const myScore = war.attacker === c.id || war.participants.find((q) => q.country === c.id)?.side === 'attacker' ? war.warscore : -war.warscore;
      s = 0.5 - myScore / 25 + c.military.warExhaustion * 3 + (p.terms.mediator ? 0.5 : 0);
      break;
    }
    case 'peace': {
      const war = warBetween(st, c.id, from.id) ?? (p.terms.warId ? st.wars[p.terms.warId] : null);
      if (!war) return -1;
      const mySide = war.participants.find((q) => q.country === c.id)?.side;
      const myScore = mySide === 'attacker' ? war.warscore : -war.warscore;
      const lose = (p.terms.provinces ?? []).filter((pid) => st.provinces[pid]?.owner === c.id).length;
      const gain = (p.terms.provinces ?? []).filter((pid) => st.provinces[pid]?.owner !== c.id).length * (p.terms.provincesTo === c.id ? 1 : 0);
      const owned = Object.values(st.provinces).filter((q) => q.owner === c.id).length;
      s = 0.3 - myScore / 30 + c.military.warExhaustion * 4 - lose / Math.max(1, owned) * 12 + gain * 0.3 - (p.terms.reparations ?? 0) / Math.max(1, c.econ.realGDP) * 4;
      if (war.activeDays < 20) s -= 1;
      break;
    }
    default: s += 0;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Revisión mensual
// ---------------------------------------------------------------------------

export function aiMonthly(sim: Sim, c: CountryState): void {
  const advanced = sim.state.settings.advancedAI;
  manageBudget(sim, c);
  manageTaxes(sim, c);
  manageMonetary(sim, c);
  manageResearch(sim, c);
  manageMilitary(sim, c);
  if (advanced) {
    manageLaws(sim, c);
    manageDiplomacy(sim, c);
    manageWar(sim, c);
    manageProjects(sim, c);
  } else manageWarBasic(sim, c);
}

function manageBudget(sim: Sim, c: CountryState): void {
  const prof = profileOf(c);
  const ngdp = nominalGDP(c);
  const rev = totalRevenue(computeRevenue(sim, c)) / ngdp * 100;
  const interest = c.fiscal.interest / ngdp * 100;
  const debtRatio = (c.fiscal.debtDomestic + c.fiscal.debtForeign * c.econ.exchangeRate) / ngdp;
  let allowedDeficit = 2.5 - (debtRatio > 0.8 ? 2.5 : debtRatio > 0.6 ? 1.2 : 0) + (c.econ.outputGap < -0.03 ? 1.5 : 0);
  if (!canBorrow(sim, c).ok) allowedDeficit = -0.5;
  const lp = sim.params(c);
  if (lp.fiscalRule < 50) allowedDeficit = Math.min(allowedDeficit, lp.fiscalRule * 0.9);
  const target = Math.max(5, rev + allowedDeficit - interest);
  const threat = threatLevel(sim, c);
  const want: Record<BudgetCategory, number> = { ...c.budget };
  // defensa según amenaza y perfil; mantener las tropas existentes financiadas
  const readiness = c.cooldowns.readiness ?? 1;
  want.defense = clamp(c.budget.defense * (readiness < 1 ? 1.08 : readiness > 1.4 ? 0.97 : 1) * (threat > 1.2 ? 1.06 : threat < 0.4 ? 0.98 : 1) * (prof.budget.defense ? Math.pow(prof.budget.defense, 0.05) : 1), 0.2, 30);
  const flexCats = BUDGET_CATEGORIES.filter((k) => k !== 'defense');
  const flexNow = flexCats.reduce((a, k) => a + c.budget[k], 0);
  const flexTarget = Math.max(3, target - want.defense);
  // reasignación suave por perfil y necesidades sociales
  for (const k of flexCats) {
    let w = prof.budget[k] ?? 1;
    if (k === 'health' && c.stocks.health < 0.5) w *= 1.1;
    if (k === 'education' && c.stocks.humanCapital < 0.4) w *= 1.08;
    if (k === 'infrastructure' && c.stocks.infrastructure < 0.4) w *= 1.08;
    if (k === 'transfers' && c.econ.poverty > 0.3) w *= 1.08;
    if (k === 'security' && c.politics.crime > 50) w *= 1.08;
    want[k] = c.budget[k] * Math.pow(w, 0.05);
  }
  const wantFlex = flexCats.reduce((a, k) => a + want[k], 0);
  const scale = flexNow > 0 ? clamp(flexTarget / Math.max(0.1, wantFlex), 0.93, 1.06) : 1;
  for (const k of flexCats) c.budget[k] = Math.round(clamp(want[k] * scale, 0, 40) * 100) / 100;
  c.budget.defense = Math.round(want.defense * 100) / 100;
}

function manageTaxes(sim: Sim, c: CountryState): void {
  const ngdp = nominalGDP(c);
  const balance = c.fiscal.balance / ngdp;
  const lp = sim.params(c);
  const base = totalRevenue(computeRevenue(sim, c));
  const candidates: TaxId[] = ['vat', 'income', 'corporate', 'payroll', 'excise', 'import'];
  if (balance < -0.04 || (!canBorrow(sim, c).ok && balance < 0)) {
    // subir el impuesto con mejor rendimiento marginal y menor rechazo
    let best: TaxId | null = null, bestScore = 0;
    for (const t of candidates) {
      const old = c.taxes[t];
      c.taxes[t] = old + 0.01;
      const gain = totalRevenue(computeRevenue(sim, c)) - base;
      c.taxes[t] = old;
      const pain = t === 'income' ? 1.3 : t === 'vat' ? 1.1 : t === 'corporate' ? 1.2 : t === 'import' ? 0.8 + lp.tradeBarriers : 1;
      const score = gain / pain;
      if (gain > 0 && score > bestScore) { bestScore = score; best = t; }
    }
    if (best) c.taxes[best] = clamp(c.taxes[best] + 0.01, 0, 0.6);
  } else if (balance > 0.02 || c.econ.outputGap < -0.05) {
    // bajar el impuesto más distorsivo
    const t: TaxId = c.taxes.corporate > 0.3 ? 'corporate' : c.taxes.income > 0.3 ? 'income' : c.taxes.payroll > 0.15 ? 'payroll' : 'vat';
    c.taxes[t] = clamp(c.taxes[t] - 0.01, 0, 0.6);
  }
  for (const t of TAXES) c.taxes[t] = Math.round(c.taxes[t] * 1000) / 1000;
}

function manageMonetary(sim: Sim, c: CountryState): void {
  const lp = sim.params(c);
  if (lp.cbIndependence > 0.5) { c.fiscal.monetization = 0; return; }
  const e = c.econ;
  const taylor = 0.02 + e.inflation + 0.4 * (e.inflation - 0.04) + 0.4 * e.outputGap;
  e.policyRate = clamp(e.policyRate + clamp(taylor - e.policyRate, -0.02, 0.02), 0, 2);
  const needsPrint = !canBorrow(sim, c).ok;
  const populist = ['socialist', 'rentier', 'ideological'].includes(c.ai.profile) ? 0.2 : 0;
  c.fiscal.monetization = clamp((needsPrint ? 0.5 : 0.05) + populist - (e.inflation > 0.5 ? 0.3 : 0), 0, 0.9);
}

function manageResearch(sim: Sim, c: CountryState): void {
  if (c.tech.queue.length >= 2) return;
  const prof = profileOf(c);
  const options = availableTechs(c).filter((t) => !c.tech.queue.includes(t.id));
  const scored = options.map((t) => ({ t, s: (prof.research[t.area] ?? 1) * 1000 / (t.cost * (1 + Math.max(0, t.year - (1990 + sim.day / 360)) * 0.1)) * (0.8 + 0.4 * (hashString(c.id + t.id) / 4294967296)) }));
  scored.sort((a, b) => b.s - a.s);
  for (const { t } of scored) { if (c.tech.queue.length >= 2) break; c.tech.queue.push(t.id); }
}

function manageMilitary(sim: Sim, c: CountryState): void {
  const prof = profileOf(c);
  c.military.production = { ...prof.production };
  const threat = threatLevel(sim, c);
  const units = Object.values(sim.state.units).filter((u) => u.owner === c.id);
  const land = units.filter((u) => u.domain === 'land');
  const readiness = c.cooldowns.readiness ?? 1;
  const target = Math.max(2, Math.round(c.ai.targetArmy * (threat > 1 ? 1.15 : 1) * prof.army));
  if (land.length < target && readiness > 1.05 && c.fiscal.treasury > 0) {
    const type: UnitType = c.military.equipment.vehicles >= UNIT_INFO.mechanized.equipment.vehicles && sim.rng.chance(0.4) ? 'mechanized' : 'infantry';
    const spot = Object.values(sim.state.provinces).find((p) => p.id === c.capital && p.controller === c.id) ?? Object.values(sim.state.provinces).find((p) => p.owner === c.id && p.controller === c.id);
    if (spot) recruit(sim, c, type, spot.id);
  }
  // mantener un plan de defensa de fronteras amenazadas
  const atWarNow = Object.values(sim.state.wars).some((w) => (w.status === 'active' || w.status === 'preparing' || w.status === 'frozen') && w.participants.some((p) => p.country === c.id));
  const existing = Object.values(sim.state.plans).find((p) => p.owner === c.id && p.kind === 'front_defense' && p.active);
  if ((atWarNow || threat > 0.8) && !existing && land.length) {
    const id = sim.nextId('PL');
    sim.state.plans[id] = { id, owner: c.id, kind: 'front_defense', units: land.filter((u) => u.status !== 'training').slice(0, Math.ceil(land.length * 0.7)).map((u) => u.id), targets: [], enemy: null, createdDay: sim.day, active: true };
  } else if (existing && !atWarNow && threat < 0.5) existing.active = false;
}

function manageLaws(sim: Sim, c: CountryState): void {
  if (c.politics.politicalCapital < 45 || c.bills.some((b) => b.status === 'debate')) return;
  if (!sim.rng.chance(0.08)) return;
  const ideal = govIdeology(c);
  let best: { law: string; opt: string; score: number } | null = null;
  for (const law of LAWS) {
    if (law.constitutional) continue;
    const cur = lawOption(law.id, c.laws[law.id]);
    for (const opt of law.options) {
      if (opt.id === c.laws[law.id]) continue;
      let score = 0;
      for (const [g, v] of Object.entries(opt.groups)) score += (v ?? 0) * (c.groups[g as keyof typeof c.groups]?.weight ?? 0) * 3;
      for (const [g, v] of Object.entries(cur?.groups ?? {})) score -= (v ?? 0) * (c.groups[g as keyof typeof c.groups]?.weight ?? 0) * 3;
      for (const [d, v] of Object.entries(opt.dims)) score += (v ?? 0) * (ideal[d as keyof typeof ideal] ?? 0) * 0.6;
      for (const [d, v] of Object.entries(cur?.dims ?? {})) score -= (v ?? 0) * (ideal[d as keyof typeof ideal] ?? 0) * 0.6;
      // respuestas a crisis
      if (law.id === 'centralBank' && opt.id === 'independent' && c.econ.inflation > 0.4) score += 2;
      if (law.id === 'minorities' && opt.id === 'autonomy' && c.politics.separatism > 0.4) score += 1.5;
      if (score > 1 && (!best || score > best.score) && checkLawProposal(sim, c, law.id, opt.id).ok) best = { law: law.id, opt: opt.id, score };
    }
  }
  if (best) proposeLaw(sim, c, best.law, best.opt);
}

function manageDiplomacy(sim: Sim, c: CountryState): void {
  const st = sim.state;
  const prof = profileOf(c);
  const others = sim.aliveCountries().filter((o) => o.id !== c.id);
  const r = sim.rng;
  // tratados comerciales con socios amistosos
  if (r.chance(0.3 * prof.trade)) {
    const cand = others.filter((o) => !hasTreaty(st, c.id, o.id, 'trade_agreement') && relation(st, c.id, o.id).opinion > 15 && !atWar(st, c.id, o.id)).sort((a, b) => b.econ.realGDP - a.econ.realGDP)[0];
    if (cand) createProposal(sim, c, cand, 'trade_agreement', {}, 'Proponemos reducir aranceles mutuos.');
  }
  // alianzas defensivas frente a amenazas comunes
  if (r.chance(0.08) && sim.params(c).militaryPosture >= 0.2) {
    const enemies = others.filter((o) => relation(st, c.id, o.id).opinion < -45);
    for (const e of enemies) {
      const ally = others.find((o) => o.id !== e.id && relation(st, o.id, e.id).opinion < -40 && relation(st, c.id, o.id).opinion > 30 && !hasTreaty(st, c.id, o.id, 'defensive_alliance'));
      if (ally) { createProposal(sim, c, ally, 'defensive_alliance', {}, `Frente a la amenaza de ${e.name}, proponemos una alianza defensiva.`); break; }
    }
  }
  // no agresión con vecinos fuertes
  if (r.chance(0.08)) {
    const strong = others.filter((o) => relation(st, c.id, o.id).border && !hasTreaty(st, c.id, o.id, 'non_aggression') && estimatedStrength(sim, c, o) > landStrength(sim, c.id) * 1.5 && relation(st, c.id, o.id).opinion > -40);
    if (strong[0]) createProposal(sim, c, strong[0], 'non_aggression', { years: 10 }, 'Garanticemos la paz en nuestra frontera.');
  }
  // sanciones a enemigos jurados
  if (r.chance(0.05)) {
    const enemy = others.find((o) => relation(st, c.id, o.id).opinion < -75 && !relation(st, c.id, o.id).sanctions.includes(c.id));
    if (enemy) diploSanction(sim, c, enemy);
  }
  // ayuda a aliados en crisis
  if (r.chance(0.1) && c.fiscal.balance > 0 && c.econ.realGDP > 300) {
    const needy = others.find((o) => relation(st, c.id, o.id).opinion > 45 && (o.fiscal.inDefault || o.econ.foodShortage > 0.1 || o.econ.outputGap < -0.08));
    if (needy) createProposal(sim, c, needy, 'economic_aid', { amount: Math.min(5, c.econ.realGDP * 0.002) }, 'Ofrecemos ayuda ante sus dificultades.');
  }
  // reconocer nuevos Estados
  for (const o of others) {
    const rel = relation(st, c.id, o.id);
    if (!rel.recognized && o.createdDay > 0 && (!o.successorOf || relation(st, c.id, o.successorOf).opinion < 30) && r.chance(0.15)) {
      rel.recognized = true;
      rel.embassies = true;
      sim.emit('recognition', 'world', 'minor', [c.id, o.id], `${c.name} reconoce a ${o.name}`, '');
    }
  }
  // préstamos a países necesitados con buena relación
  if (r.chance(0.04) && c.fiscal.treasury > nominalGDP(c) * 0.04 && c.econ.realGDP > 500) {
    const borrower = others.find((o) => relation(st, c.id, o.id).opinion > 25 && !canBorrow(sim, o).ok && !o.fiscal.inDefault);
    if (borrower) createProposal(sim, c, borrower, 'loan', { amount: Math.min(10, borrower.econ.realGDP * 0.03), rate: 0.06, years: 10 }, 'Ofrecemos un préstamo bilateral.');
  }
}

function diploSanction(sim: Sim, c: CountryState, target: CountryState): void {
  const r = relation(sim.state, c.id, target.id);
  r.sanctions.push(c.id);
  r.opinion = Math.max(-100, r.opinion - 15);
  sim.emit('sanctions', 'world', 'major', [c.id, target.id], `${c.name} sanciona a ${target.name}`, 'Se restringe el comercio bilateral.');
}

function manageWar(sim: Sim, c: CountryState): void {
  const st = sim.state;
  const prof = profileOf(c);
  const myWars = Object.values(st.wars).filter((w) => w.status !== 'ended' && w.participants.some((p) => p.country === c.id));
  const land = Object.values(st.units).filter((u) => u.owner === c.id && u.domain === 'land' && u.status !== 'training');
  for (const w of myWars) {
    const side = w.participants.find((p) => p.country === c.id)!.side;
    const myScore = side === 'attacker' ? w.warscore : -w.warscore;
    const enemyLeader = side === 'attacker' ? w.defender : w.attacker;
    const enemies = warParticipants(w, side === 'attacker' ? 'defender' : 'attacker');
    if (w.status === 'preparing' && !w.ready.includes(c.id)) w.ready.push(c.id);
    if (w.status === 'active') {
      // ofensiva si hay superioridad local
      const myStr = landStrength(sim, c.id);
      const enStr = enemies.reduce((a, e) => a + (st.countries[e] ? estimatedStrength(sim, c, st.countries[e]) : 0), 0);
      const hasOffensive = Object.values(st.plans).some((p) => p.owner === c.id && p.kind === 'offensive' && p.active);
      if (!hasOffensive && myStr > enStr * 1.15 && land.length > 2) {
        const targets = Object.values(st.provinces).filter((p) => enemies.includes(p.controller) && sim.idx.provinces.get(p.id)!.neighbors.some((l) => st.provinces[l.to]?.controller === c.id)).map((p) => p.id);
        const goals = w.goal.provinces.filter((p) => enemies.includes(st.provinces[p]?.controller ?? ''));
        const tg = [...new Set([...goals, ...targets])].slice(0, 8);
        if (tg.length) {
          const id = sim.nextId('PL');
          const front = Object.values(st.plans).find((p) => p.owner === c.id && p.kind === 'front_defense' && p.active);
          const attackers = land.filter((u) => !front || !front.units.includes(u.id) || sim.rng.chance(0.5)).slice(0, Math.ceil(land.length * 0.6)).map((u) => u.id);
          if (front) front.units = front.units.filter((u) => !attackers.includes(u));
          st.plans[id] = { id, owner: c.id, kind: 'offensive', units: attackers, targets: tg, enemy: enemyLeader, createdDay: sim.day, active: true };
        }
      }
      // paz
      const leader = w.participants.find((p) => p.country === c.id)?.leader;
      if (leader && w.activeDays > 30) {
        const pending = Object.values(st.proposals).some((p) => p.status === 'pending' && p.from === c.id && (p.type === 'peace' || p.type === 'ceasefire'));
        if (!pending) {
          const enemy = st.countries[enemyLeader];
          if (enemy && (myScore < -35 || c.military.warExhaustion > 0.55)) {
            createProposal(sim, c, enemy, 'peace', { warId: w.id, provinces: [], truceYears: 5 }, 'Proponemos una paz sin anexiones.');
          } else if (enemy && myScore > 40) {
            const occupied = Object.values(st.provinces).filter((p) => p.owner === enemy.id && p.controller === c.id).map((p) => p.id);
            const claimsHeld = occupied.filter((p) => c.claims.includes(p) || w.goal.provinces.includes(p));
            const take = (claimsHeld.length ? claimsHeld : occupied).slice(0, 6);
            createProposal(sim, c, enemy, 'peace', { warId: w.id, provinces: take, provincesTo: c.id, truceYears: 10 }, 'Exigimos la cesión de los territorios ocupados.');
          }
        }
      }
    }
  }
  // declaraciones de guerra (raras, solo perfiles agresivos con reivindicaciones y superioridad)
  if (myWars.length || prof.aggression < 0.3) return;
  if (sim.day - c.ai.lastWarCheck < 360 || sim.day < 180) return;
  c.ai.lastWarCheck = sim.day;
  if (c.politics.stability < 45 || c.military.warExhaustion > 0.05) return;
  const myStr = landStrength(sim, c.id);
  const cands = sim.aliveCountries().filter((o) => o.id !== c.id && c.claims.some((pid) => st.provinces[pid]?.owner === o.id) && relation(st, c.id, o.id).opinion < -40);
  for (const o of cands) {
    let defense = estimatedStrength(sim, c, o);
    for (const t of Object.values(st.treaties)) if (t.status === 'active' && (t.type === 'defensive_alliance' || t.type === 'military_alliance') && t.parties.includes(o.id)) for (const a of t.parties) if (a !== o.id && st.countries[a]) defense += estimatedStrength(sim, c, st.countries[a]) * 0.6;
    for (const org of Object.values(st.organizations)) if (org.mutualDefense && org.members.includes(o.id) && !org.members.includes(c.id)) for (const m of org.members) if (m !== o.id && st.countries[m]) defense += estimatedStrength(sim, c, st.countries[m]) * 0.4;
    const ratio = myStr / Math.max(1, defense);
    if (ratio > 2.2 / prof.aggression * 0.5 + 1.2 && sim.rng.chance(0.25 * prof.aggression)) {
      const goals = c.claims.filter((pid) => st.provinces[pid]?.owner === o.id);
      c.politics.politicalCapital = Math.max(c.politics.politicalCapital, 40);
      declareWar(sim, c, o, 'claims', goals);
      break;
    }
  }
}

function manageWarBasic(sim: Sim, c: CountryState): void {
  for (const w of Object.values(sim.state.wars)) {
    if (w.status === 'preparing' && w.participants.some((p) => p.country === c.id) && !w.ready.includes(c.id)) w.ready.push(c.id);
  }
}

function manageProjects(sim: Sim, c: CountryState): void {
  if (c.projects.filter((p) => p.status === 'active').length >= 3) return;
  if (c.fiscal.balance < 0 && !canBorrow(sim, c).ok) return;
  if (!sim.rng.chance(0.3)) return;
  const owned = Object.values(sim.state.provinces).filter((p) => p.owner === c.id && p.controller === c.id);
  if (!owned.length) return;
  let choice: { prov: string; kind: Parameters<typeof startBuild>[3] } | null = null;
  if (c.econ.energyShortage > 0.05) choice = { prov: owned.sort((a, b) => b.pop - a.pop)[0].id, kind: 'power_plant' };
  else if (threatLevel(sim, c) > 1) {
    const border = owned.filter((p) => sim.idx.provinces.get(p.id)!.neighbors.some((l) => { const o = sim.state.provinces[l.to]?.owner; return o && o !== c.id && relation(sim.state, c.id, o).opinion < -30; }));
    if (border.length) choice = { prov: border[0].id, kind: 'fortification' };
  }
  if (!choice) {
    const lowInfra = owned.filter((p) => p.infra < 0.6).sort((a, b) => b.pop - a.pop)[0];
    if (lowInfra) choice = { prov: lowInfra.id, kind: 'road' };
    else if (c.ai.profile === 'scientific' || c.ai.profile === 'trader') choice = { prov: c.capital, kind: 'university' };
  }
  if (choice) startBuild(sim, c, choice.prov, choice.kind);
  void population; void dimDistance; void GROUP_INFO; void TECHS; void TECH_BY_ID; void sumBudget;
}
