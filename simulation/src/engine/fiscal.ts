import { SECTORS, BUDGET_CATEGORIES, type CountryState, type TaxId } from '@cyo/shared';
import { SECTOR_INFO } from '../data/sectors.js';
import { clamp, approach } from '../rng.js';
import { Sim } from './context.js';
import { nominalGDP, avgStateShare, population, stateInefficiency, techEffect } from './economy.js';

/**
 * FINANZAS PÚBLICAS (ver docs/FORMULAS.md §Fiscal).
 *
 * Cada impuesto tiene una base imponible económica, un cumplimiento que depende de la capacidad
 * administrativa y la corrupción, y una respuesta de comportamiento (evasión/elusión, fuga) que
 * crece con la tasa. Por eso subir impuestos no recauda más indefinidamente. Además las tasas
 * alimentan la informalidad, la inversión y la participación laboral en el módulo económico.
 *
 * El Tesoro respeta una identidad contable estricta (ledger):
 *   Δcaja = ingresos − gastos − intereses + endeudamiento − amortizaciones + emisión + extraordinarios + ayuda
 */

export const TAX_ELASTICITY: Record<TaxId, number> = {
  vat: 2.2, income: 2.0, corporate: 2.6, wealth: 12, import: 1.6, export: 2.0, excise: 2.0, payroll: 2.2, provincial: 3
};

export function compliance(c: CountryState): number {
  return clamp(0.45 + 0.5 * c.politics.adminCapacity / 100 - 0.25 * c.politics.corruption / 100, 0.2, 0.97);
}

export function computeRevenue(sim: Sim, c: CountryState): Record<TaxId | 'rents' | 'soe', number> {
  const e = c.econ, t = c.taxes;
  const ngdp = nominalGDP(c);
  const realGDP = Math.max(1e-6, e.realGDP);
  const comp = compliance(c);
  const informal = e.informality;
  const localPerUMI = e.exchangeRate * sim.state.worldPriceLevel;
  let labour = 0;
  for (const s of SECTORS) labour += (1 - SECTOR_INFO[s].alpha) * e.sectors[s].output;
  const labourShare = labour / realGDP;
  const C = (e.consumption / realGDP) * ngdp;
  const wageBill = labourShare * ngdp * (1 - informal);
  const profits = (1 - labourShare) * ngdp * 0.5 * (1 - avgStateShare(c));
  const behaviour = (k: TaxId) => Math.exp(-TAX_ELASTICITY[k] * t[k]);
  const commodityExports = (e.commodities.oil.exports * sim.state.markets.oil.price + e.commodities.gas.exports * sim.state.markets.gas.price +
    e.commodities.minerals.exports * sim.state.markets.minerals.price + e.commodities.coal.exports * sim.state.markets.coal.price + e.commodities.food.exports * sim.state.markets.food.price) * localPerUMI;
  // renta de recursos: el Estado capta regalías y, en sectores públicos, casi toda la renta
  let rents = 0;
  for (const s of ['oil', 'gas', 'mining'] as const) {
    const price = s === 'oil' ? sim.state.markets.oil.price : s === 'gas' ? sim.state.markets.gas.price : sim.state.markets.minerals.price;
    const value = e.sectors[s].output * price * localPerUMI * SECTOR_INFO[s].alpha;
    rents += value * (0.15 + 0.6 * e.sectors[s].stateShare) * (0.6 + 0.4 * comp);
  }
  // dividendos/excedentes de empresas públicas no extractivas
  const lp = sim.params(c);
  let soe = 0;
  for (const s of SECTORS) {
    if (SECTOR_INFO[s].extractive) continue;
    const sec = e.sectors[s];
    soe += sec.output / realGDP * ngdp * SECTOR_INFO[s].alpha * sec.stateShare * 0.25 * (1 - stateInefficiency(c, lp) * 2);
  }
  return {
    vat: t.vat * C * comp * (1 - 0.7 * informal) * behaviour('vat'),
    income: t.income * wageBill * comp * behaviour('income'),
    payroll: t.payroll * wageBill * comp * behaviour('payroll'),
    corporate: t.corporate * profits * comp * behaviour('corporate'),
    wealth: t.wealth * 3 * ngdp * 0.55 * comp * behaviour('wealth'),
    import: t.import * e.imports * localPerUMI * (0.7 + 0.3 * comp) * behaviour('import'),
    export: t.export * commodityExports * comp * behaviour('export'),
    excise: t.excise * 0.09 * C * comp * behaviour('excise'),
    provincial: t.provincial * 1.5 * ngdp * c.demography.urban * comp * behaviour('provincial'),
    rents: Math.max(0, rents),
    soe: Math.max(0, soe)
  };
}

