import { SOCIAL_GROUPS, POLITICAL_DIMENSIONS, type CountryState, type GroupId, type Party, type DimVector, type Bill, type ProvinceState } from '@cyo/shared';
import { clamp, approach } from '../rng.js';
import { Sim } from './context.js';
import { population, avgStateShare, nominalGDP } from './economy.js';
import { LAWS, LAW_BY_ID, lawOption, isDemocratic, type LawOption } from '../data/laws.js';
import { GROUP_INFO, REGIME_INFO, dimDistance } from '../data/politics.js';
import { UNIT_INFO } from '../data/units.js';

/**
 * POLÍTICA Y SOCIEDAD.
 * - Grupos sociales con tamaño, satisfacción, radicalización y peso político propios.
 * - Aprobación (opinión pública), legitimidad (aceptación institucional), capacidad administrativa
 *   y estabilidad son variables distintas que evolucionan con causas distintas.
 * - Elecciones según el sistema electoral; parlamento con escaños; leyes aprobadas por votación,
 *   decreto o voluntad del régimen según la forma de gobierno.
 */

export function groupSizes(sim: Sim, c: CountryState, owned: ProvinceState[]): Record<GroupId, number> {
  const pop = Math.max(0.01, population(c));
  const s = c.econ.sectors;
  const adultShare = c.demography.adult / pop;
  const empShare = c.econ.employed / Math.max(0.01, c.demography.adult);
  const labourTotal = Object.values(s).reduce((a, x) => a + x.labor, 0) || 1;
  const share = (keys: (keyof typeof s)[]) => keys.reduce((a, k) => a + s[k].labor, 0) / labourTotal;
  let minority = 0;
  for (const p of owned) if (p.culture !== c.culture) minority += p.pop;
  const personnel = c.military.personnel / 1000;
  const pubSpend = (c.budget.education + c.budget.health + c.budget.administration + c.budget.security + c.budget.justice) / 100;
  return {
    workers: adultShare * empShare * share(['industry', 'construction', 'mining', 'transport', 'energy', 'oil', 'gas', 'defense']),
    farmers: adultShare * empShare * share(['agriculture', 'livestock']) + c.demography.adult / pop * c.econ.informality * 0.2,
    business: adultShare * (0.015 + 0.04 * (1 - avgStateShare(c))),
    middle: adultShare * empShare * share(['services', 'finance', 'tech', 'telecom', 'tourism']) * (1 - c.econ.informality * 0.5),
    public: adultShare * empShare * clamp(pubSpend * 0.9, 0.03, 0.3),
    pensioners: c.demography.old / pop,
    youth: (c.demography.young * 0.33 + c.demography.adult * 0.17) / pop,
    military: clamp(personnel / pop, 0, 0.1),
    religious: c.demography.religiosity * 0.55,
    minorities: minority / pop
  };
}

/** Opinión de un grupo sobre el conjunto de leyes vigentes. */
function lawOpinion(c: CountryState, g: GroupId): number {
  let v = 0;
  for (const law of LAWS) {
    const opt = lawOption(law.id, c.laws[law.id]);
    if (opt?.groups[g]) v += opt.groups[g]!;
  }
  return v;
}

