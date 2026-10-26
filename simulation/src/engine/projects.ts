import { SECTORS, type CountryState, type Project, type ProjectKind, type SectorId } from '@cyo/shared';
import { clamp } from '../rng.js';
import { Sim } from './context.js';
import { nominalGDP, avgStateShare } from './economy.js';
import { TERRAIN_INFO } from '../data/terrain.js';
import { SECTOR_INFO } from '../data/sectors.js';
import { repay } from './fiscal.js';

/**
 * PROYECTOS PÚBLICOS Y CONSTRUCTOR DE POLÍTICAS.
 * Las obras consumen fondos del Tesoro día a día y tardan meses; las privatizaciones y
 * nacionalizaciones son procesos con parámetros (método, compradores, regulación, condiciones
 * laborales, destino de los ingresos) cuyos efectos se materializan progresivamente.
 */

export const BUILD_INFO: Record<Exclude<ProjectKind, 'privatization' | 'nationalization'>, { name: string; cost: number; days: number; max: number; requiresCoast?: boolean; tech?: string }> = {
  road: { name: 'Red vial y ferroviaria', cost: 1.2, days: 360, max: 5 },
  port: { name: 'Puerto', cost: 2.5, days: 540, max: 3, requiresCoast: true },
  airport: { name: 'Aeropuerto', cost: 1.8, days: 450, max: 3 },
  power_plant: { name: 'Central eléctrica', cost: 2.2, days: 600, max: 4 },
  industrial_zone: { name: 'Polo industrial', cost: 2, days: 480, max: 3 },
  military_base: { name: 'Base militar', cost: 1.2, days: 300, max: 3 },
  fortification: { name: 'Fortificaciones', cost: 0.9, days: 240, max: 3 },
  refinery: { name: 'Refinería', cost: 2.8, days: 600, max: 2 },
  university: { name: 'Universidad e investigación', cost: 1.5, days: 720, max: 3 }
};

/** Coste en moneda local: escala con el tamaño económico de la provincia y el terreno. */
export function projectCost(sim: Sim, c: CountryState, kind: keyof typeof BUILD_INFO, provinceId: string): number {
  const info = BUILD_INFO[kind];
  const ps = sim.idx.provinces.get(provinceId)!;
  const terr = TERRAIN_INFO[ps.terrain];
  const scale = clamp(c.econ.realGDP / 400, 0.15, 3);
  return info.cost * scale * terr.buildCost * c.econ.priceLevel * c.econ.baseExchangeRate;
}

export function startBuild(sim: Sim, c: CountryState, provinceId: string, kind: keyof typeof BUILD_INFO): { ok: boolean; error?: string; project?: Project } {
  const p = sim.state.provinces[provinceId];
  const ps = sim.idx.provinces.get(provinceId);
  const info = BUILD_INFO[kind];
  if (!p || !ps || p.owner !== c.id || p.controller !== c.id) return { ok: false, error: 'Solo se construye en provincias propias bajo control.' };
  if (info.requiresCoast && !ps.coastal) return { ok: false, error: 'Requiere costa.' };
  const level = kind === 'road' ? Math.round(p.infra * 5) : p.buildings[kind];
  if (level >= info.max) return { ok: false, error: 'Nivel máximo alcanzado.' };
  if (c.projects.some((x) => x.status === 'active' && x.province === provinceId && x.kind === kind)) return { ok: false, error: 'Ya hay una obra igual en curso.' };
  if (c.projects.filter((x) => x.status === 'active').length >= 12) return { ok: false, error: 'Demasiadas obras simultáneas para la administración.' };
  const cost = projectCost(sim, c, kind, provinceId);
  const days = Math.round(info.days * (1.3 - 0.5 * c.politics.adminCapacity / 100));
  const project: Project = { id: sim.nextId('PJ'), kind, province: provinceId, startDay: sim.day, endDay: sim.day + days, totalCost: cost, paid: 0, progress: 0, status: 'active' };
  c.projects.push(project);
  return { ok: true, project };
}

export interface PrivatizationParams {
  sector: SectorId; percent: number; method: 'auction' | 'public_offering' | 'direct_sale'; buyers: 'domestic' | 'foreign_allowed' | 'workers';
  regulation: 'light' | 'regulator' | 'price_caps'; labor: 'keep_jobs' | 'flexible'; proceeds: 'debt' | 'treasury' | 'investment';
}