export function totalRevenue(r: Record<string, number>): number { let s = 0; for (const v of Object.values(r)) s += v; return s; }

export function riskPremiumTarget(c: CountryState): number {
  const ngdp = Math.max(1e-6, nominalGDP(c));
  const debtRatio = (c.fiscal.debtDomestic + c.fiscal.debtForeign * c.econ.exchangeRate) / ngdp;
  const deficit = -c.fiscal.balance / ngdp;
  return clamp(0.008 + 0.06 * Math.max(0, debtRatio - 0.6) + 0.5 * Math.max(0, deficit - 0.03) + 0.06 * Math.min(1, Math.max(0, c.econ.inflation - 0.15) * 2)
    + (c.fiscal.inDefault ? 0.2 : 0) + 0.025 * Math.min(4, c.fiscal.defaultsHistory) - 0.04 * Math.min(1, c.econ.reserves / Math.max(1, c.econ.realGDP) * 4)
    + 0.04 * (1 - c.politics.stability / 100) + 0.05 * c.military.warExhaustion, 0, 0.6);
}

export function ratingFor(rp: number, inDefault: boolean): string {
  if (inDefault) return 'D';
  return rp < 0.01 ? 'AAA' : rp < 0.02 ? 'AA' : rp < 0.035 ? 'A' : rp < 0.06 ? 'BBB' : rp < 0.1 ? 'BB' : rp < 0.18 ? 'B' : 'CCC';
}

/** Puede el Estado colocar deuda nueva en el mercado. */
export function canBorrow(sim: Sim, c: CountryState): { ok: boolean; reason?: string } {
  if (c.fiscal.inDefault) return { ok: false, reason: 'El país está en default: los mercados están cerrados.' };
  if (c.econ.riskPremium > 0.25) return { ok: false, reason: 'La prima de riesgo es prohibitiva: nadie compra la deuda.' };
  const lp = sim.params(c);
  const ngdp = nominalGDP(c);
  const atWar = Object.values(sim.state.wars).some((w) => w.status === 'active' && w.participants.some((p) => p.country === c.id));
  if (lp.fiscalRule < 50 && !atWar && -c.fiscal.balance / ngdp > lp.fiscalRule / 100) return { ok: false, reason: 'La regla fiscal impide financiar un déficit superior al límite legal.' };
  return { ok: true };
}

export function interestBill(sim: Sim, c: CountryState): number {
  if (c.fiscal.inDefault) return c.fiscal.debtDomestic * c.fiscal.debtRate * 0.5;
  return c.fiscal.debtDomestic * c.fiscal.debtRate + c.fiscal.debtForeign * c.econ.exchangeRate * Math.min(c.fiscal.debtRate, sim.state.worldInterestRate + c.econ.riskPremium + 0.01);
}