export function groupTargets(sim: Sim, c: CountryState): Record<GroupId, number> {
  const e = c.econ, lp = sim.params(c), b = c.budget, pol = c.politics;
  const infl = clamp(e.inflation, -0.05, 3);
  const growth = clamp(e.growth, -0.2, 0.2);
  const general = 50 + 120 * growth - 40 * Math.min(1.2, Math.max(0, infl - 0.03)) - 60 * e.unemployment - 60 * e.foodShortage - 20 * c.military.warExhaustion - 25 * e.energyShortage * 0.5;
  const ngdp = nominalGDP(c);
  const arrears = clamp(c.fiscal.arrears / Math.max(1e-6, ngdp * 0.02), 0, 1);
  const pensionNeed = c.demography.old / Math.max(0.01, population(c)) * lp.pensionGenerosity * 60;
  const privAnger = c.cooldowns.privatizationAnger ?? 0;
  const t: Record<GroupId, number> = {
    workers: general - 120 * e.unemployment + 25 * Math.tanh((e.wage - (c.cooldowns.wage0 ?? e.wage)) / Math.max(0.5, c.cooldowns.wage0 ?? 1)) - 25 * e.poverty - privAnger * 0.8 + 3 * b.transfers,
    farmers: general + 8 * b.subsidies - 40 * c.taxes.export + 10 * Math.min(0.3, c.taxes.import) - 15 * e.poverty,
    business: general + 20 * (e.confidence - 50) / 50 - 80 * Math.max(0, c.taxes.corporate - 0.25) - 60 * c.taxes.wealth - 20 * Math.max(0, c.taxes.income - 0.35) + 10 * (lp.judicialIndependence - 0.5) - 25 * (c.fiscal.inDefault ? 1 : 0),
    middle: general - 60 * Math.max(0, c.taxes.income - 0.25) - 30 * Math.max(0, c.taxes.vat - 0.15) - 25 * (pol.corruption / 100) + 2 * (b.education + b.health) / 2,
    public: general + 3 * (b.administration + b.education + b.health - 9) - 50 * arrears - privAnger * 0.6,
    pensioners: general - 40 * Math.max(0, infl - 0.05) + 6 * (b.transfers - pensionNeed * 0.25) + 2 * b.health,
    youth: general - 150 * e.unemployment + 3 * b.education + 10 * lp.universityAccess + 8 * (c.tech.known.includes('world_web') ? 1 : 0),
    military: 45 + 5 * (b.defense - 2.5) + 10 * (c.cooldowns.warSuccess ?? 0) - 10 * c.military.warExhaustion + (c.regime === 'military_junta' ? 15 : 0),
    religious: 50 + 30 * (c.demography.religiosity - 0.5) + 10 * lp.stateReligion,
    minorities: 50 - 25 * (1 - lp.minorityRights) - 15 * lp.centralization - 10 * e.poverty
  };
  for (const g of SOCIAL_GROUPS) t[g] = clamp(t[g] + lawOpinion(c, g) * 1.4, 0, 100);
  return t;
}

