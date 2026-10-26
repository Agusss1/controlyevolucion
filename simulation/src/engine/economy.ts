import { SECTORS, type CountryState, type SectorId, type CommodityId, type ProvinceState } from '@cyo/shared';
import { SECTOR_INFO } from '../data/sectors.js';
import { TECH_BY_ID } from '../data/techs.js';
import { clamp, approach } from '../rng.js';
import { Sim, relation, hasTreaty, sharedOrganizations, atWar } from './context.js';
import type { LawParams } from '../data/laws.js';

/**
 * MOTOR ECONÓMICO (ver docs/FORMULAS.md).
 *
 * Producción por sector: Y_s = A_s · M_s · Keff_s^α · L_s^(1-α) · (1+brecha) · factorEnergía,
 * donde Keff suma el capital de cada provincia ponderado por control efectivo, devastación e
 * infraestructura. Los sectores extractivos están limitados por las reservas físicas de sus
 * provincias, que se agotan. Precios, dinero, tipo de cambio, empleo e inversión evolucionan
 * con ecuaciones de ajuste temporal; nada se fija por guion.
 */

export const RESERVE_LIFE = 25; // años de reservas que puede extraer como máximo la capacidad instalada

export interface CountryProduction {
  potential: Record<SectorId, number>;
  provinceShare: Map<string, number[]>;
  commodities: Record<CommodityId, number>;
}

const SECTOR_INDEX: Record<SectorId, number> = Object.fromEntries(SECTORS.map((s, i) => [s, i])) as Record<SectorId, number>;
export { SECTOR_INDEX };

export function provinceModifier(p: ProvinceState, owner: string): number {
  const control = p.controller === owner ? 1 : 0.08;
  return control * (1 - p.devastation * 0.85) * (0.55 + 0.45 * p.infra) * (p.unrest > 0.7 ? 0.85 : 1);
}

export function techMultiplier(c: CountryState): Record<SectorId, number> {
  const m = Object.fromEntries(SECTORS.map((s) => [s, 1])) as Record<SectorId, number>;
  for (const t of c.tech.known) {
    const def = TECH_BY_ID[t];
    if (!def?.effects.sectors) continue;
    for (const [s, v] of Object.entries(def.effects.sectors)) m[s as SectorId] *= 1 + (v ?? 0);
  }
  return m;
}

export function techEffect(c: CountryState, key: 'health' | 'education' | 'energyEfficiency' | 'military' | 'air' | 'naval' | 'logistics' | 'intel' | 'admin' | 'research'): number {
  let v = 0;
  for (const t of c.tech.known) v += TECH_BY_ID[t]?.effects[key] ?? 0;
  return v;
}

/** Ineficiencia de las empresas estatales: depende de la capacidad administrativa y de los controles de precios. */
export function stateInefficiency(c: CountryState, lp: LawParams): number {
  return 0.22 * (1 - c.politics.adminCapacity / 100) + 0.12 * lp.priceControls + 0.06 * (c.politics.corruption / 100);
}

/** Producción potencial por sector (sin brecha de demanda ni escasez). */
export function computeProduction(sim: Sim, c: CountryState, ownedProvinces: ProvinceState[]): CountryProduction {
  const lp = sim.params(c);
  const tm = techMultiplier(c);
  const ineff = stateInefficiency(c, lp);
  const potential = {} as Record<SectorId, number>;
  const provinceShare = new Map<string, number[]>();
  const keff = new Array(SECTORS.length).fill(0);
  for (const p of ownedProvinces) {
    const mod = provinceModifier(p, c.id);
    const shares: number[] = [];
    for (let i = 0; i < SECTORS.length; i++) { const k = p.capital[i] * mod; keff[i] += k; shares.push(k); }
    provinceShare.set(p.id, shares);
  }
  for (let i = 0; i < SECTORS.length; i++) {
    const s = SECTORS[i];
    const info = SECTOR_INFO[s];
    const sec = c.econ.sectors[s];
    const L = Math.max(1e-6, sec.labor);
    const K = Math.max(1e-9, keff[i]);
    let y = sec.tfp * tm[s] * (1 - sec.stateShare * ineff) * Math.pow(K, info.alpha) * Math.pow(L, 1 - info.alpha);
    if (info.extractive) {
      let reserves = 0;
      for (const p of ownedProvinces) {
        if (p.controller !== c.id) continue;
        reserves += s === 'oil' ? p.reserves.oil : s === 'gas' ? p.reserves.gas : p.reserves.coal + p.reserves.minerals;
      }
      y = Math.min(y, (reserves / RESERVE_LIFE) * (1 - lp.extractionLimit));
    }
    potential[s] = Math.max(0, y);
  }
  // reparto de la producción entre provincias para agotamiento y estadísticas
  for (const [pid, shares] of provinceShare) {
    for (let i = 0; i < SECTORS.length; i++) shares[i] = keff[i] > 0 ? shares[i] / keff[i] : 0;
    provinceShare.set(pid, shares);
  }
  const mining = potential.mining;
  let coalR = 0, minR = 0;
  for (const p of ownedProvinces) { coalR += p.reserves.coal; minR += p.reserves.minerals; }
  const coalShare = coalR + minR > 0 ? coalR / (coalR + minR) : 0.5;
  const commodities: Record<CommodityId, number> = {
    food: potential.agriculture + potential.livestock,
    oil: potential.oil,
    gas: potential.gas,
    coal: mining * coalShare,
    minerals: mining * (1 - coalShare)
  };
  return { potential, provinceShare, commodities };
}