export function fiscalStep(sim: Sim, c: CountryState, dt: number): void {
  const f = c.fiscal, e = c.econ;
  const lp = sim.params(c);
  const ngdp = nominalGDP(c);
  const revenue = computeRevenue(sim, c);
  f.revenue = revenue;
  const rev = totalRevenue(revenue);
  // gasto: la ley de presupuesto fija % del PIB; los atrasos lo recortan
  const cut = clamp(f.arrears / Math.max(1e-6, ngdp * 0.02), 0, 0.5);
  let spend = 0;
  for (const k of BUDGET_CATEGORIES) {
    const v = (c.budget[k] / 100) * ngdp * (1 - cut);
    f.spending[k] = v;
    spend += v;
  }
  const interest = interestBill(sim, c);
  f.interest = interest;
  f.balance = rev - spend - interest;
  const flow = f.balance * dt;
  f.treasury += flow;
  f.ledger.revenue += rev * dt;
  f.ledger.spending += spend * dt;
  f.ledger.interest += interest * dt;
  // ayuda exterior y préstamos bilaterales se registran por tratado (diplomacia)
  const buffer = 0.005 * ngdp;
  if (f.treasury < buffer) {
    const need = buffer - f.treasury;
    const monetize = lp.cbIndependence > 0.5 ? 0 : clamp(f.monetization, 0, 1);
    const printed = need * monetize;
    if (printed > 0) {
      f.treasury += printed;
      f.ledger.printed += printed;
      c.cooldowns.printedToday = (c.cooldowns.printedToday ?? 0) + printed;
    }
    const rest = need - printed;
    if (rest > 0) {
      const can = canBorrow(sim, c);
      if (can.ok) borrow(sim, c, rest);
      else {
        // impago de proveedores y recortes forzados
        f.arrears += rest;
        f.treasury += rest;
        f.ledger.extraordinary += rest;
        if (f.arrears > ngdp * 0.03 && !(c.cooldowns.arrearsNews > sim.day - 120)) {
          c.cooldowns.arrearsNews = sim.day;
          sim.emit('fiscal_crisis', 'national', 'major', [c.id], `Crisis fiscal en ${c.name}`, `${c.name} no puede financiar su déficit (${can.reason}). Se acumulan atrasos con proveedores y se recortan gastos.`);
        }
      }
    }
  } else if (f.arrears > 0) {
    const pay = Math.min(f.arrears, (f.treasury - buffer) * 0.2);
    f.arrears -= pay;
    f.treasury -= pay;
    f.ledger.extraordinary -= pay;
  }
  // prima de riesgo, tasa media y calificación
  e.riskPremium = approach(e.riskPremium, riskPremiumTarget(c), dt, 0.4);
  const marketRate = sim.state.worldInterestRate + e.riskPremium + Math.max(0, e.expectedInflation) * (f.debtDomestic / Math.max(1e-6, f.debtDomestic + f.debtForeign * e.exchangeRate));
  f.debtRate = approach(f.debtRate, marketRate, dt, 5);
  f.rating = ratingFor(e.riskPremium, f.inDefault);
  // en default, el regreso a los mercados exige reestructurar
  if (f.inDefault && f.defaultSinceDay !== null && sim.day - f.defaultSinceDay > 360 * 3 && e.riskPremium < 0.2) {
    f.inDefault = false;
    sim.emit('market_return', 'world', 'minor', [c.id], `${c.name} vuelve a los mercados`, `Tras años de default, ${c.name} recupera acceso al crédito internacional.`);
  }
}

export function borrow(sim: Sim, c: CountryState, amount: number): void {
  const f = c.fiscal, e = c.econ;
  const lp = sim.params(c);
  const foreignShare = clamp(0.15 + 0.5 * lp.capitalOpenness - 0.2 * (1 - c.politics.stability / 100), 0.05, 0.75);
  const local = amount * (1 - foreignShare);
  const foreignLocal = amount * foreignShare;
  f.debtDomestic += local;
  f.debtForeign += foreignLocal / e.exchangeRate;
  f.treasury += amount;
  f.ledger.borrowed += amount;
  // el endeudamiento externo ingresa divisas
  c.cooldowns.foreignBorrowFlow = (c.cooldowns.foreignBorrowFlow ?? 0) + foreignLocal / e.exchangeRate / Math.max(0.01, sim.state.worldPriceLevel);
}

