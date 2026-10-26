import {
  SECTORS, SOCIAL_GROUPS, BUDGET_CATEGORIES, TAXES, type CountryState, type ProvinceState, type WorldState, type WorldMap, type SectorId,
  type GroupId, type DimVector, type Party, type Buildings, type RegimeId, type Treaty, type Organization, type CommodityId, type UnitType
} from '@cyo/shared';
import { Rng, clamp, seedState } from '../rng.js';
import { SECTOR_INFO, ARCHETYPE_SECTORS } from '../data/sectors.js';
import { LAWS, isDemocratic } from '../data/laws.js';
import { TECHS } from '../data/techs.js';
import { UNIT_INFO } from '../data/units.js';
import { GROUP_INFO, PARTY_FAMILIES, fullDims, dimDistance } from '../data/politics.js';
import { buildPolitical, pid } from '../worldgen/political.js';
import { personName } from '../worldgen/names.js';
import { Sim, relKey, relation } from '../engine/context.js';
import { computeProduction, commodityDemand, SECTOR_INDEX, nominalGDP, worldTrade } from '../engine/economy.js';
import { computeRevenue, totalRevenue, interestBill } from '../engine/fiscal.js';
import { groupSizes, groupTargets, voteShares, allocateSeats, formGovernment } from '../engine/politics.js';
import { createUnit } from '../engine/military.js';
import type { WorldDesign, CountryDesign } from './design.js';

export const STATE_FORMAT_VERSION = 1;

/**
 * Construye el mapa estático y el estado inicial (1 de enero de 1990) a partir de un diseño.
 * Todo es determinista: el mismo diseño produce exactamente el mismo mundo.
 */
export function buildWorld(design: WorldDesign, opts: { advancedAI?: boolean; warPrepDays?: number } = {}): { map: WorldMap; state: WorldState; errors: string[] } {
  const pol = buildPolitical(design);
  const { map, owner, capitals, claims } = pol;
  const rng = new Rng(design.seed + ':initial');
  const state: WorldState = {
    formatVersion: STATE_FORMAT_VERSION,
    seed: design.seed,
    day: 0,
    rng: seedState(design.seed + ':sim'),
    nextId: 1000,
    countries: {},
    provinces: {},
    relations: {},
    treaties: {},
    proposals: {},
    organizations: {},
    wars: {},
    battles: {},
    units: {},
    plans: {},
    markets: {
      food: { price: 1, basePrice: 1, supply: 0, demand: 0 },
      oil: { price: 1, basePrice: 1, supply: 0, demand: 0 },
      gas: { price: 1, basePrice: 1, supply: 0, demand: 0 },
      coal: { price: 1, basePrice: 1, supply: 0, demand: 0 },
      minerals: { price: 1, basePrice: 1, supply: 0, demand: 0 }
    },
    trade: [],
    worldInterestRate: 0.065,
    worldInflation: 0.05,
    worldPriceLevel: 1,
    recentEvents: [],
    humanCountries: [],
    onlineCountries: [],
    settings: { advancedAI: opts.advancedAI ?? true, warPrepDays: opts.warPrepDays ?? 3 },
    calib: { tradeScale: 0.05, foodPerCapita: 0.1, energyScale: { oil: 1, gas: 1, coal: 1 }, mineralScale: 1, worldGDP0: 0 },
    scenario: { mode: design.mode, name: design.name, seed: design.seed }
  };

  const designs = design.countries.filter((c) => capitals[c.key] !== undefined);
  // ---------------------------------------------------------------- provincias
  const byCountry = new Map<string, number[]>();
  owner.forEach((k, i) => { const l = byCountry.get(k) ?? []; l.push(i); byCountry.set(k, l); });
  for (const ps of map.provinces) {
    const k = owner[ps.idx];
    state.provinces[ps.id] = {
      id: ps.id, owner: k, controller: k, occupiedSince: null, pop: 0, urban: 0.3, capital: new Array(SECTORS.length).fill(0),
      infra: 0.3, buildings: { port: 0, airport: 0, power_plant: 0, industrial_zone: 0, military_base: 0, fortification: 0, refinery: 0, university: 0 },
      reserves: { oil: ps.resources.oil, gas: ps.resources.gas, coal: ps.resources.coal, minerals: ps.resources.minerals },
      unrest: 0.1, devastation: 0, supply: 1, culture: ps.culture, autonomy: 0
    };
  }

  // ---------------------------------------------------------------- países
  const sim = new Sim(state, map);
  for (const d of designs) {
    const provIdx = byCountry.get(d.key) ?? [];
    const c = buildCountry(sim, rng.fork(d.key), d, provIdx.map((i) => pid(i)), pid(capitals[d.key]), (claims[d.key] ?? []).map(pid));
    state.countries[c.id] = c;
  }

  // ---------------------------------------------------------------- calibración global de materias primas y comercio
  calibrateWorld(sim);

  // ---------------------------------------------------------------- relaciones, tratados y organizaciones
  const countries = Object.values(state.countries);
  for (let i = 0; i < countries.length; i++) {
    for (let j = i + 1; j < countries.length; j++) {
      const a = countries[i], b = countries[j];
      const r = relation(state, a.id, b.id);
      const da = designs.find((x) => x.key === a.id)!, db = designs.find((x) => x.key === b.id)!;
      let op = 0;
      if (da.bloc && da.bloc === db.bloc) op += 30;
      else if (da.bloc && db.bloc && da.bloc !== db.bloc) op -= 25;
      if (a.culture === b.culture) op += 10;
      if (a.religion === b.religion) op += 8;
      op -= 25 * dimDistance(fullDims(da.ideology), fullDims(db.ideology));
      r.opinion = clamp(Math.round(op), -100, 100);
      r.trust = clamp(Math.round(50 + op / 3), 0, 100);
    }
  }
  // fronteras
  for (const ps of map.provinces) {
    for (const l of ps.neighbors) {
      const a = owner[ps.idx], b = state.provinces[l.to].owner;
      if (a !== b) relation(state, a, b).border = true;
    }
  }
  for (const rel of design.relations) {
    if (!state.countries[rel.a] || !state.countries[rel.b]) continue;
    const r = relation(state, rel.a, rel.b);
    if (rel.rivalry !== undefined) r.rivalry = rel.rivalry;
    if (rel.opinion !== undefined) r.opinion = rel.opinion;
    r.trust = clamp(Math.round(50 + r.opinion / 3 - (rel.rivalry ?? 0) / 3), 0, 100);
  }
  let tid = 1;
  for (const t of design.treaties) {
    if (!state.countries[t.parties[0]] || !state.countries[t.parties[1]]) continue;
    const id = `T${tid++}`;
    const names = t.parties.map((k) => state.countries[k].name).join('-');
    const treaty: Treaty = {
      id, type: t.type, name: t.name ?? `${TREATY_NAMES[t.type] ?? t.type} ${names}`, parties: [...t.parties], terms: t.type === 'economic_aid' ? { monthly: 0.15, months: 120 } : {},
      signedDay: -rng.int(30, 3000), expiresDay: null, status: 'active', endedDay: null, brokenBy: null
    };
    state.treaties[id] = treaty;
    if (t.type === 'ceasefire') { const r = relation(state, t.parties[0], t.parties[1]); r.embassies = false; r.recognized = false; }
  }
  let oid = 1;
  for (const o of design.organizations) {
    const members = o.members.filter((m) => state.countries[m]);
    if (members.length < 2) continue;
    const org: Organization = { id: `O${oid++}`, name: o.name, kind: o.kind, founder: members[0], members, foundedDay: -rng.int(360, 12000), tariffCut: o.tariffCut, mutualDefense: o.mutualDefense, scienceShare: o.scienceShare, active: true };
    state.organizations[org.id] = org;
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
      const r = relation(state, members[i], members[j]);
      r.opinion = clamp(r.opinion + (o.mutualDefense ? 15 : 8), -100, 100);
      r.trust = clamp(r.trust + 8, 0, 100);
    }
  }
  // embajadas: rivales extremos no las tienen
  for (const r of Object.values(state.relations)) if (r.opinion < -70) r.embassies = false;
  calibrateTrade(sim);

  // ---------------------------------------------------------------- unidades iniciales
  for (const c of Object.values(state.countries)) createInitialForces(sim, c, designs.find((d) => d.key === c.id)!, rng.fork('mil' + c.id));
  // el presupuesto de defensa debe poder sostener a las fuerzas existentes
  for (const c of Object.values(state.countries)) {
    let up = 0;
    for (const u of Object.values(state.units)) if (u.owner === c.id) up += UNIT_INFO[u.type].upkeep;
    const needPct = up / Math.max(0.01, c.econ.realGDP) * 100 * 1.25;
    if (c.budget.defense < needPct) c.budget.defense = Math.min(25, Math.round(needPct * 10) / 10);
    calibrateBudget(sim, c, designs.find((d) => d.key === c.id)!);
  }
  sim.commit();
  // estadísticas iniciales para las series
  for (const c of Object.values(state.countries)) c.cooldowns.wage0 = c.econ.wage;
  return { map, state, errors: pol.errors };
}