/** Valuación estimada (moneda local) de la participación a vender. */
export function privatizationValue(sim: Sim, c: CountryState, prm: PrivatizationParams): number {
  const sec = c.econ.sectors[prm.sector];
  let K = 0;
  for (const p of Object.values(sim.state.provinces)) if (p.owner === c.id) K += p.capital[SECTORS.indexOf(prm.sector)];
  const share = sec.stateShare * prm.percent;
  const methodF = prm.method === 'auction' ? 1 : prm.method === 'public_offering' ? 0.9 : 0.65;
  const buyersF = prm.buyers === 'foreign_allowed' ? 1.15 : prm.buyers === 'workers' ? 0.55 : 0.85 * (0.6 + 0.4 * Math.min(1, c.econ.realGDP / 300));
  const regF = prm.regulation === 'light' ? 1.15 : prm.regulation === 'regulator' ? 1 : 0.75;
  const laborF = prm.labor === 'keep_jobs' ? 0.85 : 1;
  const confF = 0.4 + 0.6 * c.econ.confidence / 100;
  return K * share * 0.7 * methodF * buyersF * regF * laborF * confF * c.econ.priceLevel * c.econ.baseExchangeRate;
}

export function startPrivatization(sim: Sim, c: CountryState, prm: PrivatizationParams): { ok: boolean; error?: string; project?: Project; estimate?: number } {
  if (!SECTORS.includes(prm.sector)) return { ok: false, error: 'Sector inválido.' };
  const sec = c.econ.sectors[prm.sector];
  if (sec.stateShare < 0.03) return { ok: false, error: 'El Estado no tiene participación relevante en ese sector.' };
  if (c.projects.some((p) => p.status === 'active' && (p.kind === 'privatization' || p.kind === 'nationalization') && p.params?.sector === prm.sector)) return { ok: false, error: 'Ya hay un proceso en curso en ese sector.' };
  if (prm.buyers === 'foreign_allowed' && sim.params(c).fdiOpenness < 0.2) return { ok: false, error: 'La ley de inversión extranjera prohíbe compradores extranjeros.' };
  const cost = 8;
  if (c.politics.politicalCapital < cost) return { ok: false, error: 'Capital político insuficiente (8).' };
  c.politics.politicalCapital -= cost;
  const value = privatizationValue(sim, c, prm);
  const days = prm.method === 'direct_sale' ? 90 : prm.method === 'auction' ? 180 : 240;
  const project: Project = {
    id: sim.nextId('PJ'), kind: 'privatization', province: null, startDay: sim.day, endDay: sim.day + Math.round(days * (1.3 - 0.5 * c.politics.adminCapacity / 100)),
    totalCost: -value, paid: 0, progress: 0, status: 'active', params: { ...prm }
  };
  c.projects.push(project);
  // reacción inmediata: anuncio
  c.cooldowns.privatizationAnger = (c.cooldowns.privatizationAnger ?? 0) + 12 * prm.percent * sec.stateShare * (prm.labor === 'keep_jobs' ? 0.5 : 1) * (prm.buyers === 'workers' ? 0.3 : 1);
  sim.emit('privatization_announced', 'national', 'minor', [c.id], `${c.name} anuncia la privatización parcial de ${SECTOR_INFO[prm.sector].name.toLowerCase()}`,
    `Se venderá el ${(prm.percent * 100).toFixed(0)} % de la participación estatal mediante ${prm.method === 'auction' ? 'subasta' : prm.method === 'public_offering' ? 'oferta pública' : 'venta directa'}.`);
  return { ok: true, project, estimate: value };
}

export function startNationalization(sim: Sim, c: CountryState, sector: SectorId, percent: number, compensation: 'full' | 'partial' | 'none'): { ok: boolean; error?: string } {
  const sec = c.econ.sectors[sector];
  if (!sec) return { ok: false, error: 'Sector inválido.' };
  if (sec.stateShare > 0.95) return { ok: false, error: 'El sector ya es estatal.' };
  if (c.politics.politicalCapital < 10) return { ok: false, error: 'Capital político insuficiente (10).' };
  let K = 0;
  for (const p of Object.values(sim.state.provinces)) if (p.owner === c.id) K += p.capital[SECTORS.indexOf(sector)];
  const take = (1 - sec.stateShare) * percent;
  const comp = compensation === 'full' ? 0.8 : compensation === 'partial' ? 0.35 : 0;
  const cost = K * take * 0.7 * comp * c.econ.priceLevel * c.econ.baseExchangeRate;
  if (cost > c.fiscal.treasury) return { ok: false, error: 'El Tesoro no puede pagar la compensación.' };
  c.politics.politicalCapital -= 10;
  c.projects.push({ id: sim.nextId('PJ'), kind: 'nationalization', province: null, startDay: sim.day, endDay: sim.day + 60, totalCost: cost, paid: 0, progress: 0, status: 'active', params: { sector, percent, compensation } });
  return { ok: true };
}