export function politicsStep(sim: Sim, c: CountryState, owned: ProvinceState[], dt: number): void {
  const pol = c.politics, lp = sim.params(c);
  const sizes = groupSizes(sim, c, owned);
  const targets = groupTargets(sim, c);
  const demo = lp.democracy;
  let wsum = 0, approval = 0, radical = 0, rsize = 0;
  for (const g of SOCIAL_GROUPS) {
    const gs = c.groups[g];
    gs.size = sizes[g];
    gs.sat = approach(gs.sat, targets[g], dt, 0.4);
    const radTarget = clamp((35 - gs.sat) / 35 + lp.repression * 0.3 * (gs.sat < 40 ? 1 : 0), 0, 1);
    gs.radical = approach(gs.radical, radTarget, dt, gs.radical < radTarget ? 1.5 : 3);
    gs.weight = gs.size * (demo + (1 - demo) * GROUP_INFO[g].elite);
    wsum += gs.weight;
    approval += gs.weight * gs.sat;
    radical += gs.radical * gs.size;
    rsize += gs.size;
  }
  pol.approval = approach(pol.approval, wsum > 0 ? approval / wsum : 50, dt, 0.15);
  const avgRadical = rsize > 0 ? radical / rsize : 0;

  // legitimidad
  const regime = REGIME_INFO[c.regime];
  const growth = c.econ.growth;
  const recentDecrees = Math.min(6, pol.decreesThisYear);
  const legTarget = clamp(regime.baseLegitimacy + 15 * (pol.ruleOfLaw - 50) / 50 + 10 * Math.tanh(growth * 8) * (1 - demo * 0.6)
    + 15 * (pol.approval - 50) / 50 * (1 - demo * 0.5) - 4 * recentDecrees - 25 * lp.repression - 15 * (c.cooldowns.lostWar ?? 0)
    + (demo > 0.6 && pol.lastElectionDay > sim.day - 360 * 5 ? 5 : 0) - 10 * (pol.corruption / 100), 2, 98);
  pol.legitimacy = approach(pol.legitimacy, legTarget, dt, 2.5);

  // protestas, huelgas, crimen
  const assemblyFree = c.laws.assembly === 'free' ? 1 : c.laws.assembly === 'permit' ? 0.6 : 0.25;
  const discontent = SOCIAL_GROUPS.reduce((a, g) => a + c.groups[g].size * Math.max(0, 40 - c.groups[g].sat) / 40, 0) / Math.max(0.01, rsize);
  pol.protest = approach(pol.protest, clamp(discontent * 1.6 * assemblyFree * (1 - lp.repression * 0.6) + avgRadical * 0.4, 0, 1), dt, 0.15);
  pol.strikes = approach(pol.strikes, clamp((40 - c.groups.workers.sat) / 40 * (0.3 + lp.unionPower) * (c.laws.unions === 'banned' ? 0.3 : 1), 0, 1), dt, 0.2);
  pol.crime = approach(pol.crime, clamp(100 * (0.15 + 0.6 * c.econ.poverty + 0.6 * c.econ.unemployment - 0.35 * c.stocks.security + 0.15 * (pol.corruption / 100)), 1, 100), dt, 1.5);

  // provincias: malestar y separatismo
  let sepSum = 0, sepPop = 0;
  for (const p of owned) {
    const minority = p.culture !== c.culture;
    const occupied = p.controller !== c.id;
    const base = minority
      ? 0.05 + 0.28 * (1 - lp.minorityRights) + 0.4 * Math.max(0, (45 - c.groups.minorities.sat) / 45) + 0.15 * c.groups.minorities.radical - 0.3 * p.autonomy
      : 0.12 * (1 - pol.approval / 100) + 0.25 * c.econ.poverty;
    const target = clamp(base + 0.3 * p.devastation + (occupied ? 0.2 : 0) - 0.25 * c.stocks.security * (minority ? 0.5 : 1) + 0.2 * pol.protest, 0, 1);
    p.unrest = approach(p.unrest, target, dt, 1);
    if (minority) { sepSum += p.unrest * p.pop; sepPop += p.pop; }
  }
  pol.separatism = sepPop > 0 ? sepSum / Math.max(sepPop, population(c) * 0.1) : 0;

  // estabilidad
  const stabTarget = clamp(10 + 0.35 * pol.approval + 0.35 * pol.legitimacy + 15 * c.stocks.security - 30 * avgRadical - 25 * pol.protest - 15 * pol.separatism - 15 * c.military.warExhaustion - 10 * c.econ.foodShortage - 8 * (c.cooldowns.reformFatigue ?? 0), 0, 100);
  pol.stability = approach(pol.stability, stabTarget, dt, 0.5);
  if (c.cooldowns.reformFatigue) c.cooldowns.reformFatigue *= Math.exp(-dt / 0.4);
  pol.coupRisk = clamp((45 - c.groups.military.sat) / 45 * 0.6 + (50 - pol.legitimacy) / 50 * 0.5 + (1 - demo) * 0.2 - (demo > 0.7 && pol.ruleOfLaw > 60 ? 0.5 : 0), 0, 1);
  // capital político: lo genera el apoyo, lo consumen las reformas
  pol.politicalCapital = clamp(pol.politicalCapital + dt * (6 + 10 * (pol.approval - 45) / 50 + 6 * (pol.legitimacy - 50) / 50), 0, 100);
  if (sim.day % 360 === 0) pol.decreesThisYear = 0;
}

// ---------------------------------------------------------------------------
// Elecciones
// ---------------------------------------------------------------------------

export function voteShares(sim: Sim, c: CountryState): Record<string, number> {
  const legal = c.parties.filter((p) => p.legal);
  const votes: Record<string, number> = Object.fromEntries(legal.map((p) => [p.id, 0]));
  let total = 0;
  for (const g of SOCIAL_GROUPS) {
    const gs = c.groups[g];
    if (gs.size <= 0) continue;
    const utils = legal.map((p) => {
      const inGov = c.politics.governmentParties.includes(p.id);
      return -dimDistance(gs.ideal, p.pos) * 7 + (inGov ? (gs.sat - 50) / 18 : -(gs.sat - 50) / 40) + p.popularity;
    });
    const mx = Math.max(...utils);
    const ex = utils.map((u) => Math.exp(u - mx));
    const sum = ex.reduce((a, b) => a + b, 0);
    const turnout = 0.5 + 0.3 * (1 - gs.sat / 100) * 0 + 0.2 * Math.min(1, gs.radical + 0.5);
    legal.forEach((p, i) => { const v = gs.size * turnout * ex[i] / sum; votes[p.id] += v; total += v; });
  }
  for (const k of Object.keys(votes)) votes[k] = total > 0 ? votes[k] / total : 0;
  return votes;
}