/** Demanda de materias primas de un país (valor a precios base). */
export function commodityDemand(sim: Sim, c: CountryState, output: Record<SectorId, number>): Record<CommodityId, number> {
  const cal = sim.state.calib;
  const eff = 1 - Math.min(0.6, techEffect(c, 'energyEfficiency'));
  let energy = 0, minerals = 0;
  for (const s of SECTORS) { energy += output[s] * SECTOR_INFO[s].energy; minerals += output[s] * SECTOR_INFO[s].minerals; }
  const pop = c.demography.young + c.demography.adult + c.demography.old;
  const gdppc = c.econ.realGDP / Math.max(0.01, pop) * 1000;
  energy += pop * Math.min(2, gdppc / 10000) * 0.4; // consumo de los hogares
  energy *= eff;
  // las centrales hidroeléctricas y nucleares sustituyen combustibles fósiles
  let hydro = 0;
  for (const p of sim.ownedProvinces(c.id)) hydro += (sim.idx.provinces.get(p.id)?.resources.hydro ?? 0) * (0.3 + 0.7 * Math.min(1, p.buildings.power_plant / 2));
  const nuclear = c.tech.known.includes('nuclear_fission') ? 0.12 : 0;
  const fossil = Math.max(0, energy * (1 - nuclear) - hydro * 0.08);
  const food = pop * cal.foodPerCapita * (c.cooldowns.foodBias ?? 1) * Math.pow(Math.max(300, gdppc) / 4000, 0.18);
  return {
    food,
    oil: fossil * 0.47 * cal.energyScale.oil,
    gas: fossil * 0.28 * cal.energyScale.gas,
    coal: fossil * 0.25 * cal.energyScale.coal,
    minerals: minerals * cal.mineralScale
  };
}

// ---------------------------------------------------------------------------
// Comercio internacional (bienes y materias primas)
// ---------------------------------------------------------------------------

export interface TradeAccess { matrix: Map<string, number> }

export function tradeAccess(sim: Sim, a: CountryState, b: CountryState): number {
  const st = sim.state;
  if (a.id === b.id) return 0;
  if (atWar(st, a.id, b.id)) return 0;
  const la = sim.params(a), lb = sim.params(b);
  const rel = relation(st, a.id, b.id);
  let cut = 0;
  if (hasTreaty(st, a.id, b.id, 'customs_union')) cut = 1;
  else if (hasTreaty(st, a.id, b.id, 'trade_agreement')) cut = 0.85;
  for (const o of sharedOrganizations(st, a.id, b.id)) cut = Math.max(cut, o.tariffCut);
  const tariff = b.taxes.import * (1 - cut);
  let access = Math.max(0, 1 - tariff * 1.6) * (1 - lb.tradeBarriers * 0.85 * (1 - cut * 0.7)) * (1 - la.tradeBarriers * 0.25);
  if (rel.sanctions.length) access *= rel.sanctions.includes(a.id) && rel.sanctions.includes(b.id) ? 0.05 : 0.2;
  if (!rel.embassies) access *= 0.7;
  access *= 0.7 + 0.3 * (rel.opinion + 100) / 200;
  return access * blockadeFactor(sim, a) * blockadeFactor(sim, b);
}

/** Bloqueo naval: fracción del comercio marítimo que sigue fluyendo. */
export function blockadeFactor(sim: Sim, c: CountryState): number {
  return sim.blockade.get(c.id) ?? 1;
}

export function capitalDistance(sim: Sim, a: CountryState, b: CountryState): number {
  const pa = sim.idx.provinces.get(a.capital), pb = sim.idx.provinces.get(b.capital);
  if (!pa || !pb) return 50;
  return Math.hypot(pa.cx - pb.cx, pa.cy - pb.cy);
}

