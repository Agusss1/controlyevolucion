import { SECTORS, SOCIAL_GROUPS, type CountryState, type CountryId, type ProvinceState, type RegimeId } from '@cyo/shared';
import { Rng, clamp } from '../rng.js';
import { Sim, relation } from './context.js';
import { SECTOR_INDEX, population, realExchangeRate } from './economy.js';
import { PARTY_FAMILIES } from '../data/politics.js';
import { isDemocratic } from '../data/laws.js';
import { NameRegistry, adjectiveOf, personName, currencyCode, LANGUAGES } from '../worldgen/names.js';
import { randomFlag } from '../scenario/random.js';
import { formatDate } from '@cyo/shared';
import { setTransferHook } from './military.js';

/**
 * CAMBIOS DE SOBERANÍA: cesiones, anexiones por tratado, independencias, unificaciones y colapsos.
 * La población, el capital productivo (que vive en las provincias), el empleo sectorial, la deuda
 * y las unidades se transfieren de forma conservativa: nada aparece ni desaparece.
 */

function realPerLocal(c: CountryState): number { return 1 / (c.econ.priceLevel * c.econ.baseExchangeRate); }

/** Mueve población y empleo asociados a un conjunto de provincias de `from` a `to`. */
function moveEconomy(from: CountryState, to: CountryState, provs: ProvinceState[], allFromProvinces: ProvinceState[]): void {
  const fromPop = Math.max(1e-6, population(from));
  let pop = 0;
  for (const p of provs) pop += p.pop;
  const share = clamp(pop / fromPop, 0, 1);
  for (const k of ['young', 'adult', 'old'] as const) {
    const moved = from.demography[k] * share;
    from.demography[k] -= moved;
    to.demography[k] += moved;
  }
  for (const s of SECTORS) {
    const i = SECTOR_INDEX[s];
    let kAll = 0, kMoved = 0;
    for (const p of allFromProvinces) kAll += p.capital[i];
    for (const p of provs) kMoved += p.capital[i];
    const f = kAll > 0 ? kMoved / kAll : share;
    const lab = from.econ.sectors[s].labor * f;
    from.econ.sectors[s].labor -= lab;
    to.econ.sectors[s].labor += lab;
    const out = from.econ.sectors[s].output * f;
    from.econ.sectors[s].output -= out;
    to.econ.sectors[s].output += out;
  }
  from.cooldowns.resetGrowth = 1;
  to.cooldowns.resetGrowth = 1;
  const emp = from.econ.employed * share;
  from.econ.employed -= emp;
  to.econ.employed += emp;
  from.econ.laborForce *= 1 - share;
  to.econ.laborForce += emp / Math.max(0.05, 1 - to.econ.unemployment);
}

export function transferProvinces(sim: Sim, provinceIds: string[], to: CountryId, reason: string): void {
  const st = sim.state;
  const target = st.countries[to];
  const byOwner = new Map<string, ProvinceState[]>();
  for (const id of provinceIds) {
    const p = st.provinces[id];
    if (!p || p.owner === to) continue;
    const l = byOwner.get(p.owner) ?? [];
    l.push(p);
    byOwner.set(p.owner, l);
  }
  for (const [fromId, provs] of byOwner) {
    const from = st.countries[fromId];
    const all = Object.values(st.provinces).filter((p) => p.owner === fromId);
    moveEconomy(from, target, provs, all);
    for (const p of provs) {
      p.owner = to;
      p.controller = to;
      p.occupiedSince = null;
      target.claims = target.claims.filter((c) => c !== p.id);
      if (!from.claims.includes(p.id) && from.culture === p.culture) from.claims.push(p.id);
      // las unidades del antiguo dueño se repliegan
      for (const u of Object.values(st.units)) {
        if (u.owner === fromId && u.location === p.id) { u.location = from.capital; u.path = []; u.order = null; if (u.status === 'combat') u.status = 'ready'; }
      }
    }
    sim.invalidateCaches();
    const names = provs.map((p) => sim.idx.provinces.get(p.id)?.name).join(', ');
    sim.emit('territory_transfer', 'world', 'major', [fromId, to], `${from.name} cede territorio a ${target.name}`, `${reason}: ${names} pasa${provs.length > 1 ? 'n' : ''} a soberanía de ${target.name}.`);
    const remaining = Object.values(st.provinces).filter((p) => p.owner === fromId);
    if (!remaining.length) killCountry(sim, from, to, `${from.name} desaparece como Estado.`);
    else if (provs.some((p) => p.id === from.capital)) {
      const newCap = remaining.sort((a, b) => b.pop - a.pop)[0];
      from.capital = newCap.id;
      sim.emit('capital_moved', 'national', 'major', [fromId], `${from.name} traslada su capital`, `La nueva capital es ${sim.idx.provinces.get(newCap.id)?.cityName}.`);
    }
  }
}

