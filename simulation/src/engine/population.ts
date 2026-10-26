import type { CountryState, ProvinceState } from '@cyo/shared';
import { clamp, approach } from '../rng.js';
import { Sim, relation, atWar } from './context.js';
import { population } from './economy.js';

/**
 * DEMOGRAFÍA: tres cohortes (0-14, 15-64, 65+), fecundidad, mortalidad por cohorte, envejecimiento,
 * urbanización, educación y migraciones internacionales. La población vive en las provincias:
 * el total nacional es la suma provincial y los cambios se reparten entre ellas.
 */
export function demographyStep(sim: Sim, c: CountryState, owned: ProvinceState[], dt: number): void {
  const d = c.demography, st = c.stocks, lp = sim.params(c);
  const pop = population(c);
  const gdppc = c.econ.realGDP / Math.max(0.01, pop) * 1000;
  const tertiary = d.education[3];
  const fertTarget = clamp(1.45 + 3.6 * Math.exp(-gdppc / 2800) + 0.9 * (d.religiosity - 0.5) + 0.45 * lp.familySupport - 0.5 * (d.urban - 0.5) - 1.6 * tertiary - 0.6 * c.econ.unemployment, 1.0, 7);
  d.fertility = approach(d.fertility, fertTarget, dt, 7);
  const health = st.health;
  const food = c.econ.foodShortage;
  const mYoung = 0.0015 + 0.035 * (1 - health) ** 2 + 0.03 * food;
  const mAdult = 0.0018 + 0.01 * (1 - health) + 0.01 * food + 0.004 * c.politics.crime / 100;
  const mOld = 0.03 + 0.06 * (1 - health) + 0.04 * food;
  const births = d.fertility * d.adult * 0.0105;
  const deaths = d.young * mYoung + d.adult * mAdult + d.old * mOld;
  const toAdult = d.young / 15;
  const toOld = d.adult / (lp.retirementAge > 64 ? 48 : 46);
  d.young = Math.max(0, d.young + (births - d.young * mYoung - toAdult) * dt);
  d.adult = Math.max(0, d.adult + (toAdult - d.adult * mAdult - toOld) * dt);
  d.old = Math.max(0, d.old + (toOld - d.old * mOld) * dt);
  d.births = births;
  d.deaths = deaths;
  d.lifeExpectancy = approach(d.lifeExpectancy, clamp(42 + 40 * health - 15 * food, 30, 92), dt, 3);
  // urbanización
  const urbanTarget = clamp(0.22 + 0.16 * Math.log(Math.max(1, gdppc / 900)), 0.12, 0.95);
  d.urban = approach(d.urban, urbanTarget, dt, 15);
  // educación: [sin estudios, primaria, secundaria, superior]
  const access = lp.educationAccess, univ = lp.universityAccess;
  const eduSpend = c.budget.education;
  const tSec = clamp(0.1 + 0.55 * access * Math.min(1, eduSpend / 4) + 0.2 * Math.tanh(gdppc / 10000), 0, 0.85);
  const tTer = clamp(0.02 + 0.3 * univ * Math.min(1, eduSpend / 5) * Math.tanh(gdppc / 8000) + techBonus(c), 0, 0.6);
  const tNone = clamp(0.5 - 0.45 * access - 0.25 * Math.tanh(gdppc / 5000), 0.01, 0.8);
  const ed = d.education;
  ed[3] = approach(ed[3], tTer, dt, 15);
  ed[2] = approach(ed[2], tSec, dt, 12);
  ed[0] = approach(ed[0], tNone, dt, 12);
  ed[1] = Math.max(0, 1 - ed[0] - ed[2] - ed[3]);
  d.religiosity = approach(d.religiosity, clamp(d.religiosity - 0.05 * (d.urban - 0.5) - 0.08 * ed[3] + 0.08 * lp.stateReligion - 0.1 * (lp.religiousFreedom < 0.3 && lp.stateReligion < 0.1 ? 1 : 0), 0.05, 0.98), dt, 25);
  // repartir el cambio entre provincias (las urbanas crecen más; las ocupadas expulsan población)
  const newTotal = d.young + d.adult + d.old;
  rebalanceProvinces(sim, c, owned, newTotal, dt);
}

function techBonus(c: CountryState): number { return c.tech.known.includes('world_web') ? 0.02 : 0; }

export function rebalanceProvinces(sim: Sim, c: CountryState, owned: ProvinceState[], total: number, dt: number): void {
  if (!owned.length) return;
  const capital = c.capital;
  const urbanTarget = c.demography.urban;
  let sum = 0;
  const w = owned.map((p) => {
    const occupied = p.controller !== c.id;
    const pull = 1 + dt * (0.02 * (p.urban - urbanTarget) + (p.id === capital ? 0.008 : 0) - (occupied ? 0.15 : 0) - 0.05 * p.devastation - 0.02 * p.unrest);
    const v = p.pop * Math.max(0.5, pull);
    sum += v;
    return v;
  });
  owned.forEach((p, i) => {
    p.pop = sum > 0 ? total * w[i] / sum : total / owned.length;
    p.urban = approach(p.urban, clamp(urbanTarget * (p.id === capital ? 1.35 : 1) * (0.7 + 0.6 * Math.min(1, p.infra * 1.2)), 0.05, 0.98), dt, 20);
  });
}

/** Migración internacional mensual y refugiados de guerra. */
export function migrationStep(sim: Sim, dt: number): void {
  const countries = sim.aliveCountries();
  const attract = new Map<string, number>();
  for (const c of countries) {
    const pop = population(c);
    const gdppc = c.econ.realGDP / Math.max(0.01, pop) * 1000;
    const war = Object.values(sim.state.wars).some((w) => w.status === 'active' && w.participants.some((p) => p.country === c.id)) ? 1 : 0;
    attract.set(c.id, Math.log(Math.max(200, gdppc)) + c.politics.stability / 40 - war * 1.5 - c.econ.unemployment * 4 - c.econ.foodShortage * 3);
  }
  const net = new Map<string, number>();
  for (const a of countries) {
    const la = sim.params(a);
    for (const b of countries) {
      if (a.id === b.id) continue;
      const diff = attract.get(b.id)! - attract.get(a.id)!;
      if (diff <= 0.3) continue;
      const lb = sim.params(b);
      const rel = relation(sim.state, a.id, b.id);
      if (atWar(sim.state, a.id, b.id)) continue;
      const pa = sim.idx.provinces.get(a.capital), pb = sim.idx.provinces.get(b.capital);
      const dist = pa && pb ? Math.hypot(pa.cx - pb.cx, pa.cy - pb.cy) : 50;
      const coop = Object.values(sim.state.treaties).some((t) => t.status === 'active' && t.type === 'migration_cooperation' && t.parties.includes(a.id) && t.parties.includes(b.id)) ? 1.8 : 1;
      const flow = 0.0006 * a.demography.adult * (diff - 0.3) * la.emigration * (0.15 + lb.immigration) * coop / Math.pow(Math.max(5, dist) / 20, 1.2) * (0.6 + 0.4 * (rel.opinion + 100) / 200);
      net.set(a.id, (net.get(a.id) ?? 0) - flow);
      net.set(b.id, (net.get(b.id) ?? 0) + flow);
    }
  }
  for (const c of countries) {
    const m = (net.get(c.id) ?? 0) * dt;
    c.demography.netMigration = (net.get(c.id) ?? 0);
    // los migrantes son mayoritariamente adultos jóvenes
    c.demography.adult = Math.max(0.001, c.demography.adult + m * 0.85);
    c.demography.young = Math.max(0.001, c.demography.young + m * 0.15);
  }
}
