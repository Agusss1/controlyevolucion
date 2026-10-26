import type { WorldState, WorldMap, CountryState, Unit, GameEvent, CountryId } from '@cyo/shared';
import { Sim, relation } from './context.js';
import { population, nominalGDP, techMultiplier } from './economy.js';
import { estimate, landStrength } from './ai.js';
import { allies, isHostile } from './military.js';
import { computeLawParams } from '../data/laws.js';
import { TECHS } from '../data/techs.js';
import { techCost, canResearch, researchPoints } from './tech.js';
import { totalRevenue } from './fiscal.js';

/**
 * VISTAS PARA CLIENTES con niebla de guerra e información imperfecta: un Estado no conoce con
 * precisión las cifras de otro (el error depende de su inteligencia y de la libertad de prensa
 * del observado), ni ve unidades lejos de su territorio o del de sus aliados.
 */

export interface PublicCountryView {
  id: string; name: string; longName: string; adjective: string; color: string; flag: CountryState['flag']; capital: string;
  regime: string; alive: boolean; bloc: string | null; culture: string; religion: string; archetype: string; createdDay: number; successorOf: string | null;
  population: number; gdp: number; gdpPerCapita: number; growth: number; inflation: number; unemployment: number; stability: number; approval: number;
  military: number; techs: number; human: boolean; online: boolean; currency: string; history: string[]; strengths: string[]; weaknesses: string[];
  foundedYear: number; gini: number; debtRatio: number; rating: string; inDefault: boolean; parties: { name: string; short: string; color: string; seats: number; government: boolean }[];
  headOfGovernment: string; exact: boolean;
}

export interface UnitView { id: string; owner: string; type: string; name: string; location: string; strength: number; status: string; path: string[]; progress: number; estimated: boolean; order: string | null; target: string | null; organization: number; supply: number; equipment: number; training: number; morale: number; experience: number; entrenchment: number }

export interface WorldView {
  day: number;
  scenario: WorldState['scenario'];
  countries: PublicCountryView[];
  owner: string[];
  controller: string[];
  unrest: number[];
  devastation: number[];
  infra: number[];
  pop: number[];
  wars: WorldState['wars'][string][];
  treaties: { id: string; type: string; name: string; parties: string[]; signedDay: number; expiresDay: number | null }[];
  organizations: WorldState['organizations'][string][];
  markets: WorldState['markets'];
  trade: WorldState['trade'];
  units: UnitView[];
  battles: WorldState['battles'][string][];
  relations: Record<string, { opinion: number; trust: number; embassies: boolean; sanctions: boolean; recognized: boolean }>;
  news: GameEvent[];
  worldInflation: number;
  worldInterestRate: number;
}

export function buildWorldView(state: WorldState, map: WorldMap, viewer: CountryId | null): WorldView {
  const sim = new Sim(state, map);
  const obs = viewer ? state.countries[viewer] ?? null : null;
  const provinces = map.provinces.map((p) => state.provinces[p.id]);
  const countries: PublicCountryView[] = Object.values(state.countries).map((c) => publicCountry(sim, obs, c));
  // visibilidad de unidades: territorio propio/aliado, provincias adyacentes y zonas marítimas costeras
  const visible = new Set<string>();
  if (obs) {
    for (const p of provinces) {
      if (p.controller === obs.id || p.owner === obs.id || allies(sim, obs.id, p.controller)) {
        visible.add(p.id);
        const ps = sim.idx.provinces.get(p.id)!;
        for (const l of ps.neighbors) visible.add(l.to);
        for (const z of ps.seaZones) visible.add(z);
      }
    }
    for (const u of Object.values(state.units)) if (u.owner === obs.id || allies(sim, obs.id, u.owner)) {
      visible.add(u.location);
      const z = sim.idx.seaZones.get(u.location);
      if (z) { for (const n of z.neighbors) visible.add(n); for (const p of z.provinces) visible.add(p); }
    }
  }
  const units: UnitView[] = [];
  for (const u of Object.values(state.units)) {
    const own = obs && (u.owner === obs.id);
    const friendly = obs && allies(sim, obs.id, u.owner);
    if (!obs || own || friendly || visible.has(u.location)) units.push(unitView(sim, obs, u, !!own || !!friendly));
  }
  const relations: WorldView['relations'] = {};
  if (obs) for (const o of Object.values(state.countries)) {
    if (o.id === obs.id) continue;
    const r = relation(state, obs.id, o.id);
    relations[o.id] = { opinion: Math.round(r.opinion), trust: Math.round(r.trust), embassies: r.embassies, sanctions: r.sanctions.length > 0, recognized: r.recognized };
  }
  const news = state.recentEvents.filter((e) => e.scope === 'world' || (viewer && e.countries.includes(viewer))).slice(-120);
  return {
    day: state.day, scenario: state.scenario, countries,
    owner: provinces.map((p) => p.owner), controller: provinces.map((p) => p.controller),
    unrest: provinces.map((p) => Math.round(p.unrest * 100) / 100), devastation: provinces.map((p) => Math.round(p.devastation * 100) / 100),
    infra: provinces.map((p) => Math.round(p.infra * 100) / 100), pop: provinces.map((p) => Math.round(p.pop * 1000) / 1000),
    wars: Object.values(state.wars).filter((w) => w.status !== 'ended' || state.day - (w.endedDay ?? 0) < 720),
    treaties: Object.values(state.treaties).filter((t) => t.status === 'active').map((t) => ({ id: t.id, type: t.type, name: t.name, parties: t.parties, signedDay: t.signedDay, expiresDay: t.expiresDay })),
    organizations: Object.values(state.organizations).filter((o) => o.active),
    markets: state.markets, trade: state.trade.slice(0, 80), units,
    battles: Object.values(state.battles).filter((b) => b.status === 'active' || b.status === 'frozen' || state.day - b.lastDay < 30),
    relations, news, worldInflation: state.worldInflation, worldInterestRate: state.worldInterestRate
  };
}