/** Calcula comercio de bienes y despeja los mercados de materias primas. Diario. */
export function worldTrade(sim: Sim, prod: Map<string, { output: Record<SectorId, number>; commodities: Record<CommodityId, number>; demand: Record<CommodityId, number> }>, dt: number): void {
  const st = sim.state;
  const countries = sim.aliveCountries();
  const n = countries.length;
  const access: number[][] = countries.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) access[i][j] = tradeAccess(sim, countries[i], countries[j]);
  const dist: number[][] = countries.map((a) => countries.map((b) => Math.max(4, capitalDistance(sim, a, b))));

  // ---- bienes y servicios comerciables
  const goodsExp = new Array(n).fill(0), goodsImp = new Array(n).fill(0);
  const flows: { from: string; to: string; value: number }[] = [];
  const tradable = countries.map((c) => {
    const o = prod.get(c.id)!.output;
    let t = 0;
    for (const s of SECTORS) t += o[s] * SECTOR_INFO[s].tradable;
    return t;
  });
  const competitiveness = countries.map((c) => {
    const q = realExchangeRate(sim, c);
    return Math.pow(clamp(q, 0.4, 2.5), 0.7);
  });
  // un país con moneda depreciada importa menos: los bienes extranjeros se encarecen
  const importerPrice = countries.map((c) => Math.pow(clamp(realExchangeRate(sim, c), 0.4, 2.5), 0.5));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j || access[i][j] <= 0) continue;
      const v = st.calib.tradeScale * (countries[i].cooldowns.exportBias ?? 1) * Math.pow(tradable[i], 0.75) * Math.pow(countries[j].econ.realGDP, 0.55) / Math.pow(dist[i][j], 0.65) * access[i][j] * competitiveness[i] / importerPrice[j];
      goodsExp[i] += v;
      goodsImp[j] += v;
      if (v > 0.5) flows.push({ from: countries[i].id, to: countries[j].id, value: v });
    }
  }

  // ---- materias primas
  const commodityIds: CommodityId[] = ['food', 'oil', 'gas', 'coal', 'minerals'];
  const commExp = countries.map(() => 0), commImp = countries.map(() => 0);
  const commodityFlows = new Map<string, number>();
  // respuesta de cantidades al precio: con precios bajos los productores recortan extracción (lo no
  // extraído queda en el subsuelo) y el consumo aumenta; así el mercado tiene un equilibrio interior
  const supplyF = {} as Record<CommodityId, number>;
  for (const k of commodityIds) {
    const r = st.markets[k].price / st.markets[k].basePrice;
    supplyF[k] = k === 'food' ? clamp(Math.pow(r, 0.3), 0.85, 1) : clamp(Math.pow(r, 0.5), 0.5, 1);
    const demandF = clamp(Math.pow(r, -0.2), 0.7, 1.5);
    for (const c of countries) { const pd = prod.get(c.id)!; pd.demand[k] *= demandF; }
  }
  for (const c of countries) {
    const pd = prod.get(c.id)!, cm = pd.commodities, out = pd.output;
    const mined = cm.coal + cm.minerals;
    if (mined > 0) out.mining *= (cm.coal * supplyF.coal + cm.minerals * supplyF.minerals) / mined;
    out.oil *= supplyF.oil;
    out.gas *= supplyF.gas;
    out.agriculture *= supplyF.food;
    out.livestock *= supplyF.food;
    for (const k of commodityIds) cm[k] *= supplyF[k];
  }
  for (const k of commodityIds) {
    const surplus = countries.map((c) => Math.max(0, prod.get(c.id)!.commodities[k] - prod.get(c.id)!.demand[k]));
    const deficit = countries.map((c) => Math.max(0, prod.get(c.id)!.demand[k] - prod.get(c.id)!.commodities[k]));
    const totalS = surplus.reduce((a, b) => a + b, 0), totalD = deficit.reduce((a, b) => a + b, 0);
    const m = st.markets[k];
    m.supply = countries.reduce((a, c) => a + prod.get(c.id)!.commodities[k], 0);
    m.demand = countries.reduce((a, c) => a + prod.get(c.id)!.demand[k], 0);
    // precio: sube cuando la demanda de importación supera la oferta exportable
    const ratio = (totalD + 1e-6) / (totalS + 1e-6);
    const target = m.price * Math.pow(clamp(ratio, 0.2, 5), 0.5);
    m.price = clamp(approach(m.price, target, dt, 0.1), m.basePrice * 0.25, m.basePrice * 8);
    const sold = new Array(n).fill(0);
    // oferta accesible para cada importador y accesibilidad media mundial
    const reach = new Array(n).fill(0);
    let accSum = 0, accW = 0;
    for (let j = 0; j < n; j++) {
      if (deficit[j] <= 0) continue;
      for (let i = 0; i < n; i++) reach[j] += surplus[i] * access[i][j];
      accSum += reach[j] / Math.max(1e-9, totalS) * deficit[j];
      accW += deficit[j];
    }
    const meanAcc = accW > 0 ? accSum / accW : 1;
    for (let j = 0; j < n; j++) {
      if (deficit[j] <= 0) continue;
      const reachable = reach[j];
      // la accesibilidad relativa (sanciones, bloqueos, guerra) limita cuánto del excedente mundial alcanza a j
      const accessibility = reachable / Math.max(1e-9, totalS);
      const rel = accessibility / Math.max(1e-6, meanAcc);
      const fill = Math.min(1, Math.min(1, totalS / Math.max(totalD, 1e-9)) * Math.pow(clamp((rel - 0.1) / 0.5, 0, 1), 0.5));
      // restricción de divisas
      const c = countries[j];
      const cost = deficit[j] * fill * m.price;
      const affordable = c.econ.reserves > 0 || cost < c.econ.exports * 0.5 ? 1 : 0.6;
      const got = deficit[j] * fill * affordable;
      const pd = prod.get(c.id)!;
      const shortage = deficit[j] > 0 ? 1 - got / deficit[j] : 0;
      c.econ.commodities[k] = { production: pd.commodities[k], consumption: pd.demand[k], imports: got, exports: 0, shortage: pd.demand[k] > 0 ? (deficit[j] - got) / pd.demand[k] : 0 };
      void shortage;
      commImp[j] += got * m.price;
      if (reachable > 0) for (let i = 0; i < n; i++) {
        const part = got * surplus[i] * access[i][j] / reachable;
        sold[i] += part;
        if (part > 0.3) commodityFlows.set(`${countries[i].id}>${c.id}`, (commodityFlows.get(`${countries[i].id}>${c.id}`) ?? 0) + part * m.price);
      }
    }
    for (let i = 0; i < n; i++) {
      const c = countries[i];
      const pd = prod.get(c.id)!;
      if (deficit[i] <= 0) c.econ.commodities[k] = { production: pd.commodities[k], consumption: pd.demand[k], imports: 0, exports: sold[i], shortage: 0 };
      commExp[i] += sold[i] * m.price;
    }
  }
  for (const [key, v] of commodityFlows) {
    const [from, to] = key.split('>');
    flows.push({ from, to, value: v });
  }

  // ---- totales por país (en UMI reales)
  for (let i = 0; i < n; i++) {
    const c = countries[i];
    const tour = prod.get(c.id)!.output.tourism;
    c.econ.exports = goodsExp[i] + commExp[i] + tour * 0.6;
    c.econ.imports = goodsImp[i] + commImp[i];
    // los combustibles son sustituibles: el excedente no vendido de uno cubre el faltante de otro
    let unmet = 0, unsold = 0, fuelDemand = 0;
    for (const k of ['oil', 'gas', 'coal'] as const) {
      const b = c.econ.commodities[k];
      fuelDemand += b.consumption;
      unmet += Math.max(0, b.consumption - b.production - b.imports);
      unsold += Math.max(0, b.production - b.consumption - b.exports);
    }
    const energyShort = Math.max(0, unmet - 0.8 * unsold) / Math.max(1e-6, fuelDemand);
    c.econ.energyShortage = approach(c.econ.energyShortage, clamp(energyShort, 0, 1), dt, 0.05);
    c.econ.foodShortage = approach(c.econ.foodShortage, clamp(c.econ.commodities.food.shortage, 0, 1), dt, 0.05);
  }
  // flujos más importantes para el mapa
  const merged = new Map<string, number>();
  for (const f of flows) {
    const key = f.from < f.to ? `${f.from}|${f.to}` : `${f.to}|${f.from}`;
    merged.set(key, (merged.get(key) ?? 0) + f.value);
  }
  st.trade = [...merged.entries()].map(([k, v]) => { const [a, b] = k.split('|'); return { from: a, to: b, value: Math.round(v * 10) / 10 }; })
    .sort((a, b) => b.value - a.value).slice(0, 160);
}