export function projectsStep(sim: Sim, c: CountryState, dt: number): void {
  for (const pj of c.projects) {
    if (pj.status !== 'active' && pj.status !== 'stalled') continue;
    const duration = Math.max(1, pj.endDay - pj.startDay);
    if (pj.kind === 'privatization') {
      pj.progress = Math.min(1, (sim.day - pj.startDay) / duration);
      if (sim.day >= pj.endDay) completePrivatization(sim, c, pj);
      continue;
    }
    if (pj.kind === 'nationalization') {
      const daily = pj.totalCost / duration;
      if (c.fiscal.treasury < daily) { pj.status = 'stalled'; continue; }
      c.fiscal.treasury -= daily;
      c.fiscal.ledger.extraordinary -= daily;
      pj.paid += daily;
      pj.status = 'active';
      pj.progress = Math.min(1, (sim.day - pj.startDay) / duration);
      if (sim.day >= pj.endDay) completeNationalization(sim, c, pj);
      continue;
    }
    const daily = pj.totalCost / duration;
    if (c.fiscal.treasury < daily * 2) { pj.status = 'stalled'; pj.endDay += 1; continue; }
    pj.status = 'active';
    c.fiscal.treasury -= daily;
    c.fiscal.ledger.extraordinary -= daily;
    pj.paid += daily;
    pj.progress = Math.min(1, pj.paid / Math.max(1e-9, pj.totalCost));
    if (pj.progress >= 0.999) completeBuild(sim, c, pj);
  }
  if (c.projects.length > 40) c.projects = c.projects.filter((p) => p.status === 'active' || p.status === 'stalled' || sim.day - p.endDay < 720).slice(-40);
  void dt;
}

function completeBuild(sim: Sim, c: CountryState, pj: Project): void {
  pj.status = 'done';
  const p = sim.state.provinces[pj.province!];
  if (!p || p.owner !== c.id) return;
  if (pj.kind === 'road') p.infra = Math.min(1, p.infra + 0.15);
  else {
    const k = pj.kind as keyof typeof p.buildings;
    p.buildings[k] += 1;
    // las obras productivas añaden capital al sector correspondiente
    const toSector: Partial<Record<string, SectorId>> = { port: 'transport', airport: 'transport', power_plant: 'energy', industrial_zone: 'industry', refinery: 'oil', university: 'tech' };
    const s = toSector[pj.kind];
    if (s) p.capital[SECTORS.indexOf(s)] += pj.totalCost / (c.econ.priceLevel * c.econ.baseExchangeRate) * 0.8;
    if (pj.kind === 'university') c.stocks.humanCapital = Math.min(1, c.stocks.humanCapital + 0.01);
  }
  const name = BUILD_INFO[pj.kind as keyof typeof BUILD_INFO].name;
  sim.emit('project_done', 'national', 'info', [c.id], `Inaugurado: ${name} en ${sim.idx.provinces.get(pj.province!)?.name}`, 'La obra entra en servicio.', { province: pj.province! });
}