function round(v: number, d = 2): number { const f = 10 ** d; return Math.round(v * f) / f; }

export function publicCountry(sim: Sim, obs: CountryState | null, c: CountryState): PublicCountryView {
  const exact = !!obs && obs.id === c.id;
  const est = (k: string, v: number) => (exact ? v : estimate(sim, obs, c, k, v));
  const pop = population(c);
  const gdp = est('gdp', c.econ.realGDP);
  const ngdp = nominalGDP(c);
  return {
    id: c.id, name: c.name, longName: c.longName, adjective: c.adjective, color: c.color, flag: c.flag, capital: c.capital, regime: c.regime, alive: c.alive,
    bloc: c.bloc, culture: c.culture, religion: c.religion, archetype: c.archetype, createdDay: c.createdDay, successorOf: c.successorOf,
    population: round(pop, 2), gdp: round(gdp, 1), gdpPerCapita: Math.round(gdp / Math.max(0.01, pop) * 1000),
    growth: round(est('growth', c.econ.growth), 4), inflation: round(est('inflation', c.econ.inflation), 4), unemployment: round(est('unemp', c.econ.unemployment), 3),
    stability: Math.round(est('stab', c.politics.stability)), approval: Math.round(est('appr', c.politics.approval)),
    military: Math.round(est('land', landStrength(sim, c.id))), techs: c.tech.known.length, human: sim.isHuman(c.id), online: sim.isOnline(c.id),
    currency: c.currency.name, history: c.history, strengths: c.strengths, weaknesses: c.weaknesses, foundedYear: c.foundedYear, gini: round(c.econ.gini, 3),
    debtRatio: round(est('debt', (c.fiscal.debtDomestic + c.fiscal.debtForeign * c.econ.exchangeRate) / Math.max(1e-6, ngdp)), 3), rating: c.fiscal.rating, inDefault: c.fiscal.inDefault,
    parties: c.parties.map((p) => ({ name: p.name, short: p.short, color: p.color, seats: c.parliament[p.id] ?? 0, government: c.politics.governmentParties.includes(p.id) })),
    headOfGovernment: c.politics.headOfGovernment, exact
  };
}

function unitView(sim: Sim, obs: CountryState | null, u: Unit, exact: boolean): UnitView {
  const owner = sim.state.countries[u.owner];
  const s = exact || !owner ? u.strength : estimate(sim, obs, owner, 'u' + u.id, u.strength);
  return {
    id: u.id, owner: u.owner, type: u.type, name: exact ? u.name : '', location: u.location, strength: round(Math.min(1.3, s)), status: u.status,
    path: exact ? u.path : [], progress: round(u.progress), estimated: !exact, order: exact ? u.order?.kind ?? null : null, target: exact ? u.order?.target ?? null : null,
    organization: exact ? round(u.organization) : 0, supply: exact ? round(u.supply) : 0, equipment: exact ? round(u.equipment) : 0, training: exact ? round(u.training) : 0,
    morale: exact ? round(u.morale) : 0, experience: exact ? round(u.experience) : 0, entrenchment: exact ? round(u.entrenchment) : 0
  };
}

/** Vista privada completa del país propio, con datos derivados útiles para la interfaz. */
export function buildPrivateView(state: WorldState, map: WorldMap, countryId: CountryId) {
  const sim = new Sim(state, map);
  const c = state.countries[countryId];
  if (!c) return null;
  const lp = computeLawParams(c.laws);
  const tm = techMultiplier(c);
  const techs = TECHS.map((t) => ({ id: t.id, known: c.tech.known.includes(t.id), available: canResearch(c, t).ok, cost: c.tech.known.includes(t.id) ? 0 : Math.round(techCost(sim, c, t)), progress: Math.round(c.tech.progress[t.id] ?? 0) }));
  const proposals = Object.values(state.proposals).filter((p) => p.from === countryId || p.to === countryId).slice(-60);
  const wars = Object.values(state.wars).filter((w) => w.participants.some((p) => p.country === countryId) || w.callsToArms.some((x) => x.country === countryId));
  const plans = Object.values(state.plans).filter((p) => p.owner === countryId && p.active);
  const ownProvinces = Object.values(state.provinces).filter((p) => p.owner === countryId || p.controller === countryId).map((p) => ({ ...p, capital: undefined, capitalTotal: round(p.capital.reduce((a, b) => a + b, 0), 2) }));
  const enemiesOnline = wars.flatMap((w) => w.mandatoryHumans.map((h) => ({ war: w.id, country: h, online: sim.isOnline(h) })));
  return {
    country: c, lawParams: lp, techMultiplier: tm, techs, researchPoints: Math.round(researchPoints(sim, c)), proposals, wars, plans, provinces: ownProvinces,
    revenueTotal: totalRevenue(c.fiscal.revenue), nominalGDP: nominalGDP(c), presence: enemiesOnline,
    hostile: Object.values(state.countries).filter((o) => o.alive && isHostile(sim, countryId, o.id)).map((o) => o.id)
  };
}

export type PrivateView = NonNullable<ReturnType<typeof buildPrivateView>>;