export const TREATY_NAMES: Record<string, string> = {
  trade_agreement: 'Tratado comercial', non_aggression: 'Pacto de no agresión', defensive_alliance: 'Alianza defensiva', military_alliance: 'Alianza militar',
  energy_agreement: 'Acuerdo energético', science_cooperation: 'Cooperación científica', customs_union: 'Unión aduanera', migration_cooperation: 'Cooperación migratoria',
  economic_aid: 'Ayuda económica', loan: 'Préstamo', military_access: 'Acceso militar', peace: 'Tratado de paz', ceasefire: 'Alto el fuego',
  territorial_cession: 'Cesión territorial', unification: 'Unificación', recognition: 'Reconocimiento diplomático', debt_relief: 'Alivio de deuda',
  mediation: 'Mediación', join_organization: 'Adhesión'
};

// ---------------------------------------------------------------------------

function archetypeFor(d: CountryDesign, oilPerCap: number, mineralsPerCap: number): string {
  if (d.archetype !== 'auto') return d.archetype;
  if (oilPerCap > 400) return 'petrostate';
  if (d.stateShare > 0.65) return d.gdpPerCapita > 4000 ? 'socialist_industrial' : 'socialist_agrarian';
  if (mineralsPerCap > 500) return 'resource_exporter';
  if (d.gdpPerCapita > 15000) return d.population < 6 ? 'tech_trader' : 'industrial';
  if (d.gdpPerCapita > 7000) return 'emerging_industrial';
  if (d.population < 3) return 'tourism_islands';
  return d.gdpPerCapita < 2000 ? 'agrarian' : 'mixed_developing';
}

export function defaultLaws(d: Pick<CountryDesign, 'regime' | 'ideology' | 'stateShare' | 'institutions' | 'openness' | 'laws'>): Record<string, string> {
  const id = fullDims(d.ideology);
  const dem = isDemocratic(d.regime);
  const pick = (lawId: string, opts: string[], score: number) => {
    const i = clamp(Math.round((score + 1) / 2 * (opts.length - 1)), 0, opts.length - 1);
    return [lawId, opts[i]] as [string, string];
  };
  const laws: Record<string, string> = Object.fromEntries([
    ['regime', d.regime],
    pick('territorial', ['federal', 'decentralized', 'centralized'], id.central),
    pick('judiciary', ['subordinate', 'partial', 'independent'], dem ? d.institutions * 2 - 0.6 : -0.6 + d.institutions),
    pick('anticorruption', ['none', 'agency', 'strong'], d.institutions * 2 - 1.2),
    ['deathPenalty', id.social < -0.4 || id.authority > 0.6 ? 'applied' : id.social > 0.2 ? 'abolished' : 'exceptional'],
    ['electoral', dem ? (d.regime === 'presidential_republic' ? 'mixed' : id.authority < -0.5 ? 'proportional' : 'majoritarian') : 'none'],
    ['parties', dem ? 'free' : d.regime === 'one_party_state' ? 'single' : 'restricted'],
    ['term', d.regime === 'presidential_republic' ? 'six' : 'four'],
    ['centralBank', d.institutions > 0.7 && id.econ > -0.2 ? 'independent' : 'government'],
    ['currency', d.openness > 0.8 ? 'fixed' : id.econ > 0.3 ? 'floating' : 'managed'],
    ['fiscalRule', 'none'],
    pick('unions', ['banned', 'restricted', 'free'], dem ? 0.6 - id.econ * 0.4 : -0.6),
    pick('minimumWage', ['none', 'low', 'moderate', 'high'], id.welfare - id.econ * 0.5),
    pick('laborProtection', ['flexible', 'moderate', 'rigid'], -id.econ),
    ['retirement', id.welfare > 0.5 ? 'early' : 'standard'],
    pick('regulation', ['heavy', 'moderate', 'minimal'], id.econ),
    pick('foreignInvestment', ['closed', 'restricted', 'open'], id.econ - id.nation * 0.5 + d.openness - 0.5),
    ['prices', d.stateShare > 0.8 ? 'planned' : d.stateShare > 0.55 ? 'partial' : 'free'],
    ['competition', d.institutions > 0.65 ? 'antitrust' : 'tolerant'],
    pick('education', ['elite', 'basic', 'universal'], id.welfare + d.institutions - 0.6),
    pick('university', ['paid', 'subsidized', 'free'], id.welfare - id.econ * 0.3),
    pick('healthcare', ['private', 'insurance', 'universal'], id.welfare - id.econ * 0.3),
    pick('pensions', ['none', 'contributory', 'generous'], id.welfare),
    pick('police', ['limited', 'standard', 'extensive', 'police_state'], id.authority),
    pick('intelligence', ['oversight', 'autonomous', 'political'], id.authority),
    pick('environment', ['none', 'basic', 'strict'], id.social * 0.5 + d.institutions - 0.6),
    ['extraction', 'licensed'],
    pick('speech', ['censored', 'restricted', 'free'], -id.authority),
    pick('assembly', ['banned', 'permit', 'free'], -id.authority),
    pick('minorities', ['assimilation', 'tolerance', 'autonomy'], -id.nation - id.central * 0.5),
    pick('socialPolicy', ['traditional', 'neutral', 'progressive'], id.social),
    pick('conscription', ['volunteer', 'selective', 'universal', 'total'], id.authority * 0.6 + id.nation * 0.4),
    ['defensePolicy', id.nation > 0.6 ? 'projection' : 'collective'],
    pick('trade', ['autarky', 'protectionist', 'moderate', 'free'], d.openness * 2 - 1 + id.econ * 0.3),
    pick('capitalControls', ['strict', 'moderate', 'free'], d.openness * 2 - 1 + id.econ * 0.4),
    pick('immigration', ['closed', 'restricted', 'selective', 'open'], -id.nation),
    pick('emigration', ['banned', 'restricted', 'free'], 1 - Math.max(0, id.authority)),
    pick('religion', ['theocratic', 'official', 'secular'], 0.2 + id.social),
    pick('press', ['state', 'licensed', 'free'], -id.authority),
    pick('broadcasting', ['monopoly', 'mixed', 'private'], id.econ - Math.max(0, id.authority) * 0.5)
  ]);
  if (d.regime === 'theocracy') laws.religion = 'theocratic';
  if (!dem && laws.press === 'free') laws.press = 'licensed';
  Object.assign(laws, d.laws ?? {});
  for (const law of LAWS) if (!laws[law.id]) laws[law.id] = law.options[Math.floor(law.options.length / 2)].id;
  return laws;
}