export function repay(c: CountryState, amount: number): number {
  const f = c.fiscal;
  const pay = Math.min(amount, Math.max(0, f.treasury), f.debtDomestic + f.debtForeign * c.econ.exchangeRate);
  if (pay <= 0) return 0;
  const domPart = Math.min(f.debtDomestic, pay);
  f.debtDomestic -= domPart;
  f.debtForeign -= (pay - domPart) / c.econ.exchangeRate;
  f.treasury -= pay;
  f.ledger.repaid += pay;
  return pay;
}

/** Servicios públicos: el gasto acumula o deteriora stocks institucionales con rezagos. */
export function servicesStep(sim: Sim, c: CountryState, dt: number): void {
  const b = c.budget, st = c.stocks, lp = sim.params(c), pol = c.politics;
  const pop = population(c);
  const gdppc = c.econ.realGDP / Math.max(0.01, pop) * 1000;
  const eff = 1 - (pol.corruption / 100) * 0.4;
  const cut = clamp(c.fiscal.arrears / Math.max(1e-6, nominalGDP(c) * 0.02), 0, 0.5);
  const spend = (k: keyof typeof b) => b[k] * (1 - cut) * eff;
  st.humanCapital = approach(st.humanCapital, clamp(0.08 + 0.06 * spend('education') * (0.5 + lp.educationAccess) + 0.22 * Math.tanh(gdppc / 15000) + 0.08 * lp.universityAccess + techEffect(c, 'education'), 0.05, 1), dt, 12);
  st.health = approach(st.health, clamp(0.2 + 0.055 * spend('health') * (0.5 + lp.healthCoverage) + 0.3 * Math.tanh(gdppc / 9000) + techEffect(c, 'health') + 0.05 * lp.envProtection - 0.3 * c.econ.foodShortage, 0.05, 1), dt, 4);
  st.infrastructure = approach(st.infrastructure, clamp(0.12 + 0.16 * spend('infrastructure') + 0.15 * Math.tanh(gdppc / 12000), 0.05, 1), dt, 9);
  st.security = approach(st.security, clamp(0.15 + 0.22 * spend('security') + 0.3 * lp.policePower, 0, 1), dt, 2);
  st.justice = approach(st.justice, clamp(0.15 + 0.4 * spend('justice') + 0.3 * lp.judicialIndependence, 0, 1), dt, 4);
  st.administration = approach(st.administration, clamp(0.12 + 0.13 * spend('administration') + 0.25 * st.humanCapital + techEffect(c, 'admin'), 0, 1), dt, 4);
  st.intelligence = approach(st.intelligence, clamp(0.05 + 0.6 * spend('intelligence') + techEffect(c, 'intel'), 0, 1), dt, 2);
  // capacidad administrativa, estado de derecho y corrupción derivan de los stocks y las leyes
  pol.adminCapacity = approach(pol.adminCapacity, clamp(100 * (0.45 * st.administration + 0.35 * st.humanCapital + 0.2 * (1 - pol.corruption / 100)), 5, 98), dt, 2);
  pol.ruleOfLaw = approach(pol.ruleOfLaw, clamp(100 * (0.35 * st.justice + 0.35 * lp.judicialIndependence + 0.15 * lp.civilLiberty + 0.15 * (1 - lp.repression)), 2, 98), dt, 3);
  const corrTarget = clamp(100 * (0.55 - 0.35 * st.justice - 0.25 * lp.anticorruption - 0.15 * lp.pressFreedom - 0.1 * lp.judicialIndependence + 0.12 * (1 - Math.tanh(gdppc / 10000)) + 0.08 * (1 - lp.democracy) + 0.1 * (c.cooldowns.privatizationLeak ?? 0) / 100), 3, 95);
  pol.corruption = approach(pol.corruption, corrTarget, dt, 5);
  if (c.cooldowns.privatizationLeak) c.cooldowns.privatizationLeak *= Math.exp(-dt / 3);
  // subsidios sectoriales: agro, energía e industria
  const subs = b.subsidies / 100;
  for (const s of SECTORS) c.econ.sectors[s].subsidy = s === 'agriculture' || s === 'livestock' ? subs * 4 : s === 'energy' ? subs * 3 : s === 'industry' || s === 'defense' ? subs * 1.5 : 0;
}