export function realExchangeRate(sim: Sim, c: CountryState): number {
  return (c.econ.exchangeRate / c.econ.baseExchangeRate) * (sim.state.worldPriceLevel / c.econ.priceLevel);
}

// ---------------------------------------------------------------------------
// Paso macroeconómico de un país
// ---------------------------------------------------------------------------

export interface MacroInputs {
  output: Record<SectorId, number>;
  potentialTotal: number;
  provinceShare: Map<string, number[]>;
  owned: ProvinceState[];
}

export function population(c: CountryState): number { return c.demography.young + c.demography.adult + c.demography.old; }

export function nominalGDP(c: CountryState): number { return c.econ.realGDP * c.econ.priceLevel * c.econ.baseExchangeRate; }

export function macroStep(sim: Sim, c: CountryState, inp: MacroInputs, dt: number): void {
  const e = c.econ;
  const lp = sim.params(c);
  const pol = c.politics;
  const pop = population(c);

  // ---------------- producción efectiva
  const energyFactor = 1 - 0.55 * e.energyShortage;
  const strikeFactor = 1 - 0.25 * pol.strikes;
  const shortageFactor = 1 - 0.15 * lp.priceControls * clamp(e.inflation * 3, 0, 1);
  const warFactor = 1 - 0.3 * c.military.warExhaustion;
  let realGDP = 0;
  for (const s of SECTORS) {
    const extractive = SECTOR_INFO[s].extractive;
    const y = inp.output[s] * (1 + e.outputGap * (extractive ? 0.2 : 1)) * (extractive ? 1 : energyFactor) * (s === 'industry' || s === 'transport' ? strikeFactor : 1) * shortageFactor * warFactor;
    e.sectors[s].output = Math.max(0, y);
    realGDP += e.sectors[s].output;
  }
  const prevGDP = e.realGDP;
  e.realGDP = realGDP;
  e.potentialGDP = inp.potentialTotal;
  // un cambio territorial no es crecimiento: se reinicia la base de comparación
  if (c.cooldowns.resetGrowth) c.cooldowns.resetGrowth = 0;
  else e.growth = approach(e.growth, prevGDP > 0 ? clamp(Math.log(realGDP / prevGDP) / dt, -3, 3) : 0, dt, 0.5);

  // ---------------- agotamiento de reservas
  for (const p of inp.owned) {
    const sh = inp.provinceShare.get(p.id);
    if (!sh || p.controller !== c.id) continue;
    p.reserves.oil = Math.max(0, p.reserves.oil - e.sectors.oil.output * sh[SECTOR_INDEX.oil] * dt);
    p.reserves.gas = Math.max(0, p.reserves.gas - e.sectors.gas.output * sh[SECTOR_INDEX.gas] * dt);
    const mined = e.sectors.mining.output * sh[SECTOR_INDEX.mining] * dt;
    const tot = p.reserves.coal + p.reserves.minerals;
    if (tot > 0) { p.reserves.coal = Math.max(0, p.reserves.coal - mined * p.reserves.coal / tot); p.reserves.minerals = Math.max(0, p.reserves.minerals - mined * p.reserves.minerals / tot); }
  }

  // ---------------- términos de intercambio: ingreso nacional ajustado por precios de materias primas
  let tot = 0;
  for (const k of ['oil', 'gas', 'coal', 'minerals', 'food'] as const) {
    const m = sim.state.markets[k];
    tot += (m.price / m.basePrice - 1) * (e.commodities[k].exports - e.commodities[k].imports);
  }
  const nationalIncome = Math.max(realGDP * 0.3, realGDP + tot);

  // ---------------- empleo
  const adult = c.demography.adult;
  const retirementShift = (62 - lp.retirementAge) * 0.012;
  const participationTarget = clamp(0.62 + 0.08 * Math.tanh((e.realGDP / pop - 5) / 10) - 0.12 * (c.demography.religiosity - 0.5) - retirementShift - lp.mobilization * 0.5, 0.42, 0.82);
  e.participation = approach(e.participation, participationTarget, dt, 3);
  e.laborForce = adult * e.participation;
  const natural = clamp(0.035 + 0.06 * lp.laborRigidity + 0.05 * lp.minWage * (1 - e.informality) + 0.03 * lp.regulation + 0.02 * (1 - pol.adminCapacity / 100) + 0.04 * e.energyShortage, 0.02, 0.2);
  e.naturalUnemployment = approach(e.naturalUnemployment, natural, dt, 4);
  const uTarget = clamp(e.naturalUnemployment - 0.45 * e.outputGap + 0.15 * c.military.warExhaustion * 0, 0.01, 0.45);
  e.unemployment = approach(e.unemployment, uTarget, dt, 0.4 + 1.2 * lp.laborRigidity);
  const employed = e.laborForce * (1 - e.unemployment);
  const empScale = e.employed > 0 ? employed / e.employed : 1;
  e.employed = employed;

  // reasignación sectorial del trabajo hacia el mayor producto marginal (ponderado por prima salarial)
  let mplTotal = 0;
  const mpl: Record<string, number> = {};
  for (const s of SECTORS) { mpl[s] = (1 - SECTOR_INFO[s].alpha) * e.sectors[s].output / Math.max(1e-6, e.sectors[s].wageIndex); mplTotal += mpl[s]; }
  const tauL = 2.5 + 6 * lp.laborRigidity + 4 * lp.priceControls;
  for (const s of SECTORS) {
    const sec = e.sectors[s];
    const target = mplTotal > 0 ? employed * mpl[s] / mplTotal : sec.labor;
    sec.labor = approach(sec.labor * empScale, target, dt, tauL);
  }

  // ---------------- salarios, desigualdad y pobreza
  let labourIncome = 0;
  for (const s of SECTORS) labourIncome += (1 - SECTOR_INFO[s].alpha) * e.sectors[s].output;
  const unionBoost = 1 + 0.08 * lp.unionPower + 0.05 * lp.minWage;
  e.wage = labourIncome / Math.max(1e-6, employed) * unionBoost; // miles de UMI por trabajador y año
  const progressivity = c.taxes.income * 0.5 + c.taxes.wealth * 3;
  const transfers = c.budget.transfers / 100;
  const marketGini = 0.3 + 0.12 * (e.informality - 0.2) + 0.08 * (c.econ.sectors.oil.output / Math.max(1, realGDP)) + 0.05 * (lp.priceControls < 0.5 ? 0.2 : -0.3) - 0.06 * lp.unionPower;
  const giniTarget = clamp(marketGini - progressivity * 0.25 - transfers * 0.9 - lp.educationAccess * 0.04 + (c.cooldowns.giniBias ?? 0) / 1000, 0.18, 0.7);
  e.gini = approach(e.gini, giniTarget, dt, 6);
  const gdppc = nationalIncome / Math.max(0.01, pop) * 1000;
  const median = gdppc * (1 - e.gini) * 0.85;
  const povertyBase = 1 / (1 + Math.exp((Math.log(Math.max(50, median)) - Math.log(2600)) * 1.7));
  e.poverty = approach(e.poverty, clamp(povertyBase + 0.5 * e.unemployment - transfers * 1.2 + 0.4 * e.foodShortage, 0.01, 0.95), dt, 1);

  // ---------------- informalidad
  const laborTax = c.taxes.income * 0.5 + c.taxes.payroll + c.taxes.vat * 0.3;
  const informalTarget = clamp(0.06 + 0.45 * laborTax + 0.16 * lp.regulation + 0.08 * lp.laborRigidity + 0.08 * lp.minWage - 0.3 * (pol.adminCapacity / 100) - 0.08 * Math.tanh(gdppc / 15000) + 0.1 * (pol.corruption / 100), 0.02, 0.75);
  e.informality = approach(e.informality, informalTarget, dt, 5);

  // ---------------- confianza empresarial
  const confTarget = clamp(
    55 + 20 * Math.tanh(e.growth * 10) - Math.min(30, 60 * Math.max(0, e.inflation - 0.05)) - 25 * lp.priceControls - 20 * Math.max(0, c.taxes.corporate - 0.3)
    + 12 * (pol.stability - 50) / 50 + 8 * (lp.judicialIndependence - 0.5) - 25 * (c.fiscal.inDefault ? 1 : 0) - 15 * c.military.warExhaustion
    - 30 * e.bankStress + (c.cooldowns.confidenceShock ?? 0), 0, 100);
  e.confidence = approach(e.confidence, confTarget, dt, 0.35);
  if (c.cooldowns.confidenceShock) c.cooldowns.confidenceShock *= Math.exp(-dt / 0.5);

  // ---------------- brecha de producto (demanda)
  const ngdp = nominalGDP(c);
  const deficitRatio = -c.fiscal.balance / Math.max(1e-6, ngdp);
  c.cooldowns.deficitAnchor = approach(c.cooldowns.deficitAnchor ?? deficitRatio, deficitRatio, dt, 1.5);
  const fiscalImpulse = deficitRatio - c.cooldowns.deficitAnchor;
  const realRate = e.policyRate - e.expectedInflation;
  const monetaryImpulse = clamp(-0.4 * (realRate - 0.02), -0.06, 0.06);
  const nx = (e.exports - e.imports) / Math.max(1, realGDP);
  c.cooldowns.nxAnchor = approach(c.cooldowns.nxAnchor ?? nx, nx, dt, 1);
  const tradeImpulse = (nx - c.cooldowns.nxAnchor) * 0.5;
  // en economías planificadas la confianza empresarial pesa poco sobre la demanda
  const gapTarget = clamp(0.5 * fiscalImpulse + monetaryImpulse + (e.confidence - 55) / 700 * (1 - avgStateShare(c) * 0.8) + tradeImpulse - 0.1 * e.bankStress - 0.12 * e.energyShortage, -0.25, 0.12);
  e.outputGap = approach(e.outputGap, gapTarget, dt, 0.35);

  // ---------------- dinero, tasas e inflación
  const cbInd = lp.cbIndependence;
  const neutral = 0.02;
  if (cbInd > 0.5) {
    const taylor = neutral + e.inflation + 0.5 * (e.inflation - 0.03) + 0.5 * e.outputGap;
    e.policyRate = clamp(approach(e.policyRate, taylor, dt, 0.3), 0, 1.5);
  }
  const trendGrowth = clamp(e.growth, -0.05, 0.08);
  const baseMoneyGrowth = cbInd > 0.5
    ? 0.03 + trendGrowth - 0.5 * (e.inflation - 0.03)
    : trendGrowth + e.expectedInflation + 1.5 * (neutral + e.expectedInflation - e.policyRate);
  e.moneySupply *= Math.exp(clamp(baseMoneyGrowth, -0.3, 3) * dt);
  const printed = c.cooldowns.printedToday ?? 0;
  e.moneySupply += printed;
  c.cooldowns.printedToday = 0;
  const mg = clamp(baseMoneyGrowth, -0.3, 3) + printed / Math.max(1e-6, e.moneySupply) / dt;
  e.moneyGrowth = approach(e.moneyGrowth, mg, dt, 0.25);
  const depreciation = c.cooldowns.depreciationRate ?? 0;
  let commodityPush = 0;
  for (const k of ['oil', 'food'] as const) {
    const m = sim.state.markets[k];
    commodityPush += (Math.log(m.price / Math.max(1e-6, c.cooldowns[`p_${k}`] ?? m.price))) / dt * (k === 'oil' ? 0.04 : 0.06);
    c.cooldowns[`p_${k}`] = m.price;
  }
  const excessMoney = e.moneyGrowth - trendGrowth - e.expectedInflation;
  const shortages = 0.3 * e.foodShortage + 0.15 * e.energyShortage;
  let piTarget = e.expectedInflation + 0.45 * e.outputGap + 0.65 * excessMoney + 0.25 * depreciation + commodityPush + shortages;
  piTarget *= 1 - 0.55 * lp.priceControls * (piTarget > 0 ? 1 : 0);
  e.inflation = clamp(approach(e.inflation, piTarget, dt, 0.25), -0.1, 50);
  const anchor = cbInd * 0.03 + (1 - cbInd) * e.inflation;
  e.expectedInflation = approach(e.expectedInflation, anchor, dt, 0.4 + 2 * cbInd);
  e.priceLevel *= Math.exp(e.inflation * dt);

  // ---------------- componentes de la demanda (UMI reales)
  e.government = (sumBudget(c) / 100) * realGDP;
  const savingRate = clamp(0.12 + 0.12 * Math.tanh(gdppc / 12000) + 0.05 * (c.econ.confidence - 50) / 50 - 0.1 * (lp.pensionGenerosity - 0.4), 0.02, 0.45);
  e.consumption = Math.max(0, nationalIncome * (1 - savingRate) - e.government * 0.4);

  // ---------------- inversión y acumulación de capital
  const corpTax = c.taxes.corporate;
  const riskDrag = clamp(e.riskPremium * 3, 0, 0.6);
  const privateInvRate = clamp(savingRate * (0.55 + 0.6 * (e.confidence / 100)) * (1 - corpTax * 0.6) * (1 - riskDrag) * (1 - 0.6 * e.bankStress) * (1 - 0.5 * lp.priceControls), 0.01, 0.4);
  const fdiRate = lp.fdiOpenness * clamp(0.01 + 0.03 * (pol.stability / 100) * (1 - corpTax) * (e.confidence / 100) - 0.02 * c.military.warExhaustion, 0, 0.06);
  e.fdi = approach(e.fdi, fdiRate * realGDP, dt, 1);
  // las empresas estatales reinvierten su excedente (por plan) y reciben aportes del presupuesto
  let soeSurplus = 0;
  for (const s of SECTORS) soeSurplus += e.sectors[s].stateShare * SECTOR_INFO[s].alpha * e.sectors[s].output;
  const publicEnterprise = soeSurplus * 0.6 * (1 - stateInefficiency(c, lp)) + (c.budget.subsidies / 100) * realGDP * 0.3;
  const privateInv = privateInvRate * realGDP * (1 - avgStateShare(c)) + e.fdi;
  e.investment = privateInv + publicEnterprise;
  // asignación por rendimiento esperado
  const returns: Record<string, number> = {};
  let totalR = 0;
  for (const s of SECTORS) {
    const sec = e.sectors[s];
    const K = sectorCapital(inp.owned, s);
    const mpk = SECTOR_INFO[s].alpha * sec.output / Math.max(0.01, K);
    const mk = s === 'agriculture' || s === 'livestock' ? sim.state.markets.food : s === 'oil' ? sim.state.markets.oil : s === 'gas' ? sim.state.markets.gas : s === 'mining' ? sim.state.markets.minerals : null;
    const priceSignal = mk ? Math.pow(mk.price / mk.basePrice, 1.2) : 1;
    let r = Math.max(0, mpk) * priceSignal * (1 + sec.markup) * (1 - sec.priceCap * 0.45) * (1 - sec.stateShare * 0.8) * (1 + sec.subsidy);
    if (SECTOR_INFO[s].extractive && sec.output < 1e-6) r *= 0.1;
    returns[s] = r * K;
    totalR += r * K;
  }
  // inversión pública empresarial: a sectores estatales
  let stateK = 0;
  for (const s of SECTORS) stateK += sectorCapital(inp.owned, s) * e.sectors[s].stateShare;
  for (const s of SECTORS) {
    const info = SECTOR_INFO[s];
    const K = sectorCapital(inp.owned, s);
    const inv = (totalR > 0 ? privateInv * returns[s] / totalR : 0) + (stateK > 0 ? publicEnterprise * K * e.sectors[s].stateShare / stateK : 0);
    const net = (inv - info.depreciation * K) * dt;
    distributeCapital(inp.owned, s, net, c.id);
  }

  // ---------------- productividad total de factores
  const hc = c.stocks.humanCapital, infra = c.stocks.infrastructure;
  const frontierGap = clamp(1 - gdppc / 28000, 0, 1);
  const openness = 1 - lp.tradeBarriers;
  // convergencia: cuanto más lejos de la frontera, más se gana adoptando tecnología ajena (si hay apertura)
  const catchUp = 0.03 * Math.pow(frontierGap, 1.5) * (0.3 + 0.7 * openness) * (0.5 + 0.5 * lp.fdiOpenness) * (0.5 + hc);
  const tfpGrowth = 0.004 + 0.012 * (hc - 0.5) + 0.006 * (infra - 0.5) + catchUp
    - 0.005 * (pol.corruption / 100) - 0.003 * lp.regulation - 0.004 * lp.priceControls + 0.004 * (lp.judicialIndependence - 0.5) - 0.01 * c.military.warExhaustion;
  for (const s of SECTORS) e.sectors[s].tfp *= Math.exp(tfpGrowth * dt);

  // ---------------- tipo de cambio, reservas y balanza de pagos
  const toUMI = (v: number) => v; // valores reales ya en UMI de 1990
  const interestAbroad = c.fiscal.debtForeign * c.fiscal.debtRate * 0.8 / Math.max(1, sim.state.worldPriceLevel);
  const repatriation = e.fdi * 0.2 + avgForeignOwnership(c) * realGDP * 0.03;
  e.currentAccount = toUMI(e.exports - e.imports - interestAbroad - repatriation + (c.cooldowns.aidFlow ?? 0));
  const interestDiff = e.policyRate - sim.state.worldInterestRate - e.riskPremium;
  const portfolio = lp.capitalOpenness * clamp(interestDiff * 2, -0.08, 0.06) * realGDP - lp.capitalOpenness * (100 - e.confidence) / 100 * 0.02 * realGDP;
  const bop = e.currentAccount + e.fdi + portfolio + (c.cooldowns.foreignBorrowFlow ?? 0) / dt;
  c.cooldowns.foreignBorrowFlow = 0;
  const peg = lp.peg;
  const reserveFlow = bop * (0.15 + 0.85 * peg);
  e.reserves = Math.max(0, e.reserves + reserveFlow * dt);
  const pressure = (e.inflation - sim.state.worldInflation) - 0.9 * bop * (1 - peg) / Math.max(1, realGDP) + (e.reserves <= 0.02 * realGDP ? 0.6 : 0);
  let depr = (1 - peg) * pressure;
  if (peg > 0.9 && e.reserves < 0.025 * realGDP && !(c.cooldowns.devalued > sim.day - 90)) {
    // crisis cambiaria: la paridad no se puede sostener
    depr = 0.5 / dt;
    c.cooldowns.devalued = sim.day;
    c.cooldowns.confidenceShock = -25;
    e.bankStress = Math.min(1, e.bankStress + 0.3);
    sim.emit('devaluation', 'world', 'major', [c.id], `${c.name} devalúa su moneda`, `Sin reservas para defender la paridad, ${c.longName} devalúa el ${c.currency.name} un 40 %.`);
  }
  depr = clamp(depr, -0.5, 30 / Math.max(dt * 360, 1));
  e.exchangeRate *= Math.exp(depr * dt);
  c.cooldowns.depreciationRate = approach(c.cooldowns.depreciationRate ?? 0, depr, dt, 0.25);

  // ---------------- estrés bancario
  const stressTarget = clamp(0.4 * Math.max(0, -e.outputGap * 3) + 0.4 * Math.max(0, e.inflation - 0.4) + 0.3 * Math.max(0, depr * 0.5) + (c.fiscal.inDefault ? 0.4 : 0) - 0.2, 0, 1);
  e.bankStress = approach(e.bankStress, stressTarget, dt, 0.8);
  e.nominalGDP = nominalGDP(c);
  e.importPropensity = e.imports / Math.max(1, realGDP);
}