export function allocateSeats(system: string, votes: Record<string, number>, seats: number): Record<string, number> {
  const entries = Object.entries(votes);
  const power = system === 'majoritarian' ? 2.4 : system === 'mixed' ? 1.5 : 1;
  const threshold = system === 'proportional' ? 0.03 : 0.05;
  const adj = entries.map(([k, v]) => [k, v < threshold ? 0 : Math.pow(v, power)] as [string, number]);
  const sum = adj.reduce((a, [, v]) => a + v, 0) || 1;
  const out: Record<string, number> = {};
  let assigned = 0;
  const rema: [string, number][] = [];
  for (const [k, v] of adj) { const exact = v / sum * seats; out[k] = Math.floor(exact); assigned += out[k]; rema.push([k, exact - out[k]]); }
  rema.sort((a, b) => b[1] - a[1]);
  for (let i = 0; assigned < seats && i < rema.length; i++, assigned++) out[rema[i][0]]++;
  return out;
}

/** Forma gobierno: partido más votado + socios ideológicamente cercanos hasta mayoría. */
export function formGovernment(c: CountryState): string[] {
  const seats = c.parliament;
  const total = Object.values(seats).reduce((a, b) => a + b, 0) || 1;
  const ranked = c.parties.filter((p) => (seats[p.id] ?? 0) > 0).sort((a, b) => (seats[b.id] ?? 0) - (seats[a.id] ?? 0));
  if (!ranked.length) return c.politics.governmentParties;
  const lead = ranked[0];
  const gov = [lead.id];
  let sum = seats[lead.id];
  const partners = ranked.slice(1).sort((a, b) => dimDistance(a.pos, lead.pos) - dimDistance(b.pos, lead.pos));
  for (const p of partners) {
    if (sum / total > 0.5) break;
    if (dimDistance(p.pos, lead.pos) > 0.6) continue;
    gov.push(p.id);
    sum += seats[p.id];
  }
  return gov;
}

export function holdElection(sim: Sim, c: CountryState): void {
  const votes = voteShares(sim, c);
  const system = c.laws.electoral;
  c.parliament = allocateSeats(system, votes, c.seats);
  for (const p of c.parties) p.vote = votes[p.id] ?? 0;
  const before = c.politics.governmentParties.slice();
  c.politics.governmentParties = formGovernment(c);
  c.politics.lastElectionDay = sim.day;
  const term = sim.params(c).termYears;
  c.politics.nextElectionDay = sim.day + Math.round(term * 360);
  const lead = c.parties.find((p) => p.id === c.politics.governmentParties[0]);
  const changed = before[0] !== c.politics.governmentParties[0];
  const results = c.parties.filter((p) => p.legal).sort((a, b) => b.vote - a.vote).slice(0, 4).map((p) => `${p.short} ${(p.vote * 100).toFixed(1)} %`).join(', ');
  sim.emit('election', 'world', changed ? 'major' : 'minor', [c.id], `Elecciones en ${c.name}: ${changed ? 'cambio de gobierno' : 'continuidad'}`,
    `${lead?.name ?? 'El oficialismo'} encabezará el gobierno. Resultados: ${results}.`);
  // los partidos que pierden el gobierno recuperan popularidad; el oficialismo se desgasta
  for (const p of c.parties) p.popularity = clamp(p.popularity * 0.7 + (c.politics.governmentParties.includes(p.id) ? -0.05 : 0.05), -1, 1);
}

export function electionsStep(sim: Sim, c: CountryState): void {
  const lp = sim.params(c);
  if (!isDemocratic(c.regime) || c.laws.electoral === 'none') return;
  if (c.politics.nextElectionDay === null) c.politics.nextElectionDay = sim.day + Math.round(lp.termYears * 360);
  // crisis de gobierno: elecciones anticipadas en sistemas parlamentarios con muy baja aprobación
  if (c.regime !== 'presidential_republic' && c.politics.approval < 22 && sim.day - c.politics.lastElectionDay > 360 && sim.rng.chance(0.004)) {
    sim.emit('snap_election', 'national', 'major', [c.id], `Crisis de gobierno en ${c.name}`, 'El gobierno pierde la confianza del parlamento y se convocan elecciones anticipadas.');
    holdElection(sim, c);
    return;
  }
  if (sim.day >= c.politics.nextElectionDay) holdElection(sim, c);
}

// ---------------------------------------------------------------------------
// Legislación
// ---------------------------------------------------------------------------