function makeParties(rng: Rng, d: CountryDesign, minority: boolean): { parties: Party[]; ruling: string } {
  const id = fullDims(d.ideology);
  const dem = isDemocratic(d.regime);
  let families: string[];
  if (dem) {
    families = ['socialdemocrat', 'conservative', 'liberal'];
    if (id.econ < -0.1 || rng.chance(0.5)) families.push('socialist');
    if (rng.chance(0.55)) families.push('christian');
    if (rng.chance(0.4)) families.push('nationalist');
    if (d.gdpPerCapita < 5000 && rng.chance(0.6)) families.push('agrarian');
    if (d.gdpPerCapita < 8000 && rng.chance(0.4)) families.push('populist');
    if (rng.chance(0.3)) families.push('communist');
    if (minority) families.push('regionalist');
  } else {
    const rulingFamily = d.regime === 'one_party_state' ? (id.econ < -0.3 ? 'communist' : 'populist') : d.regime === 'military_junta' ? 'military' : d.regime === 'theocracy' ? 'clerical' : 'royalist';
    families = [rulingFamily, 'liberal', 'socialdemocrat', 'nationalist'];
    if (minority) families.push('regionalist');
  }
  families = [...new Set(families)];
  const adj = d.adjective;
  const parties: Party[] = families.map((f, i) => {
    const fam = PARTY_FAMILIES.find((p) => p.id === f)!;
    const jitter = (v: number) => clamp(v + rng.range(-0.15, 0.15), -1, 1);
    const pos: DimVector = { econ: jitter(fam.pos.econ), welfare: jitter(fam.pos.welfare), authority: jitter(fam.pos.authority), social: jitter(fam.pos.social), nation: jitter(fam.pos.nation), central: jitter(fam.pos.central) };
    const name = f === 'regionalist' ? fam.name : `${fam.name} ${adj}`;
    return { id: `${d.key}-${f}`, name, short: fam.short, family: f, color: fam.color, pos, popularity: rng.range(-0.2, 0.2), vote: 0, legal: dem || i === 0 };
  });
  // el partido gobernante es el más cercano a la ideología del gobierno
  let ruling = parties[0].id;
  if (dem) {
    let best = Infinity;
    for (const p of parties) { const dd = dimDistance(p.pos, id); if (dd < best) { best = dd; ruling = p.id; } }
    // ajustar su posición hacia la del gobierno
    const rp = parties.find((p) => p.id === ruling)!;
    for (const k of Object.keys(rp.pos) as (keyof DimVector)[]) rp.pos[k] = clamp(rp.pos[k] * 0.4 + id[k] * 0.6, -1, 1);
    rp.popularity += 0.4;
  } else {
    const rp = parties[0];
    for (const k of Object.keys(rp.pos) as (keyof DimVector)[]) rp.pos[k] = clamp(rp.pos[k] * 0.3 + id[k] * 0.7, -1, 1);
    if (d.regime === 'one_party_state') rp.name = `Partido ${id.econ < -0.3 ? 'Socialista Unificado' : 'de la Unidad Nacional'} de ${d.name}`;
    if (d.regime === 'military_junta') rp.name = `Consejo Militar de ${d.name}`;
    if (d.regime === 'absolute_monarchy') rp.name = `Corte Real de ${d.name}`;
    if (d.regime === 'theocracy') rp.name = `Consejo de la Fe de ${d.name}`;
  }
  return { parties, ruling };
}