function completePrivatization(sim: Sim, c: CountryState, pj: Project): void {
  const prm = pj.params as unknown as PrivatizationParams;
  pj.status = 'done';
  pj.progress = 1;
  const sec = c.econ.sectors[prm.sector];
  const value = privatizationValue(sim, c, prm);
  const sold = sec.stateShare * prm.percent;
  sec.stateShare = Math.max(0, sec.stateShare - sold);
  // destino de los ingresos
  c.fiscal.treasury += value;
  c.fiscal.ledger.extraordinary += value;
  if (prm.proceeds === 'debt') repay(c, value);
  else if (prm.proceeds === 'investment') {
    // reinversión en infraestructura: se suma al capital de transporte y energía
    const real = value / (c.econ.priceLevel * c.econ.baseExchangeRate);
    c.fiscal.treasury -= value;
    c.fiscal.ledger.extraordinary -= value;
    for (const p of Object.values(sim.state.provinces)) if (p.owner === c.id) { p.capital[SECTORS.indexOf('transport')] += real * 0.5 * p.pop / Math.max(1, c.demography.adult + c.demography.young + c.demography.old); p.infra = Math.min(1, p.infra + 0.02); }
  }
  // regulación posterior
  if (SECTOR_INFO[prm.sector].naturalMonopoly) {
    sec.markup = prm.regulation === 'light' ? 0.25 : prm.regulation === 'regulator' ? 0.08 : 0;
    sec.priceCap = prm.regulation === 'price_caps' ? 0.8 : prm.regulation === 'regulator' ? 0.3 : 0;
  } else sec.markup = prm.regulation === 'light' ? 0.05 : 0;
  if (prm.buyers === 'foreign_allowed') c.cooldowns.foreignOwnership = (c.cooldowns.foreignOwnership ?? 0) + sold * (c.econ.sectors[prm.sector].output / Math.max(1, c.econ.realGDP));
  // condiciones laborales: despidos y productividad
  if (prm.labor === 'flexible') {
    const fired = sec.labor * sold * 0.2;
    sec.labor -= fired;
    sec.tfp *= 1 + 0.08 * sold;
    c.econ.unemployment = Math.min(0.6, c.econ.unemployment + fired / Math.max(1, c.econ.laborForce));
  } else sec.tfp *= 1 + 0.03 * sold;
  // riesgo regulatorio: con baja capacidad administrativa, la venta puede ser capturada
  if (c.politics.adminCapacity < 45 && (prm.method === 'direct_sale' || prm.regulation === 'light') && sim.rng.chance(0.5)) {
    c.cooldowns.privatizationLeak = (c.cooldowns.privatizationLeak ?? 0) + 25;
    sim.emit('privatization_scandal', 'national', 'major', [c.id], `Denuncias de corrupción en la privatización de ${SECTOR_INFO[prm.sector].name.toLowerCase()}`, 'La prensa revela favoritismo en la adjudicación.');
  }
  c.cooldowns.privatizationAnger = (c.cooldowns.privatizationAnger ?? 0) + 8 * sold * (prm.labor === 'flexible' ? 1.5 : 0.6);
  c.econ.confidence = Math.min(100, c.econ.confidence + 6 * sold);
  sim.emit('privatization_done', 'world', 'minor', [c.id], `${c.name} completa la privatización de ${SECTOR_INFO[prm.sector].name.toLowerCase()}`,
    `Ingresos: ${value.toFixed(2)} mil millones de ${c.currency.name}. Participación estatal restante: ${(sec.stateShare * 100).toFixed(0)} %.`);
}

function completeNationalization(sim: Sim, c: CountryState, pj: Project): void {
  const prm = pj.params as { sector: SectorId; percent: number; compensation: string };
  pj.status = 'done';
  const sec = c.econ.sectors[prm.sector];
  const take = (1 - sec.stateShare) * Number(prm.percent);
  sec.stateShare = Math.min(0.99, sec.stateShare + take);
  sec.markup = 0;
  // expropiación sin compensación: confianza y relaciones con inversores extranjeros
  const penalty = prm.compensation === 'none' ? 25 : prm.compensation === 'partial' ? 10 : 3;
  c.cooldowns.confidenceShock = (c.cooldowns.confidenceShock ?? 0) - penalty;
  if ((c.cooldowns.foreignOwnership ?? 0) > 0 && prm.compensation !== 'full') {
    for (const o of sim.aliveCountries()) if (o.id !== c.id && sim.params(o).fdiOpenness > 0.6) { const r = sim.state.relations[[c.id, o.id].sort().join('|')]; if (r) r.opinion -= penalty / 3; }
    c.cooldowns.foreignOwnership = Math.max(0, (c.cooldowns.foreignOwnership ?? 0) - take * 0.3);
  }
  c.groups.workers.sat += 4 * take;
  c.groups.business.sat -= penalty * take;
  sim.emit('nationalization', 'world', 'major', [c.id], `${c.name} nacionaliza ${SECTOR_INFO[prm.sector].name.toLowerCase()}`, `El Estado controla ahora el ${(sec.stateShare * 100).toFixed(0)} % del sector.`);
  void avgStateShare; void nominalGDP;
}