export function killCountry(sim: Sim, c: CountryState, successor: CountryId | null, text: string): void {
  const st = sim.state;
  c.alive = false;
  for (const u of Object.values(st.units)) if (u.owner === c.id) {
    if (successor && st.countries[successor]) { u.owner = successor; u.location = st.countries[successor].capital; u.path = []; u.order = null; }
    else delete st.units[u.id];
  }
  for (const t of Object.values(st.treaties)) if (t.status === 'active' && t.parties.includes(c.id)) { t.status = 'expired'; t.endedDay = sim.day; }
  for (const o of Object.values(st.organizations)) o.members = o.members.filter((m) => m !== c.id);
  for (const p of Object.values(st.proposals)) if (p.status === 'pending' && (p.from === c.id || p.to === c.id)) { p.status = 'withdrawn'; p.resolvedDay = sim.day; }
  for (const plan of Object.values(st.plans)) if (plan.owner === c.id) plan.active = false;
  for (const w of Object.values(st.wars)) {
    if (w.status === 'ended') continue;
    const part = w.participants.find((p) => p.country === c.id);
    if (!part) continue;
    if (part.leader) { w.status = 'ended'; w.endedDay = sim.day; w.result = `${c.name} dejó de existir.`; }
    else w.participants = w.participants.filter((p) => p.country !== c.id);
  }
  // la deuda pasa al sucesor
  if (successor && st.countries[successor]) {
    const s = st.countries[successor];
    const real = (c.fiscal.debtDomestic + c.fiscal.debtForeign * c.econ.exchangeRate - c.fiscal.treasury) * realPerLocal(c);
    const local = real / realPerLocal(s);
    s.fiscal.debtDomestic += Math.max(0, local);
    if (local < 0) s.fiscal.treasury -= local;
    c.fiscal.debtDomestic = 0; c.fiscal.debtForeign = 0; c.fiscal.treasury = 0;
  }
  st.humanCountries = st.humanCountries.filter((h) => h !== c.id);
  sim.emit('state_dissolved', 'world', 'critical', [c.id], `Fin de ${c.longName}`, text);
}