export function billSupport(c: CountryState, lawId: string, optionId: string): number {
  const law = LAW_BY_ID[lawId];
  const cur = lawOption(lawId, c.laws[lawId]);
  const next = lawOption(lawId, optionId);
  if (!law || !next) return 0;
  const total = Object.values(c.parliament).reduce((a, b) => a + b, 0);
  if (total <= 0) return 1;
  let yes = 0;
  for (const p of c.parties) {
    const seats = c.parliament[p.id] ?? 0;
    if (!seats) continue;
    let score = 0;
    for (const d of POLITICAL_DIMENSIONS) score += p.pos[d] * ((next.dims[d] ?? 0) - (cur?.dims[d] ?? 0));
    if (c.politics.governmentParties.includes(p.id)) score += 0.35;
    if (score > 0) yes += seats;
  }
  return yes / total;
}

export interface ProposalCheck { ok: boolean; error?: string; cost: number; byDecree: boolean; required: number }

export function checkLawProposal(sim: Sim, c: CountryState, lawId: string, optionId: string): ProposalCheck {
  const law = LAW_BY_ID[lawId];
  const opt = law?.options.find((o) => o.id === optionId);
  if (!law || !opt) return { ok: false, error: 'Ley u opción inexistente.', cost: 0, byDecree: false, required: 0 };
  if (c.laws[lawId] === optionId) return { ok: false, error: 'Esa opción ya está vigente.', cost: 0, byDecree: false, required: 0 };
  if (c.bills.some((b) => b.law === lawId && (b.status === 'debate' || b.status === 'implementing'))) return { ok: false, error: 'Ya hay un proyecto en trámite sobre esta ley.', cost: 0, byDecree: false, required: 0 };
  const targetRegime = lawId === 'regime' ? optionId : c.regime;
  if (opt.regimes && !opt.regimes.includes(targetRegime as never)) return { ok: false, error: 'Esta opción es incompatible con la forma de gobierno vigente.', cost: 0, byDecree: false, required: 0 };
  if (lawId === 'defensePolicy' && optionId === 'neutrality' && Object.values(sim.state.organizations).some((o) => o.active && o.mutualDefense && o.members.includes(c.id))) {
    return { ok: false, error: 'La neutralidad exige abandonar antes las alianzas militares.', cost: 0, byDecree: false, required: 0 };
  }
  const regime = REGIME_INFO[c.regime];
  const cost = (opt.cost ?? 5) + (law.constitutional ? 25 : 0);
  if (c.politics.politicalCapital < cost) return { ok: false, error: `Capital político insuficiente (requiere ${cost}).`, cost, byDecree: false, required: 0 };
  const byDecree = !regime.democratic;
  const required = law.constitutional ? 0.667 : 0.5;
  return { ok: true, cost, byDecree, required };
}

export function proposeLaw(sim: Sim, c: CountryState, lawId: string, optionId: string): { ok: boolean; error?: string; bill?: Bill } {
  const chk = checkLawProposal(sim, c, lawId, optionId);
  if (!chk.ok) return { ok: false, error: chk.error };
  c.politics.politicalCapital -= chk.cost;
  const law = LAW_BY_ID[lawId];
  const bill: Bill = {
    id: sim.nextId('B'), law: lawId, option: optionId, proposedDay: sim.day,
    voteDay: chk.byDecree ? sim.day : sim.day + (law.constitutional ? 45 : 20),
    status: 'debate', support: billSupport(c, lawId, optionId), required: chk.required, effectiveDay: null, byDecree: chk.byDecree
  };
  c.bills.push(bill);
  if (chk.byDecree) resolveBill(sim, c, bill);
  return { ok: true, bill };
}