export function buildCountry(sim: Sim, rng: Rng, d: CountryDesign, provinceIds: string[], capitalId: string, claims: string[]): CountryState {
  const st = sim.state;
  const provs = provinceIds.map((id) => st.provinces[id]);
  const statics = provinceIds.map((id) => sim.idx.provinces.get(id)!);
  const pop = Math.max(0.05, d.population);
  // ---- población por provincia
  let wsum = 0;
  const weights = statics.map((ps) => {
    const w = Math.max(0.02, ps.habitability) * Math.pow(ps.cells, 0.85) * (ps.id === capitalId ? 3.2 : 1) * (ps.coastal ? 1.15 : 1) * (ps.river === 2 ? 1.5 : ps.river ? 1.2 : 1);
    wsum += w;
    return w;
  });
  const gdppc = d.gdpPerCapita;
  const urban = clamp(0.22 + 0.16 * Math.log(Math.max(1, gdppc / 900)), 0.12, 0.95);
  const ranks = weights.map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w);
  provs.forEach((p, i) => { p.pop = pop * weights[i] / wsum; });
  ranks.forEach(({ i }, r) => { provs[i].urban = clamp(urban * (provs[i].id === capitalId ? 1.4 : 1.15 - 0.6 * r / Math.max(1, ranks.length)), 0.05, 0.98); });

  // ---- recursos y arquetipo
  const res = { oil: 0, gas: 0, coal: 0, minerals: 0, fertile: 0, hydro: 0, fish: 0, timber: 0 };
  for (const ps of statics) for (const k of Object.keys(res) as (keyof typeof res)[]) res[k] += ps.resources[k];
  const archetype = archetypeFor(d, res.oil / pop, (res.minerals + res.coal) / pop);
  const gdp = pop * gdppc / 1000; // miles de millones de UMI de 1990
  const tech = d.techLevel;
  // participación sectorial: arquetipo + dotación real de recursos
  const shares = { ...Object.fromEntries(SECTORS.map((s) => [s, 0])), ...ARCHETYPE_SECTORS[archetype] } as Record<SectorId, number>;
  const extractEff = 0.45 + 0.55 * tech;
  const oilCap = res.oil / 30 * extractEff, gasCap = res.gas / 35 * extractEff, minCap = (res.minerals + res.coal) / 45 * extractEff;
  const resourceArchetype = archetype === 'petrostate' || archetype === 'resource_exporter' || archetype === 'military_industrial';
  shares.oil = Math.min(Math.max(shares.oil, 0) || oilCap / gdp, oilCap / gdp, resourceArchetype ? 0.65 : 0.12);
  shares.gas = Math.min(Math.max(shares.gas, 0) || gasCap / gdp, gasCap / gdp, resourceArchetype ? 0.3 : 0.08);
  shares.mining = Math.min(Math.max(shares.mining, minCap / gdp * 0.6), minCap / gdp, 0.3);
  const fertileRatio = clamp(res.fertile / Math.max(0.1, pop) / 3, 0.35, 1.8);
  shares.agriculture *= fertileRatio;
  shares.livestock *= fertileRatio;
  shares.tourism *= statics.some((s) => s.coastal) ? 1 : 0.4;
  const resourceShare = shares.oil + shares.gas + shares.mining;
  let other = 0;
  for (const s of SECTORS) if (s !== 'oil' && s !== 'gas' && s !== 'mining') other += shares[s];
  for (const s of SECTORS) if (s !== 'oil' && s !== 'gas' && s !== 'mining') shares[s] = shares[s] / Math.max(1e-9, other) * (1 - resourceShare);

  // ---- demografía
  const lg = Math.log(Math.max(1, gdppc / 1000));
  const youngShare = clamp(0.42 - 0.075 * lg, 0.15, 0.47);
  const oldShare = clamp(0.035 + 0.035 * lg, 0.03, 0.17);
  const religiosity = d.religiosity ?? 0.5;
  const demography = {
    young: pop * youngShare, adult: pop * (1 - youngShare - oldShare), old: pop * oldShare, urban,
    education: [clamp(0.45 - 0.42 * tech, 0.02, 0.6), 0, clamp(0.15 + 0.5 * tech, 0.1, 0.7), clamp(0.02 + 0.18 * tech, 0.02, 0.25)] as [number, number, number, number],
    fertility: clamp(1.45 + 3.6 * Math.exp(-gdppc / 2800) + 0.9 * (religiosity - 0.5), 1.2, 6.8),
    lifeExpectancy: clamp(48 + 6.5 * Math.log(Math.max(1, gdppc / 500)) + 4 * d.institutions, 45, 79), births: 0, deaths: 0, netMigration: 0, religiosity
  };
  demography.education[1] = Math.max(0, 1 - demography.education[0] - demography.education[2] - demography.education[3]);

  // ---- leyes y parámetros
  const laws = defaultLaws(d);
  const minority = statics.some((s) => s.culture !== d.culture);
  const { parties, ruling } = makeParties(rng, d, minority);
  const lang = sim.map.cultures.find((c) => c.id === d.culture)?.language ?? 'aurel';
  const ideal = fullDims(d.ideology);
  const health = clamp((demography.lifeExpectancy - 42) / 40, 0.1, 0.95);
  const c: CountryState = {
    id: d.key, name: d.name, longName: d.longName, adjective: d.adjective, color: d.color, flag: d.flag,
    currency: { name: d.currency.name, code: d.currency.code }, capital: capitalId, culture: d.culture, religion: d.religion, archetype,
    bloc: d.bloc, history: d.history, foundedYear: d.foundedYear, createdDay: 0, alive: true, successorOf: null,
    regime: d.regime, laws, bills: [], parties, parliament: {}, seats: isDemocratic(d.regime) ? clamp(Math.round(Math.sqrt(pop) * 60), 60, 650) : clamp(Math.round(Math.sqrt(pop) * 40), 40, 500),
    politics: {
      approval: 50, legitimacy: 50, adminCapacity: clamp(d.institutions * 85 + tech * 10, 8, 95), stability: 55, politicalCapital: 50,
      corruption: clamp((1 - d.institutions) * 75, 3, 90), ruleOfLaw: clamp(d.institutions * 92, 3, 97), coupRisk: 0, protest: 0.05, strikes: 0.05,
      crime: 20, separatism: 0, lastElectionDay: -rng.int(30, 1200), nextElectionDay: null, governmentParties: [ruling],
      headOfGovernment: personName(rng, lang), headOfState: personName(rng, lang), decreesThisYear: 0
    },
    groups: Object.fromEntries(SOCIAL_GROUPS.map((g) => [g, { size: 0, sat: 50, radical: 0.05, weight: 0, ideal: shiftIdeal(GROUP_INFO[g].ideal, ideal, rng) }])) as Record<GroupId, CountryState['groups'][GroupId]>,
    demography,
    econ: {
      sectors: Object.fromEntries(SECTORS.map((s) => [s, { labor: 0, tfp: 1, stateShare: 0, output: shares[s] * gdp, subsidy: 0, priceCap: 0, wageIndex: 1, markup: 0 }])) as CountryState['econ']['sectors'],
      realGDP: gdp, potentialGDP: gdp, nominalGDP: 0, outputGap: 0, growth: 0.02, priceLevel: 1, inflation: d.inflation, expectedInflation: d.inflation,
      moneySupply: 0, moneyGrowth: d.inflation + 0.02, policyRate: clamp(0.03 + d.inflation, 0.02, 2), baseExchangeRate: d.currency.rate, exchangeRate: d.currency.rate,
      reserves: gdp * (0.04 + 0.12 * d.openness), laborForce: 0, employed: 0, unemployment: 0, naturalUnemployment: 0, participation: 0, informality: clamp(0.5 - 0.45 * d.institutions + (gdppc < 3000 ? 0.15 : 0), 0.04, 0.7),
      wage: 0, consumption: gdp * 0.6, investment: gdp * 0.2, government: gdp * 0.2, exports: gdp * d.openness * 0.3, imports: gdp * d.openness * 0.3, currentAccount: 0, fdi: gdp * 0.01,
      poverty: 0.2, gini: d.gini, confidence: 55, riskPremium: 0.02, energyShortage: 0, foodShortage: 0,
      commodities: Object.fromEntries((['food', 'oil', 'gas', 'coal', 'minerals'] as CommodityId[]).map((k) => [k, { production: 0, consumption: 0, imports: 0, exports: 0, shortage: 0 }])) as CountryState['econ']['commodities'],
      importPropensity: 0.2, lastRealGDP: [], bankStress: 0
    },
    fiscal: {
      treasury: 0, debtDomestic: 0, debtForeign: 0, debtRate: 0.06, revenue: {} as CountryState['fiscal']['revenue'], spending: {} as CountryState['fiscal']['spending'],
      interest: 0, balance: 0, monetization: laws.centralBank === 'independent' ? 0 : clamp(d.inflation * 0.6, 0, 0.6), inDefault: false, defaultSinceDay: null, defaultsHistory: d.inflation > 0.5 ? 1 : 0,
      arrears: 0, rating: 'BBB', ledger: { revenue: 0, spending: 0, interest: 0, borrowed: 0, repaid: 0, printed: 0, extraordinary: 0, aid: 0 }
    },
    budget: Object.fromEntries(BUDGET_CATEGORIES.map((k) => [k, 0])) as CountryState['budget'],
    taxes: Object.fromEntries(TAXES.map((k) => [k, 0])) as CountryState['taxes'],
    stocks: {
      humanCapital: clamp(0.15 + 0.7 * tech, 0.1, 0.95), health, infrastructure: clamp(0.15 + 0.7 * tech * 0.9 + 0.1 * d.institutions, 0.1, 0.95),
      science: tech, security: clamp(0.3 + 0.4 * d.institutions, 0.2, 0.9), justice: clamp(d.institutions, 0.1, 0.95), administration: clamp(d.institutions, 0.1, 0.95), intelligence: clamp(0.2 + 0.3 * tech, 0.1, 0.8)
    },
    tech: { known: initialTechs(tech, rng), progress: {}, queue: [], points: 0, discoveredDay: {} },
    military: { manpower: 0, equipment: { arms: 0, vehicles: 0, aircraft: 0, ships: 0 }, production: { arms: 4, vehicles: 3, aircraft: 2, ships: 1 }, commandQuality: 0.5, warExhaustion: 0, doctrine: 'balanced', personnel: 0 },
    projects: [], decisions: [],
    directives: { balanceBudget: false, continueResearch: true, maintainGarrison: true, autoDecisions: true, acceptFriendlyTrade: false },
    ai: { profile: d.aiProfile, nextReview: rng.int(0, 29), memory: {}, targetArmy: 0, lastWarCheck: 0 },
    strengths: d.strengths, weaknesses: d.weaknesses, claims, cooldowns: {}, series: {}
  };
  // ---- infraestructura y edificios por provincia
  provs.forEach((p, i) => {
    const ps = statics[i];
    const isCap = p.id === capitalId;
    p.infra = clamp(c.stocks.infrastructure * (isCap ? 1.3 : 0.75 + 0.5 * p.urban), 0.05, 1);
    const b: Buildings = p.buildings;
    if (ps.coastal && ps.harbor) b.port = isCap || p.urban > 0.5 || rng.chance(0.3 + tech * 0.4) ? (tech > 0.6 && (isCap || rng.chance(0.4)) ? 2 : 1) : 0;
    if (isCap || (p.urban > 0.55 && rng.chance(0.3 + tech * 0.5))) b.airport = isCap && tech > 0.5 ? 2 : 1;
    if (isCap || (ps.resources.hydro > 1 && rng.chance(0.6)) || rng.chance(0.12 * tech)) b.power_plant = 1;
    if (isCap && tech > 0.4) b.industrial_zone = 1;
    if (isCap) b.military_base = 1;
    if ((ps.resources.oil > 50) && rng.chance(0.5)) b.refinery = 1;
    if (isCap && tech > 0.35) b.university = 1;
    p.autonomy = ps.culture !== d.culture && laws.minorities === 'autonomy' ? 0.5 : 0;
  });
  if (statics.every((s) => !s.harbor) && statics.some((s) => s.coastal)) {
    const coastal = provs.find((p, i) => statics[i].coastal);
    if (coastal) coastal.buildings.port = 1;
  }

  // ---- empleo y capital
  const sim2 = sim;
  const lp = { conscription: 0 };
  void lp;
  const participation = clamp(0.62 + 0.08 * Math.tanh((gdppc / 1000 - 5) / 10) - 0.12 * (religiosity - 0.5), 0.45, 0.8);
  c.econ.participation = participation;
  c.econ.laborForce = demography.adult * participation;
  const u0 = clamp(0.05 + (1 - d.institutions) * 0.05 + (d.inflation > 0.3 ? 0.03 : 0) + (d.stateShare > 0.8 ? -0.03 : 0), 0.02, 0.18);
  c.econ.unemployment = u0;
  c.econ.naturalUnemployment = u0;
  c.econ.employed = c.econ.laborForce * (1 - u0);
  const prodExp = 0.5 + 0.5 * tech;
  let lw = 0;
  const lweights = SECTORS.map((s) => { const w = shares[s] / Math.pow(SECTOR_INFO[s].laborProductivity, prodExp) * (s === 'agriculture' || s === 'livestock' ? 1 + (1 - tech) * 1.5 : 1); lw += w; return w; });
  SECTORS.forEach((s, i) => { c.econ.sectors[s].labor = Math.max(1e-5, c.econ.employed * lweights[i] / lw); });
  const kIntensity = 0.65 + 0.6 * tech;
  for (const s of SECTORS) {
    const sec = c.econ.sectors[s];
    const K = sec.output * SECTOR_INFO[s].capitalOutput * kIntensity;
    sec.stateShare = clamp(d.stateShare * (SECTOR_INFO[s].naturalMonopoly || s === 'defense' || SECTOR_INFO[s].extractive ? 1.5 : s === 'agriculture' || s === 'services' ? 0.6 : 1), 0, 0.98);
    distributeInitialCapital(sim2, c, provs, statics, s, Math.max(1e-6, K), capitalId);
  }
  // ---- calibración de PTF: la producción inicial coincide con el PIB diseñado
  c.politics.adminCapacity = clamp(d.institutions * 85 + tech * 10, 8, 95);
  for (const s of SECTORS) c.econ.sectors[s].tfp = 1;
  const prod = computeProduction(sim, c, provs);
  for (const s of SECTORS) {
    const sec = c.econ.sectors[s];
    const target = shares[s] * gdp;
    const base = prod.potential[s];
    if (target <= 1e-6) { sec.tfp = 1; sec.output = 0; continue; }
    if (SECTOR_INFO[s].extractive && base < target * 0.999) {
      // reservas insuficientes para la producción asumida: se recorta el sector al máximo extraíble
      sec.tfp = 1;
      sec.output = base;
      continue;
    }
    sec.tfp = target / Math.max(1e-9, base);
    sec.output = target;
  }
  // reajuste: lo que no pudo producir la extracción se reasigna a servicios
  let total = 0;
  for (const s of SECTORS) total += c.econ.sectors[s].output;
  if (total < gdp * 0.999) {
    const missing = gdp - total;
    c.econ.sectors.services.output += missing;
    c.econ.sectors.services.tfp *= (c.econ.sectors.services.output) / Math.max(1e-9, c.econ.sectors.services.output - missing);
  }
  c.econ.realGDP = gdp;
  c.econ.potentialGDP = gdp;
  // prima salarial por sector: el producto marginal del trabajo inicial define la asignación de equilibrio
  let mplTot = 0;
  const mpl = SECTORS.map((s) => { const v = (1 - SECTOR_INFO[s].alpha) * c.econ.sectors[s].output / Math.max(1e-6, c.econ.sectors[s].labor); mplTot += v * c.econ.sectors[s].labor; return v; });
  const avgMpl = mplTot / Math.max(1e-6, c.econ.employed);
  SECTORS.forEach((s, i) => { c.econ.sectors[s].wageIndex = Math.max(0.05, mpl[i] / Math.max(1e-6, avgMpl)); });
  let labour = 0;
  for (const s of SECTORS) labour += (1 - SECTOR_INFO[s].alpha) * c.econ.sectors[s].output;
  c.econ.wage = labour / Math.max(1e-6, c.econ.employed);
  c.econ.moneySupply = gdp * d.currency.rate * (0.45 + 0.4 * tech);
  c.econ.nominalGDP = nominalGDP(c);

  // ---- impuestos iniciales
  const welfare = ideal.welfare;
  const dev = tech;
  c.taxes = {
    vat: clamp(0.08 + 0.08 * dev + 0.03 * welfare, 0.03, 0.22),
    income: clamp(0.08 + 0.18 * dev + 0.08 * welfare - 0.05 * ideal.econ, 0.02, 0.45),
    corporate: clamp(0.22 + 0.08 * welfare - 0.06 * ideal.econ, 0.1, 0.45),
    wealth: clamp(0.003 * (welfare + 0.3), 0, 0.012),
    import: clamp(0.3 - 0.27 * d.openness, 0.02, 0.4),
    export: archetype === 'petrostate' || archetype === 'resource_exporter' ? 0.05 : 0,
    excise: clamp(0.02 + 0.03 * dev, 0.01, 0.06),
    payroll: clamp(0.04 + 0.12 * dev + 0.06 * welfare, 0.02, 0.25),
    provincial: laws.territorial === 'federal' || laws.territorial === 'confederal' ? 0.012 : 0.005
  };
  if (archetype === 'petrostate') { c.taxes.income = 0.02; c.taxes.vat = Math.min(c.taxes.vat, 0.05); c.taxes.payroll = 0.03; }
  if (laws.prices === 'planned') { c.taxes.income = 0.06; c.taxes.corporate = 0.1; c.taxes.vat = 0.1; }

  // ---- presupuesto inicial (se recalibra tras crear las fuerzas armadas)
  const totalSpend = clamp(0.14 + 0.18 * dev + 0.1 * welfare + (laws.prices === 'planned' ? 0.12 : 0), 0.1, 0.55) * 100;
  const mil = clamp(1.6 * d.military * (d.bloc ? 1.3 : 1), 0.3, 18);
  c.budget = {
    education: totalSpend * 0.14, health: totalSpend * (0.1 + 0.06 * welfare), defense: mil, security: totalSpend * 0.06, justice: totalSpend * 0.025,
    infrastructure: totalSpend * 0.08, administration: totalSpend * 0.07, science: clamp(0.2 + 2.6 * Math.pow(tech, 2), 0.1, 3.2),
    intelligence: clamp(0.15 + 0.4 * ideal.authority + 0.2 * (d.bloc ? 1 : 0), 0.05, 1.2), subsidies: totalSpend * (0.05 + 0.08 * d.stateShare), transfers: totalSpend * (0.12 + 0.15 * Math.max(0, welfare))
  };
  for (const k of BUDGET_CATEGORIES) c.budget[k] = Math.round(c.budget[k] * 10) / 10;

  // ---- deuda
  const ngdp = c.econ.nominalGDP;
  const debt = d.debt * ngdp;
  const foreignShare = clamp(0.65 - 0.45 * tech + (d.inflation > 0.3 ? 0.15 : 0), 0.1, 0.8);
  c.fiscal.debtDomestic = debt * (1 - foreignShare);
  c.fiscal.debtForeign = debt * foreignShare / d.currency.rate;
  c.fiscal.debtRate = clamp(0.055 + 0.6 * d.inflation * (1 - foreignShare) + (1 - d.institutions) * 0.04, 0.03, 1.2);
  c.fiscal.treasury = ngdp * 0.015;

  // ---- grupos y política inicial
  for (const g of SOCIAL_GROUPS) {
    const gs = c.groups[g];
    gs.size = 0;
  }
  return c;
}