export function sumBudget(c: CountryState): number {
  let t = 0;
  for (const v of Object.values(c.budget)) t += v;
  return t;
}

export function avgStateShare(c: CountryState): number {
  let w = 0, t = 0;
  for (const s of SECTORS) { w += c.econ.sectors[s].output; t += c.econ.sectors[s].output * c.econ.sectors[s].stateShare; }
  return w > 0 ? t / w : 0;
}

function avgForeignOwnership(c: CountryState): number { return clamp(c.cooldowns.foreignOwnership ?? 0, 0, 1); }

export function sectorCapital(owned: ProvinceState[], s: SectorId): number {
  const i = SECTOR_INDEX[s];
  let k = 0;
  for (const p of owned) k += p.capital[i];
  return k;
}

/** Distribuye inversión neta (o desinversión) entre provincias según su atractivo. */
export function distributeCapital(owned: ProvinceState[], s: SectorId, amount: number, owner: string): void {
  const i = SECTOR_INDEX[s];
  if (amount === 0 || owned.length === 0) return;
  if (amount < 0) {
    let k = 0;
    for (const p of owned) k += p.capital[i];
    if (k <= 0) return;
    const f = Math.max(0, 1 + amount / k);
    for (const p of owned) p.capital[i] *= f;
    return;
  }
  let w = 0;
  const weights = owned.map((p) => {
    const ww = (p.capital[i] + 0.002) * (p.controller === owner ? 1 : 0.05) * (0.6 + 0.4 * p.infra) * (1 - p.devastation) * (1 + 0.25 * p.buildings.industrial_zone * (s === 'industry' || s === 'tech' ? 1 : 0));
    w += ww;
    return ww;
  });
  if (w <= 0) return;
  owned.forEach((p, k) => { p.capital[i] += amount * weights[k] / w; });
}