/** Crea un nuevo Estado soberano a partir de provincias de `parent`. */
export function createCountry(sim: Sim, parent: CountryState, provinceIds: string[], opts: { regime?: RegimeId; reason: string; hostile: boolean }): CountryState | null {
  const st = sim.state;
  const provs = provinceIds.map((id) => st.provinces[id]).filter((p) => p && p.owner === parent.id);
  if (!provs.length) return null;
  const parentAll = Object.values(st.provinces).filter((p) => p.owner === parent.id);
  if (provs.length >= parentAll.length) return null;
  const rng = new Rng(`${st.seed}:newstate:${sim.day}:${provinceIds.join(',')}`);
  // cultura y religión dominantes del territorio
  const tally = (key: 'culture' | 'religion') => {
    const m = new Map<string, number>();
    for (const p of provs) { const k = key === 'culture' ? p.culture : sim.idx.provinces.get(p.id)!.religion; m.set(k, (m.get(k) ?? 0) + p.pop); }
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  const culture = tally('culture');
  const religion = tally('religion');
  const cdef = sim.map.cultures.find((c) => c.id === culture);
  const lang = cdef?.language ?? 'aurel';
  const names = new NameRegistry(rng);
  for (const c of Object.values(st.countries)) names.reserve(c.name);
  const base = names.country(lang);
  const regime: RegimeId = opts.regime ?? (isDemocratic(parent.regime) || rng.chance(0.6) ? 'presidential_republic' : 'military_junta');
  const id = sim.nextId('N');
  const capitalProv = provs.slice().sort((a, b) => b.pop - a.pop)[0];
  const curName = rng.pick(LANGUAGES[lang]?.currencies ?? ['corona']);
  const palette = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#008080', '#9a6324', '#800000', '#808000', '#000075'];
  const c: CountryState = structuredClone(parent);
  Object.assign(c, {
    id, name: base, longName: regime === 'military_junta' ? `Estado de ${base}` : `República de ${base}`, adjective: cdef?.adjective ?? adjectiveOf(base),
    color: palette[rng.int(0, palette.length - 1)], flag: randomFlag(rng), currency: { name: `${curName} ${cdef?.adjective ?? ''}`.trim(), code: currencyCode(base + curName, rng) },
    capital: capitalProv.id, culture, religion, archetype: parent.archetype, bloc: null,
    history: [`Proclamó su independencia de ${parent.name} el ${formatDate(sim.day)}.`, opts.reason], foundedYear: 1990 + Math.floor(sim.day / 360),
    createdDay: sim.day, alive: true, successorOf: parent.id, regime, bills: [], projects: [], decisions: [], claims: [], cooldowns: {}, series: {},
    strengths: ['Fervor nacional del nuevo Estado'], weaknesses: ['Instituciones por construir', 'Reconocimiento internacional incierto']
  });
  c.laws = { ...parent.laws, regime, minorities: 'tolerance', electoral: isDemocratic(regime) ? 'proportional' : 'none', parties: isDemocratic(regime) ? 'free' : 'restricted' };
  // demografía y economía: se transfieren desde el padre
  c.demography = { ...parent.demography, young: 0, adult: 0, old: 0 };
  for (const s of SECTORS) c.econ.sectors[s] = { ...parent.econ.sectors[s], labor: 0, output: 0 };
  c.econ.employed = 0;
  c.econ.laborForce = 0;
  moveEconomy(parent, c, provs, parentAll);
  let gdp = 0;
  for (const s of SECTORS) gdp += c.econ.sectors[s].output;
  // nueva moneda: nivel de precios 1, tipo de cambio coherente con la paridad real del padre
  c.econ.priceLevel = 1;
  c.econ.baseExchangeRate = 1;
  c.econ.exchangeRate = clamp(realExchangeRate(sim, parent), 0.3, 3) * sim.state.worldPriceLevel;
  c.econ.realGDP = gdp;
  c.econ.potentialGDP = gdp;
  c.econ.moneySupply = gdp * 0.5;
  c.econ.reserves = gdp * 0.03;
  c.econ.confidence = 40;
  const gdpShare = gdp / Math.max(1e-6, parent.econ.realGDP + gdp);
  // sucesión de la deuda proporcional al PIB
  const debtDomReal = parent.fiscal.debtDomestic * gdpShare * realPerLocal(parent);
  parent.fiscal.debtDomestic *= 1 - gdpShare;
  const debtFor = parent.fiscal.debtForeign * gdpShare;
  parent.fiscal.debtForeign -= debtFor;
  c.fiscal = { ...c.fiscal, treasury: gdp * 0.01, debtDomestic: debtDomReal, debtForeign: debtFor, arrears: 0, inDefault: false, defaultSinceDay: null, ledger: { revenue: 0, spending: 0, interest: 0, borrowed: 0, repaid: 0, printed: 0, extraordinary: 0, aid: 0 } };
  // política
  c.parties = [
    { id: `${id}-nat`, name: `Frente de Liberación de ${base}`, short: 'FL', family: 'nationalist', color: '#2e7d32', pos: { econ: 0, welfare: 0.3, authority: 0.3, social: -0.1, nation: 0.9, central: 0.5 }, popularity: 0.6, vote: 0, legal: true },
    { id: `${id}-lib`, name: `Partido Liberal de ${base}`, short: 'PL', family: 'liberal', color: PARTY_FAMILIES.find((p) => p.id === 'liberal')!.color, pos: { econ: 0.6, welfare: 0, authority: -0.5, social: 0.4, nation: 0.2, central: 0 }, popularity: 0, vote: 0, legal: true },
    { id: `${id}-soc`, name: `Partido Socialista de ${base}`, short: 'PS', family: 'socialist', color: PARTY_FAMILIES.find((p) => p.id === 'socialist')!.color, pos: { econ: -0.5, welfare: 0.8, authority: -0.2, social: 0.3, nation: 0.3, central: 0.3 }, popularity: 0, vote: 0, legal: true }
  ];
  c.seats = clamp(Math.round(Math.sqrt(population(c)) * 50), 40, 400);
  c.parliament = { [`${id}-nat`]: Math.round(c.seats * 0.55), [`${id}-lib`]: Math.round(c.seats * 0.25), [`${id}-soc`]: c.seats - Math.round(c.seats * 0.55) - Math.round(c.seats * 0.25) };
  c.politics = { ...parent.politics, approval: 62, legitimacy: 55, stability: 45, politicalCapital: 60, governmentParties: [`${id}-nat`], separatism: 0, protest: 0.1, decreesThisYear: 0,
    headOfGovernment: personName(rng, lang), headOfState: personName(rng, lang), lastElectionDay: sim.day, nextElectionDay: isDemocratic(regime) ? sim.day + 360 * 2 : null };
  for (const g of SOCIAL_GROUPS) c.groups[g] = { ...parent.groups[g], sat: g === 'minorities' ? 50 : 60, radical: 0.1 };
  c.military = { ...parent.military, manpower: c.demography.adult * 0.01, equipment: { arms: 3, vehicles: 0.5, aircraft: 0, ships: 0 }, warExhaustion: 0, personnel: 0 };
  c.tech = { ...parent.tech, known: [...parent.tech.known], progress: {}, queue: [], discoveredDay: {} };
  c.ai = { profile: 'nationalist', nextReview: sim.day + 5, memory: { [parent.id]: -50 }, targetArmy: 3, lastWarCheck: sim.day };
  c.directives = { ...parent.directives };
  st.countries[id] = c;
  sim.invalidateCaches();
  for (const p of provs) {
    p.owner = id;
    p.controller = id;
    p.occupiedSince = null;
    p.autonomy = 0;
    p.unrest = 0.2;
    for (const u of Object.values(st.units)) if (u.owner === parent.id && u.location === p.id && !opts.hostile) { u.location = parent.capital; u.path = []; u.order = null; }
  }
  parent.claims.push(...provs.map((p) => p.id));
  if (provs.some((p) => p.id === parent.capital)) parent.capital = Object.values(st.provinces).filter((p) => p.owner === parent.id).sort((a, b) => b.pop - a.pop)[0].id;
  // relaciones: neutrales con el mundo, sin reconocimiento automático
  for (const o of sim.aliveCountries()) {
    if (o.id === id) continue;
    const r = relation(st, id, o.id);
    const pr = relation(st, parent.id, o.id);
    r.opinion = o.id === parent.id ? (opts.hostile ? -80 : -20) : Math.round(-pr.opinion * 0.3);
    r.trust = 40;
    r.recognized = o.id === parent.id ? !opts.hostile : false;
    r.embassies = o.id === parent.id ? !opts.hostile : false;
    r.sanctions = [];
  }
  // milicias iniciales del nuevo Estado
  return c;
}

// el módulo militar no importa este archivo (evita ciclos): se registra aquí la transferencia por capitulación
setTransferHook((sim, provs, to) => transferProvinces(sim, provs, to, 'Capitulación'));