function shiftIdeal(base: DimVector, nat: DimVector, rng: Rng): DimVector {
  const out = { ...base };
  for (const k of Object.keys(out) as (keyof DimVector)[]) out[k] = clamp(base[k] * 0.75 + nat[k] * 0.25 + rng.range(-0.08, 0.08), -1, 1);
  return out;
}

function initialTechs(level: number, rng: Rng): string[] {
  const known: string[] = [];
  for (const t of TECHS) {
    if (t.tier < 0) continue;
    if (t.tier === 0) { known.push(t.id); continue; }
    const need = t.tier === 1 ? 0.3 : t.tier === 2 ? 0.55 : 0.85;
    if (level >= need + 0.05 || (level >= need - 0.08 && rng.chance(0.5))) known.push(t.id);
  }
  // coherencia: los requisitos de cada tecnología conocida también son conocidos
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...known]) {
      const t = TECHS.find((x) => x.id === id)!;
      for (const p of t.prereqs) if (!known.includes(p)) { known.push(p); changed = true; }
    }
  }
  return known;
}

function distributeInitialCapital(sim: Sim, c: CountryState, provs: ProvinceState[], statics: ReturnType<Sim['idx']['provinces']['get']>[], s: SectorId, K: number, capitalId: string): void {
  const i = SECTOR_INDEX[s];
  let w = 0;
  const ws = provs.map((p, k) => {
    const ps = statics[k]!;
    const r = ps.resources;
    let v: number;
    switch (s) {
      case 'agriculture': v = r.fertile * (0.5 + p.pop); break;
      case 'livestock': v = r.fertile * 0.5 + (ps.terrain === 10 || ps.terrain === 4 || ps.terrain === 14 ? ps.cells : 1) * 0.2; break;
      case 'mining': v = r.minerals + r.coal; break;
      case 'oil': v = r.oil; break;
      case 'gas': v = r.gas; break;
      case 'energy': v = p.pop + r.hydro * 0.5; break;
      case 'tourism': v = p.pop * (ps.coastal ? 2 : 0.5) + (ps.terrain === 8 ? 1 : 0); break;
      case 'finance': case 'tech': v = p.pop * p.urban * p.urban * (p.id === capitalId ? 4 : 1); break;
      case 'industry': case 'defense': v = p.pop * p.urban * (1 + (r.coal + r.minerals) / 200) * (p.id === capitalId ? 1.8 : 1); break;
      default: v = p.pop * (0.5 + p.urban);
    }
    v = Math.max(0, v);
    w += v;
    return v;
  });
  if (w <= 0) { const cap = provs.find((p) => p.id === capitalId) ?? provs[0]; if (cap) cap.capital[i] += K; return; }
  provs.forEach((p, k) => { p.capital[i] += K * ws[k] / w; });
  void c; void sim;
}