export function resolveBill(sim: Sim, c: CountryState, bill: Bill): void {
  const law = LAW_BY_ID[bill.law];
  const opt = lawOption(bill.law, bill.option)!;
  bill.support = billSupport(c, bill.law, bill.option);
  let passed = bill.byDecree || bill.support >= bill.required;
  // en repúblicas presidenciales el ejecutivo puede decretar leyes ordinarias rechazadas, a un coste
  if (!passed && c.regime === 'presidential_republic' && !law.constitutional && c.politics.legitimacy > 35) {
    passed = true;
    bill.byDecree = true;
    c.politics.decreesThisYear += 1;
    c.politics.legitimacy -= 4;
  }
  if (!passed) {
    bill.status = 'rejected';
    sim.emit('bill_rejected', 'national', 'minor', [c.id], `El parlamento de ${c.name} rechaza la reforma`, `${law.name}: «${opt.name}» obtuvo ${(bill.support * 100).toFixed(0)} % de apoyo (requería ${(bill.required * 100).toFixed(0)} %).`);
    return;
  }
  bill.status = 'implementing';
  bill.effectiveDay = sim.day + (opt.implDays ?? (law.constitutional ? 60 : 30));
  if (bill.byDecree && !REGIME_INFO[c.regime].democratic) c.politics.decreesThisYear += 0.5;
  sim.emit('bill_passed', 'national', 'minor', [c.id], `${c.name} aprueba: ${law.name}`, `«${opt.name}» entrará en vigor el día ${bill.effectiveDay - sim.day} a partir de hoy.`);
}

export function enactLaw(sim: Sim, c: CountryState, lawId: string, optionId: string, quiet = false): void {
  const prev = c.laws[lawId];
  c.laws[lawId] = optionId;
  sim.invalidateParams(c.id);
  c.cooldowns.reformFatigue = (c.cooldowns.reformFatigue ?? 0) + (LAW_BY_ID[lawId]?.constitutional ? 1 : 0.25);
  if (lawId === 'regime') applyRegimeChange(sim, c, prev, optionId, quiet);
  if (lawId === 'electoral' && optionId !== 'none' && c.politics.nextElectionDay === null) c.politics.nextElectionDay = sim.day + 180;
  if (lawId === 'defensePolicy' && optionId === 'neutrality') {
    for (const o of Object.values(sim.state.organizations)) if (o.mutualDefense) o.members = o.members.filter((m) => m !== c.id);
  }
}

export function applyRegimeChange(sim: Sim, c: CountryState, prev: string, next: string, quiet = false): void {
  c.regime = next as CountryState['regime'];
  sim.invalidateParams(c.id);
  const demNow = isDemocratic(next), demBefore = isDemocratic(prev);
  if (demNow) {
    if (c.laws.electoral === 'none') c.laws.electoral = 'proportional';
    if (c.laws.parties === 'single') c.laws.parties = 'free';
    for (const p of c.parties) p.legal = true;
    if (!demBefore) {
      c.politics.nextElectionDay = sim.day + 180;
      c.seats = c.seats || 300;
    }
  } else {
    c.laws.electoral = 'none';
    c.politics.nextElectionDay = null;
    if (demBefore) {
      c.politics.legitimacy = Math.max(5, c.politics.legitimacy - 30);
      c.groups.middle.sat -= 20;
      c.groups.youth.sat -= 20;
    }
    // el parlamento pasa a estar dominado por el partido de gobierno
    const gov = c.politics.governmentParties[0];
    c.parliament = Object.fromEntries(c.parties.map((p) => [p.id, p.id === gov ? c.seats : 0]));
    if (next === 'one_party_state') { c.laws.parties = 'single'; for (const p of c.parties) p.legal = p.id === gov; }
  }
  sim.invalidateParams(c.id);
  if (!quiet) sim.emit('regime_change', 'world', 'critical', [c.id], `Cambio de régimen en ${c.name}`, `${c.name} pasa a ser: ${REGIME_INFO[c.regime].name}.`);
}

export function billsStep(sim: Sim, c: CountryState): void {
  for (const bill of c.bills) {
    if (bill.status === 'debate' && sim.day >= bill.voteDay) resolveBill(sim, c, bill);
    else if (bill.status === 'implementing' && bill.effectiveDay !== null && sim.day >= bill.effectiveDay) {
      bill.status = 'enacted';
      enactLaw(sim, c, bill.law, bill.option);
    }
  }
  // limpiar historial antiguo
  if (c.bills.length > 40) c.bills = c.bills.filter((b) => b.status === 'debate' || b.status === 'implementing' || sim.day - b.proposedDay < 720).slice(-40);
}

export function personnel(sim: Sim, c: CountryState): number {
  let p = 0;
  for (const u of Object.values(sim.state.units)) if (u.owner === c.id) p += UNIT_INFO[u.type].manpower * u.strength;
  return p;
}

export function makeParty(id: string, name: string, short: string, family: string, color: string, pos: DimVector, legal: boolean): Party {
  return { id, name, short, family, color, pos, popularity: 0, vote: 0, legal };
}

export type { LawOption };