/** Calibración global: el comercio y las materias primas parten de un mundo coherente. */
function calibrateWorld(sim: Sim): void {
  const st = sim.state;
  const countries = Object.values(st.countries);
  let worldGDP = 0;
  for (const c of countries) worldGDP += c.econ.realGDP;
  st.calib.worldGDP0 = worldGDP;
  // demanda de materias primas = oferta mundial al inicio
  const supply: Record<CommodityId, number> = { food: 0, oil: 0, gas: 0, coal: 0, minerals: 0 };
  const demand: Record<CommodityId, number> = { food: 0, oil: 0, gas: 0, coal: 0, minerals: 0 };
  for (const c of countries) {
    const owned = Object.values(st.provinces).filter((p) => p.owner === c.id);
    const prod = computeProduction(sim, c, owned);
    const dem = commodityDemand(sim, c, prod.potential);
    for (const k of Object.keys(supply) as CommodityId[]) { supply[k] += prod.commodities[k]; demand[k] += dem[k]; }
  }
  // autosuficiencia alimentaria mínima del 75 % al inicio (los países pobres comen según lo que producen)
  for (const c of countries) {
    const owned = Object.values(st.provinces).filter((p) => p.owner === c.id);
    const prod = computeProduction(sim, c, owned);
    const dem = commodityDemand(sim, c, prod.potential);
    if (prod.commodities.food < dem.food * 0.75) c.cooldowns.foodBias = prod.commodities.food / (dem.food * 0.75);
  }
  demand.food = 0;
  for (const c of countries) {
    const owned = Object.values(st.provinces).filter((p) => p.owner === c.id);
    demand.food += commodityDemand(sim, c, computeProduction(sim, c, owned).potential).food;
  }
  st.calib.foodPerCapita *= supply.food / Math.max(1e-6, demand.food) * 0.99;
  st.calib.energyScale.oil *= supply.oil / Math.max(1e-6, demand.oil);
  st.calib.energyScale.gas *= supply.gas / Math.max(1e-6, demand.gas);
  st.calib.energyScale.coal *= supply.coal / Math.max(1e-6, demand.coal);
  st.calib.mineralScale *= supply.minerals / Math.max(1e-6, demand.minerals);
  for (const k of Object.keys(supply) as CommodityId[]) { st.markets[k].supply = supply[k]; st.markets[k].demand = supply[k]; }
  // escala de comercio: el comercio de bienes ronda el 15 % del PIB mundial
  st.calib.tradeScale = 1;
  let trade = 0;
  for (const a of countries) {
    let tradA = 0;
    for (const s of SECTORS) tradA += a.econ.sectors[s].output * SECTOR_INFO[s].tradable;
    for (const b of countries) {
      if (a === b) continue;
      const pa = sim.idx.provinces.get(a.capital)!, pb = sim.idx.provinces.get(b.capital)!;
      const dist = Math.max(4, Math.hypot(pa.cx - pb.cx, pa.cy - pb.cy));
      trade += Math.pow(tradA, 0.75) * Math.pow(b.econ.realGDP, 0.55) / Math.pow(dist, 0.65) * 0.5;
    }
  }
  st.calib.tradeScale = 0.15 * worldGDP / Math.max(1e-6, trade);
  void relKey;
}

/** Sesgo exportador por país para que el comercio de 1990 parta casi equilibrado (X ≈ M). */
function calibrateTrade(sim: Sim): void {
  const st = sim.state;
  const countries = Object.values(st.countries);
  const prices = Object.fromEntries(Object.entries(st.markets).map(([k, m]) => [k, m.price]));
  for (let iter = 0; iter < 6; iter++) {
    const prod = new Map<string, { output: Record<SectorId, number>; commodities: Record<CommodityId, number>; demand: Record<CommodityId, number> }>();
    for (const c of countries) {
      const owned = Object.values(st.provinces).filter((p) => p.owner === c.id);
      const pr = computeProduction(sim, c, owned);
      prod.set(c.id, { output: pr.potential, commodities: pr.commodities, demand: commodityDemand(sim, c, pr.potential) });
    }
    worldTrade(sim, prod, 0);
    for (const [k, p] of Object.entries(prices)) st.markets[k as CommodityId].price = p;
    for (const c of countries) {
      const ratio = clamp(c.econ.imports / Math.max(0.01, c.econ.exports), 0.2, 5);
      c.cooldowns.exportBias = clamp((c.cooldowns.exportBias ?? 1) * Math.pow(ratio, 0.6), 0.05, 20);
    }
  }
  for (const c of countries) { c.econ.energyShortage = 0; c.econ.foodShortage = 0; }
}

/** Ajusta el presupuesto para que el déficit inicial sea verosímil para cada país. */
function calibrateBudget(sim: Sim, c: CountryState, d: CountryDesign): void {
  const ngdp = nominalGDP(c);
  // grupos y política: tamaños y satisfacción de partida
  const owned = Object.values(sim.state.provinces).filter((p) => p.owner === c.id);
  const sizes = groupSizes(sim, c, owned);
  for (const g of SOCIAL_GROUPS) c.groups[g].size = sizes[g];
  c.econ.consumption = c.econ.realGDP * 0.62;
  const rev = totalRevenue(computeRevenue(sim, c));
  const interest = interestBill(sim, c);
  const targetDeficit = (c.archetype === 'petrostate' && c.econ.sectors.oil.output > 0.2 * c.econ.realGDP ? -0.01 : 0.025 + 0.02 * (d.debt > 0.6 ? 1 : 0) + (d.inflation > 0.3 ? 0.03 : 0)) * ngdp;
  const fixed = c.budget.defense / 100 * ngdp + interest;
  const flexTarget = Math.max(0.04 * ngdp, rev + targetDeficit - fixed);
  let flex = 0;
  for (const k of BUDGET_CATEGORIES) if (k !== 'defense') flex += c.budget[k] / 100 * ngdp;
  const f = flexTarget / Math.max(1e-6, flex);
  for (const k of BUDGET_CATEGORIES) if (k !== 'defense') c.budget[k] = Math.round(clamp(c.budget[k] * f, 0, 40) * 10) / 10;
  c.fiscal.revenue = computeRevenue(sim, c);
  // aprobación inicial y parlamento
  const targets = groupTargets(sim, c);
  for (const g of SOCIAL_GROUPS) c.groups[g].sat = targets[g];
  let w = 0, a = 0;
  const demo = sim.params(c).democracy;
  for (const g of SOCIAL_GROUPS) { const gw = c.groups[g].size * (demo + (1 - demo) * GROUP_INFO[g].elite); w += gw; a += gw * c.groups[g].sat; }
  c.politics.approval = w > 0 ? a / w : 50;
  c.politics.legitimacy = clamp(({ parliamentary_democracy: 72, presidential_republic: 62, constitutional_monarchy: 74, absolute_monarchy: 55, one_party_state: 45, military_junta: 35, theocracy: 52 } as Record<RegimeId, number>)[c.regime] + 15 * (c.politics.ruleOfLaw - 50) / 50, 10, 95);
  c.politics.stability = clamp(10 + 0.35 * c.politics.approval + 0.35 * c.politics.legitimacy + 15 * c.stocks.security, 5, 95);
  if (isDemocratic(c.regime)) {
    const votes = voteShares(sim, c);
    // el oficialismo ganó las últimas elecciones
    const ruling = c.politics.governmentParties[0];
    votes[ruling] = Math.max(votes[ruling] ?? 0, 0.36);
    const sum = Object.values(votes).reduce((x, y) => x + y, 0);
    for (const k of Object.keys(votes)) votes[k] /= sum;
    c.parliament = allocateSeats(c.laws.electoral, votes, c.seats);
    for (const p of c.parties) p.vote = votes[p.id] ?? 0;
    const gov = formGovernment(c);
    c.politics.governmentParties = gov.includes(ruling) ? gov : [ruling, ...gov.filter((x) => x !== ruling)];
    const term = c.laws.term === 'six' ? 6 : c.laws.term === 'five' ? 5 : 4;
    c.politics.nextElectionDay = c.politics.lastElectionDay + term * 360;
    if (c.politics.nextElectionDay < 60) c.politics.nextElectionDay += term * 360;
  } else {
    c.parliament = Object.fromEntries(c.parties.map((p) => [p.id, p.id === c.politics.governmentParties[0] ? c.seats : 0]));
  }
}

function createInitialForces(sim: Sim, c: CountryState, d: CountryDesign, rng: Rng): void {
  const pop = c.demography.young + c.demography.adult + c.demography.old;
  const gdp = c.econ.realGDP;
  const owned = Object.values(sim.state.provinces).filter((p) => p.owner === c.id);
  // personal activo (miles): proporcional a población y PIB, modulado por el diseño
  const personnel = clamp((pop * 2.2 + gdp * 0.12) * d.military, 3, 5000);
  const tech = d.techLevel;
  const landShare = 0.78, inf = clamp(0.62 - 0.35 * tech, 0.25, 0.7), mech = 0.22 + 0.2 * tech, armor = c.tech.known.includes('modern_armor') ? 0.12 + 0.1 * tech : 0;
  const landPersonnel = personnel * landShare;
  const nInf = Math.max(1, Math.round(landPersonnel * inf / UNIT_INFO.infantry.manpower));
  const nMech = Math.round(landPersonnel * mech / UNIT_INFO.mechanized.manpower);
  const nArm = Math.round(landPersonnel * armor / UNIT_INFO.armored.manpower);
  const nArt = Math.round(landPersonnel * 0.08 / UNIT_INFO.artillery.manpower);
  const nSf = c.tech.known.includes('night_vision') && personnel > 40 ? Math.max(1, Math.round(personnel / 400)) : 0;
  const coastalPort = owned.filter((p) => p.buildings.port > 0);
  const airports = owned.filter((p) => p.buildings.airport > 0);
  const nFighter = airports.length && c.tech.known.includes('jet_fighters_4g') ? Math.round(gdp / 120 * d.military + (personnel > 200 ? 2 : 0)) : 0;
  const nStrike = airports.length ? Math.round(gdp / 200 * d.military) : 0;
  const nSurface = coastalPort.length ? Math.round(gdp / 180 * d.military * (c.culture === 'castreno' || c.culture === 'velmari' ? 1.6 : 1)) : 0;
  const nSub = coastalPort.length && gdp > 150 ? Math.round(gdp / 400 * d.military) : 0;
  const nAmph = coastalPort.length && gdp > 250 ? Math.max(0, Math.round(gdp / 900 * d.military)) : 0;
  const nCarrier = coastalPort.length && c.tech.known.includes('carrier_aviation') && gdp > 1500 ? 1 + (gdp > 2400 && d.military > 0.8 ? 1 : 0) : 0;
  // emplazamiento: capital y provincias fronterizas con rivales/vecinos
  const border = owned.filter((p) => sim.idx.provinces.get(p.id)!.neighbors.some((l) => sim.state.provinces[l.to]?.owner !== c.id && !(l.kind === 'strait')));
  const rivalBorder = border.filter((p) => sim.idx.provinces.get(p.id)!.neighbors.some((l) => {
    const o = sim.state.provinces[l.to]?.owner;
    return o && o !== c.id && (sim.state.relations[relKey(c.id, o)]?.opinion ?? 0) < -10;
  }));
  const spots = [c.capital, ...(rivalBorder.length ? rivalBorder : border).map((p) => p.id)];
  const place = (i: number) => spots[i % spots.length] ?? c.capital;
  let k = 0;
  const addLand = (type: UnitType, n: number) => { for (let i = 0; i < Math.min(n, 120); i++) createUnit(sim, c, type, place(k++), true); };
  addLand('infantry', nInf);
  addLand('mechanized', nMech);
  addLand('armored', nArm);
  addLand('artillery', nArt);
  addLand('special_forces', nSf);
  const airBase = (i: number) => (airports[i % Math.max(1, airports.length)] ?? owned[0]).id;
  for (let i = 0; i < Math.min(nFighter, 30); i++) createUnit(sim, c, 'fighter', airBase(i), true);
  for (let i = 0; i < Math.min(nStrike, 20); i++) createUnit(sim, c, 'strike', airBase(i + 1), true);
  const zoneOf = (i: number) => sim.idx.provinces.get(coastalPort[i % Math.max(1, coastalPort.length)].id)!.seaZones[0];
  for (let i = 0; i < Math.min(nSurface, 20); i++) createUnit(sim, c, 'surface_fleet', zoneOf(i), true);
  for (let i = 0; i < Math.min(nSub, 12); i++) createUnit(sim, c, 'submarine_fleet', zoneOf(i + 1), true);
  for (let i = 0; i < Math.min(nAmph, 6); i++) createUnit(sim, c, 'amphibious_fleet', zoneOf(i), true);
  for (let i = 0; i < nCarrier; i++) createUnit(sim, c, 'carrier_group', zoneOf(i), true);
  // la experiencia y entrenamiento dependen de la calidad institucional
  for (const u of Object.values(sim.state.units)) if (u.owner === c.id) { u.training = clamp(0.55 + 0.35 * d.institutions + 0.1 * tech, 0.4, 0.95); u.experience = d.key === 'ZEN' || d.key === 'ZES' ? 0.15 : 0.05; }
  // reservas de equipo y reclutas
  c.military.equipment = { arms: 2 + gdp / 100, vehicles: 1 + gdp / 300, aircraft: gdp / 2000, ships: gdp / 3000 };
  c.military.manpower = c.demography.adult * sim.params(c).conscription * 0.6;
  c.military.personnel = personnel;
  c.military.commandQuality = clamp(0.35 + 0.35 * c.stocks.humanCapital + 0.2 * c.politics.adminCapacity / 100 - 0.15 * c.politics.corruption / 100, 0.1, 1);
  c.ai.targetArmy = Object.values(sim.state.units).filter((u) => u.owner === c.id && u.domain === 'land').length;
  if (rivalBorder.length) for (const p of rivalBorder.slice(0, 3)) if (rng.chance(0.4)) p.buildings.fortification = 1;
}
