import type { CountryState, Unit, UnitType, War, Battle, ProvinceState, CountryId, ProvinceLink } from '@cyo/shared';
import { UNIT_INFO, EQUIPMENT_COST } from '../data/units.js';
import { TERRAIN_INFO } from '../data/terrain.js';
import { clamp, approach } from '../rng.js';
import { Sim, relation, atWar, hasTreaty, warBetween } from './context.js';
import { nominalGDP, techEffect, population } from './economy.js';

/**
 * SISTEMA MILITAR.
 * Las órdenes se ejecutan día a día: las unidades recorren el grafo de provincias (o de zonas
 * marítimas) con tiempos que dependen de la distancia, el terreno, los ríos, la infraestructura y
 * el tipo de unidad. El combate se resuelve por rondas diarias reproducibles a partir de la fuerza
 * efectiva (personal, equipo, organización, moral, entrenamiento, experiencia, abastecimiento,
 * tecnología, terreno, atrincheramiento, apoyo aéreo y naval, reconocimiento).
 */

export const BASE_SPEED = 1.25; // unidades de hex por día para infantería a pie

export function isHostile(sim: Sim, a: CountryId, b: CountryId): boolean { return a !== b && atWar(sim.state, a, b); }

/** Guerra activa (no pendiente, no congelada) entre a y b. */
export function activeWarBetween(sim: Sim, a: CountryId, b: CountryId): War | null {
  const w = warBetween(sim.state, a, b);
  return w && w.status === 'active' ? w : null;
}

export function allies(sim: Sim, a: CountryId, b: CountryId): boolean {
  if (a === b) return true;
  for (const w of Object.values(sim.state.wars)) {
    if (w.status === 'ended') continue;
    const pa = w.participants.find((p) => p.country === a), pb = w.participants.find((p) => p.country === b);
    if (pa && pb && pa.side === pb.side) return true;
  }
  return hasTreaty(sim.state, a, b, 'military_access') || hasTreaty(sim.state, a, b, 'military_alliance');
}

/** ¿Puede una unidad de `owner` entrar en la provincia? */
export function canEnter(sim: Sim, owner: CountryId, provinceId: string): 'yes' | 'attack' | 'no' {
  const p = sim.state.provinces[provinceId];
  if (!p) return 'no';
  if (p.controller === owner) return 'yes';
  if (allies(sim, owner, p.controller)) return 'yes';
  if (isHostile(sim, owner, p.controller)) return 'attack';
  return 'no';
}

export function edgeCost(sim: Sim, from: string, link: ProvinceLink, unitType: UnitType): number {
  const to = sim.idx.provinces.get(link.to)!;
  const info = UNIT_INFO[unitType];
  const terr = TERRAIN_INFO[to.terrain];
  const dist = sim.idx.dist(from, link.to);
  const p = sim.state.provinces[link.to];
  const armored = info.armor > 0.3;
  let mult = terr.move * (1 + to.roughness * 0.6) * (armored ? 1 + terr.armorPenalty * 0.5 : 1);
  if (link.kind === 'river') mult *= 1.4;
  if (link.kind === 'strait') mult *= 3;
  mult /= 0.6 + 0.5 * (p?.infra ?? 0.5);
  return dist * mult;
}

/** Ruta más corta para una unidad terrestre (Dijkstra sobre provincias). */
export function findLandPath(sim: Sim, unit: Unit, target: string, allowAttack = true): string[] | null {
  const start = unit.location;
  if (start === target) return [];
  const dist = new Map<string, number>([[start, 0]]);
  const prev = new Map<string, string>();
  const open: [number, string][] = [[0, start]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [d, cur] = open.shift()!;
    if (cur === target) break;
    if (d > (dist.get(cur) ?? Infinity)) continue;
    const st = sim.idx.provinces.get(cur);
    if (!st) continue;
    // no se atraviesa territorio enemigo: solo se puede atacar la provincia de destino o adyacente
    const access = canEnter(sim, unit.owner, cur);
    if (cur !== start && access === 'attack') continue;
    for (const link of st.neighbors) {
      const acc = canEnter(sim, unit.owner, link.to);
      if (acc === 'no') continue;
      if (acc === 'attack' && !allowAttack) continue;
      if (link.kind === 'strait' && enemyNavalControl(sim, unit.owner, cur, link.to)) continue;
      const nd = d + edgeCost(sim, cur, link, unit.type);
      if (nd < (dist.get(link.to) ?? Infinity)) { dist.set(link.to, nd); prev.set(link.to, cur); open.push([nd, link.to]); }
    }
  }
  if (!prev.has(target)) return null;
  const path: string[] = [];
  for (let n = target; n !== start; n = prev.get(n)!) path.unshift(n);
  return path;
}

export function findSeaPath(sim: Sim, from: string, target: string): string[] | null {
  if (from === target) return [];
  const prev = new Map<string, string>();
  const seen = new Set([from]);
  const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    const z = sim.idx.seaZones.get(cur);
    if (!z) continue;
    for (const n of z.neighbors) {
      if (seen.has(n)) continue;
      seen.add(n);
      prev.set(n, cur);
      if (n === target) { const path: string[] = []; for (let k = n; k !== from; k = prev.get(k)!) path.unshift(k); return path; }
      q.push(n);
    }
  }
  return null;
}

/** Un estrecho está cerrado si un enemigo domina el mar adyacente. */
export function enemyNavalControl(sim: Sim, owner: CountryId, a: string, b: string): boolean {
  const pa = sim.idx.provinces.get(a), pb = sim.idx.provinces.get(b);
  if (!pa || !pb) return false;
  const zones = pa.seaZones.filter((z) => pb.seaZones.includes(z));
  for (const z of zones) {
    const [own, enemy] = navalPower(sim, owner, z);
    if (enemy > own * 1.2 && enemy > 0) return true;
  }
  return false;
}

export function navalPower(sim: Sim, owner: CountryId, zone: string): [number, number] {
  let own = 0, enemy = 0;
  for (const u of Object.values(sim.state.units)) {
    if (u.domain !== 'sea' || u.location !== zone || u.status === 'training') continue;
    const p = UNIT_INFO[u.type].naval * u.strength * (0.4 + 0.6 * u.organization) * (0.5 + 0.5 * u.equipment);
    if (u.owner === owner || allies(sim, owner, u.owner)) own += p; else if (isHostile(sim, owner, u.owner)) enemy += p;
  }
  return [own, enemy];
}

// ---------------------------------------------------------------------------
// Creación de unidades
// ---------------------------------------------------------------------------

export function unitCostLocal(c: CountryState, type: UnitType): number {
  return UNIT_INFO[type].cost * c.econ.priceLevel * c.econ.baseExchangeRate;
}

export function checkRecruit(sim: Sim, c: CountryState, type: UnitType, provinceId: string): { ok: boolean; error?: string; seaZone?: string } {
  const info = UNIT_INFO[type];
  const p = sim.state.provinces[provinceId];
  const ps = sim.idx.provinces.get(provinceId);
  if (!p || !ps) return { ok: false, error: 'Provincia inexistente.' };
  if (p.owner !== c.id || p.controller !== c.id) return { ok: false, error: 'Solo se puede reclutar en provincias propias bajo control.' };
  if (info.requires && !c.tech.known.includes(info.requires)) return { ok: false, error: 'Falta la tecnología requerida.' };
  if (c.military.manpower < info.manpower / 1000) return { ok: false, error: 'No hay reclutas disponibles (amplíe el servicio militar).' };
  for (const k of ['arms', 'vehicles', 'aircraft', 'ships'] as const) {
    if (c.military.equipment[k] + 1e-9 < info.equipment[k]) return { ok: false, error: `Equipo insuficiente (${k}). La industria militar debe producirlo antes.` };
  }
  const cost = unitCostLocal(c, type);
  if (c.fiscal.treasury < cost) return { ok: false, error: 'Fondos insuficientes en el Tesoro.' };
  let seaZone: string | undefined;
  if (info.domain === 'sea') {
    if (!ps.coastal || p.buildings.port < 1) return { ok: false, error: 'Las unidades navales requieren un puerto.' };
    seaZone = ps.seaZones[0];
  }
  if (info.domain === 'air' && p.buildings.airport < 1) return { ok: false, error: 'Las unidades aéreas requieren un aeropuerto.' };
  return { ok: true, seaZone };
}

export function createUnit(sim: Sim, c: CountryState, type: UnitType, location: string, ready: boolean, name?: string): Unit {
  const info = UNIT_INFO[type];
  const count = Object.values(sim.state.units).filter((u) => u.owner === c.id && u.type === type).length + 1;
  const unit: Unit = {
    id: sim.nextId('U'), owner: c.id, type, domain: info.domain, name: name ?? `${count}.ª ${info.name}`, location,
    strength: 1, equipment: 1, training: ready ? 0.75 : 0.15, experience: ready ? 0.1 : 0, morale: 0.75, organization: ready ? 0.9 : 0.4,
    supply: 1, fuel: 1, entrenchment: 0, status: ready ? 'ready' : 'training', readyDay: ready ? sim.day : sim.day + info.trainingDays,
    order: null, path: [], progress: 0, battleId: null, carrier: null, createdDay: sim.day, tech: 1 + techEffect(c, info.domain === 'air' ? 'air' : info.domain === 'sea' ? 'naval' : 'military'), fatigue: 0
  };
  sim.state.units[unit.id] = unit;
  sim.invalidateCaches();
  return unit;
}

export function recruit(sim: Sim, c: CountryState, type: UnitType, provinceId: string): { ok: boolean; error?: string; unit?: Unit } {
  const chk = checkRecruit(sim, c, type, provinceId);
  if (!chk.ok) return { ok: false, error: chk.error };
  const info = UNIT_INFO[type];
  for (const k of ['arms', 'vehicles', 'aircraft', 'ships'] as const) c.military.equipment[k] -= info.equipment[k];
  c.military.manpower -= info.manpower / 1000;
  const cost = unitCostLocal(c, type);
  c.fiscal.treasury -= cost;
  c.fiscal.ledger.extraordinary -= cost;
  const unit = createUnit(sim, c, type, chk.seaZone ?? provinceId, false);
  return { ok: true, unit };
}

// ---------------------------------------------------------------------------
// Paso diario: logística, producción, entrenamiento
// ---------------------------------------------------------------------------

export function upkeepLocal(sim: Sim, c: CountryState): number {
  let up = 0;
  for (const u of sim.unitsOf(c.id)) up += UNIT_INFO[u.type].upkeep * (u.status === 'training' ? 0.7 : 1);
  return up * c.econ.priceLevel * c.econ.baseExchangeRate;
}

export function militaryEconomyStep(sim: Sim, c: CountryState, dt: number): void {
  const m = c.military, lp = sim.params(c);
  const ngdp = nominalGDP(c);
  const budget = c.budget.defense / 100 * ngdp * (1 - clamp(c.fiscal.arrears / Math.max(1e-6, ngdp * 0.02), 0, 0.5));
  const upkeep = upkeepLocal(sim, c);
  const readiness = upkeep > 0 ? clamp(budget / upkeep, 0, 1.5) : 1.5;
  c.cooldowns.readiness = readiness;
  // producción de equipo con el remanente del presupuesto, limitada por la capacidad industrial
  const toReal = 1 / (c.econ.priceLevel * c.econ.baseExchangeRate);
  const procurement = Math.max(0, budget - upkeep) * toReal * 0.85;
  const capacity = c.econ.sectors.defense.output * 0.9 + c.econ.sectors.industry.output * 0.03;
  const rel = c.cooldowns.sanctionedBy ?? 0;
  const importable = Math.max(0, procurement - capacity) * (rel > 6 ? 0.2 : 0.6) / 1.3;
  const spend = Math.min(procurement, capacity) + importable;
  const prodShares = m.production;
  const total = prodShares.arms + prodShares.vehicles + prodShares.aircraft + prodShares.ships || 1;
  for (const k of ['arms', 'vehicles', 'aircraft', 'ships'] as const) {
    if (k === 'ships' && !sim.ownedProvinces(c.id).some((p) => p.buildings.port > 0)) continue;
    m.equipment[k] += spend * (prodShares[k] / total) / EQUIPMENT_COST[k] * dt;
  }
  // reservas de reclutas: cohorte anual según la ley de servicio militar
  const pool = c.demography.adult * lp.conscription;
  m.manpower = approach(m.manpower, pool, dt, 1.5);
  // calidad de mando: experiencia, educación, doctrina
  m.commandQuality = approach(m.commandQuality, clamp(0.35 + 0.35 * c.stocks.humanCapital + 0.2 * (c.politics.adminCapacity / 100) - 0.15 * (c.politics.corruption / 100), 0.1, 1), dt, 5);
  // cansancio de guerra: se disipa en paz
  const atWarNow = Object.values(sim.state.wars).some((w) => w.status === 'active' && w.participants.some((p) => p.country === c.id));
  if (!atWarNow) m.warExhaustion = approach(m.warExhaustion, 0, dt, 1.5);
  m.personnel = 0;
  for (const u of sim.unitsOf(c.id)) m.personnel += UNIT_INFO[u.type].manpower * u.strength;
}

/** Abastecimiento: BFS desde fuentes (capital, bases, puertos) por territorio propio o aliado. */
export function supplyStep(sim: Sim, dt: number): void {
  const st = sim.state;
  const byOwner = new Map<string, Unit[]>();
  for (const u of Object.values(st.units)) { const l = byOwner.get(u.owner) ?? []; l.push(u); byOwner.set(u.owner, l); }
  for (const [owner, units] of byOwner) {
    const c = st.countries[owner];
    if (!c) continue;
    const readiness = clamp(c.cooldowns.readiness ?? 1, 0, 1);
    const logistics = 1 + techEffect(c, 'logistics');
    const supplyAt = new Map<string, number>();
    const queue: [string, number][] = [];
    for (const p of Object.values(st.provinces)) {
      if (p.controller !== owner) continue;
      let src = 0;
      if (p.id === c.capital) src = 3;
      if (p.buildings.military_base > 0) src = Math.max(src, 1.5 + p.buildings.military_base * 0.5);
      if (p.buildings.port > 0 && p.owner === owner) src = Math.max(src, 1.2 * sim.blockadeFactorOf(owner));
      if (src > 0) { supplyAt.set(p.id, src * logistics); queue.push([p.id, src * logistics]); }
    }
    queue.sort((a, b) => b[1] - a[1]);
    while (queue.length) {
      const [pid, val] = queue.shift()!;
      if ((supplyAt.get(pid) ?? 0) > val) continue;
      const ps = sim.idx.provinces.get(pid);
      if (!ps) continue;
      for (const link of ps.neighbors) {
        const np = st.provinces[link.to];
        if (!np || !(np.controller === owner || allies(sim, owner, np.controller))) continue;
        const decay = 0.78 * (0.6 + 0.4 * np.infra) * (link.kind === 'strait' ? 0.6 : 1) * (1 - 0.5 * (sim.interdiction.get(link.to + '|' + owner) ?? 0));
        const nv = val * decay;
        if (nv > (supplyAt.get(link.to) ?? 0) + 0.02) { supplyAt.set(link.to, nv); queue.push([link.to, nv]); }
      }
    }
    // demanda por provincia
    const demand = new Map<string, number>();
    for (const u of units) if (u.domain === 'land') demand.set(u.location, (demand.get(u.location) ?? 0) + UNIT_INFO[u.type].supplyUse);
    for (const u of units) {
      const info = UNIT_INFO[u.type];
      let target: number;
      if (u.domain === 'land') {
        const avail = supplyAt.get(u.location) ?? 0;
        // un territorio enemigo recién tomado se abastece desde la provincia vecina propia
        const d = demand.get(u.location) ?? 1;
        target = clamp(avail * 2.2 / Math.max(0.6, d * 0.5), 0, 1);
      } else if (u.domain === 'air') {
        target = clamp((supplyAt.get(u.location) ?? 0) * 1.5, 0, 1);
      } else {
        const zone = sim.idx.seaZones.get(u.location);
        const nearPort = zone?.provinces.some((pid) => { const p = st.provinces[pid]; return p && p.controller === owner && p.buildings.port > 0; }) ?? false;
        target = nearPort ? 1 : 0.55;
      }
      target *= 0.4 + 0.6 * readiness;
      u.supply = approach(u.supply, target, dt, u.supply > target ? 0.05 : 0.03);
      u.fuel = approach(u.fuel, target, dt, 0.04);
      // mantenimiento insuficiente: el equipo se degrada
      if (readiness < 0.9) u.equipment = Math.max(0.2, u.equipment - (0.9 - readiness) * 0.25 * dt);
      // reposición de bajas y equipo desde las reservas nacionales
      if (u.status !== 'combat' && u.supply > 0.6) {
        const needS = 1 - u.strength, needE = 1 - u.equipment;
        if (needS > 0.01 && c.military.manpower > 0) {
          const add = Math.min(needS, 0.05 * 360 * dt / 30, c.military.manpower / (info.manpower / 1000));
          u.strength += add;
          c.military.manpower -= add * info.manpower / 1000;
        }
        if (needE > 0.01) {
          let frac = Math.min(needE, 0.04 * 360 * dt / 30);
          for (const k of ['arms', 'vehicles', 'aircraft', 'ships'] as const) if (info.equipment[k] > 0) frac = Math.min(frac, c.military.equipment[k] / info.equipment[k]);
          if (frac > 0) {
            for (const k of ['arms', 'vehicles', 'aircraft', 'ships'] as const) c.military.equipment[k] -= info.equipment[k] * frac;
            u.equipment += frac;
          }
        }
      }
      // organización y moral se recuperan con suministros
      if (u.status !== 'combat') {
        u.organization = approach(u.organization, clamp(0.35 + 0.65 * u.supply, 0, 1) * (0.7 + 0.3 * u.training), dt, 0.05);
        u.fatigue = approach(u.fatigue, 0, dt, 0.04);
      }
      const nationalMood = 0.45 + 0.4 * (c.politics.stability / 100) - 0.3 * c.military.warExhaustion;
      u.morale = approach(u.morale, clamp(nationalMood + 0.2 * u.supply, 0.1, 1), dt, 0.1);
      // entrenamiento
      if (u.status === 'training') {
        u.training = Math.min(1, u.training + dt * 360 / info.trainingDays * 0.85);
        if (sim.day >= u.readyDay) { u.status = 'ready'; u.training = Math.max(u.training, 0.75); }
      } else u.training = approach(u.training, 0.95, dt, 4);
      // atrincheramiento si está quieta en una provincia
      if (u.domain === 'land') u.entrenchment = u.status === 'ready' && !u.path.length ? approach(u.entrenchment, 1, dt, 0.08) : approach(u.entrenchment, 0, dt, 0.01);
    }
  }
}

// ---------------------------------------------------------------------------
// Movimiento
// ---------------------------------------------------------------------------

export function unitSpeed(sim: Sim, u: Unit): number {
  const info = UNIT_INFO[u.type];
  return BASE_SPEED * info.speed * (0.4 + 0.6 * u.fuel) * (0.6 + 0.4 * u.organization) * (u.domain === 'sea' ? 2 : 1);
}

export function movementStep(sim: Sim, dt: number): void {
  const st = sim.state;
  const units = Object.values(st.units).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const u of units) {
    if (!u.path.length || u.status === 'training' || u.status === 'combat' || u.status === 'frozen') {
      if (u.status === 'frozen' && !isFrozenFor(sim, u)) u.status = u.path.length ? 'moving' : 'ready';
      continue;
    }
    const next = u.path[0];
    if (u.domain === 'land') {
      const access = canEnter(sim, u.owner, next);
      if (access === 'no') { u.path = []; u.status = 'ready'; u.order = null; continue; }
      if (access === 'attack') {
        const enemy = st.provinces[next].controller;
        const war = warBetween(st, u.owner, enemy);
        if (!war || war.status !== 'active') { u.status = 'frozen'; continue; }
        if (!humansMayLoseTerritory(sim, enemy, war)) { u.status = 'frozen'; continue; }
        const defenders = Object.values(st.units).filter((d) => d.location === next && d.domain === 'land' && isHostile(sim, u.owner, d.owner));
        if (defenders.length) { startOrJoinBattle(sim, war, u, next, defenders); continue; }
      }
      const ps = sim.idx.provinces.get(u.location);
      const link = ps?.neighbors.find((l) => l.to === next);
      if (!link) { u.path = []; u.status = 'ready'; continue; }
      const cost = edgeCost(sim, u.location, link, u.type);
      u.status = 'moving';
      u.progress += unitSpeed(sim, u) * dt * 360 / Math.max(0.5, cost);
      u.fatigue = Math.min(1, u.fatigue + 0.01);
      if (u.progress >= 1) {
        u.progress = 0;
        u.location = next;
        u.path.shift();
        u.entrenchment = 0;
        if (access === 'attack') captureProvince(sim, next, u.owner);
        if (!u.path.length) { u.status = 'ready'; if (u.order && u.order.kind !== 'defend') u.order = null; }
      }
    } else if (u.domain === 'sea') {
      const cost = sim.idx.dist(u.location, next);
      u.status = 'moving';
      u.progress += unitSpeed(sim, u) * dt * 360 / Math.max(1, cost);
      if (u.progress >= 1) {
        u.progress = 0;
        u.location = next;
        u.path.shift();
        // tropas embarcadas viajan con la flota
        for (const l of Object.values(st.units)) if (l.carrier === u.id) l.location = next;
        if (!u.path.length) u.status = 'ready';
      }
    } else {
      // rebase aéreo: un día
      u.location = next;
      u.path = [];
      u.status = 'ready';
    }
  }
}

function isFrozenFor(sim: Sim, u: Unit): boolean {
  if (!u.path.length) return false;
  const next = sim.state.provinces[u.path[0]];
  if (!next || u.domain !== 'land') return false;
  const war = warBetween(sim.state, u.owner, next.controller);
  return !!war && (war.status !== 'active' || !humansMayLoseTerritory(sim, next.controller, war));
}

/**
 * Regla de guerra sincronizada: no se puede ocupar territorio de un país humano
 * cuyo jugador no está conectado (aunque la guerra esté activa por reconexión pendiente).
 */
export function humansMayLoseTerritory(sim: Sim, defender: CountryId, war: War): boolean {
  if (war.status !== 'active') return false;
  if (!sim.isHuman(defender)) return true;
  return sim.isOnline(defender);
}

export function captureProvince(sim: Sim, provinceId: string, by: CountryId): void {
  const p = sim.state.provinces[provinceId];
  const prevController = p.controller;
  if (prevController === by) return;
  // liberación: si el ocupante pierde la provincia y el dueño legítimo es aliado del captor, vuelve a su dueño
  const newController = p.owner !== by && allies(sim, by, p.owner) && !isHostile(sim, by, p.owner) ? p.owner : by;
  p.controller = newController;
  p.occupiedSince = newController === p.owner ? null : sim.day;
  p.devastation = Math.min(1, p.devastation + 0.08);
  p.unrest = Math.min(1, p.unrest + 0.2);
  // refugiados: parte de la población huye
  const fled = p.pop * 0.03;
  p.pop -= fled;
  const owner = sim.state.countries[p.owner];
  if (owner) { owner.demography.adult = Math.max(0.001, owner.demography.adult - fled * 0.6); owner.demography.young = Math.max(0.001, owner.demography.young - fled * 0.4); }
  const ps = sim.idx.provinces.get(provinceId)!;
  const capturer = sim.state.countries[by];
  const prev = sim.state.countries[prevController];
  const isCapital = Object.values(sim.state.countries).some((c) => c.capital === provinceId && c.alive);
  if (owner && isCapital && owner.capital === provinceId && newController !== owner.id) owner.military.warExhaustion = Math.min(1, owner.military.warExhaustion + 0.25);
  sim.emit('province_captured', 'world', isCapital ? 'critical' : 'minor', [by, prevController], newController === p.owner ? `${capturer?.name} libera ${ps.name}` : `${capturer?.name} toma ${ps.name}`,
    `Las fuerzas de ${capturer?.name} ${newController === p.owner ? 'liberan' : 'ocupan'} ${ps.name} (${ps.cityName}), hasta ahora controlada por ${prev?.name}.`, { province: provinceId });
}

// ---------------------------------------------------------------------------
// Combate
// ---------------------------------------------------------------------------

export function startOrJoinBattle(sim: Sim, war: War, attacker: Unit, province: string, defenders: Unit[]): void {
  const st = sim.state;
  let battle = Object.values(st.battles).find((b) => b.province === province && b.status === 'active' && b.attacker === attacker.owner);
  if (!battle) {
    battle = {
      id: sim.nextId('BT'), warId: war.id, province, attacker: attacker.owner, defender: defenders[0].owner,
      attackers: [], defenders: defenders.map((d) => d.id), startDay: sim.day, lastDay: sim.day, casualtiesAttacker: 0, casualtiesDefender: 0,
      log: [], status: 'active', amphibious: false
    };
    st.battles[battle.id] = battle;
    const ps = sim.idx.provinces.get(province);
    sim.emit('battle_start', 'world', 'minor', [attacker.owner, defenders[0].owner], `Batalla de ${ps?.name}`,
      `${st.countries[attacker.owner]?.name} ataca ${ps?.name}, defendida por ${st.countries[defenders[0].owner]?.name}.`, { province });
  }
  if (!battle.attackers.includes(attacker.id)) battle.attackers.push(attacker.id);
  for (const d of defenders) if (!battle.defenders.includes(d.id)) { battle.defenders.push(d.id); d.battleId = battle.id; d.status = 'combat'; }
  attacker.battleId = battle.id;
  attacker.status = 'combat';
}

export function airPower(sim: Sim, side: CountryId, province: string): { air: number; ground: number } {
  let air = 0, ground = 0;
  const ps = sim.idx.provinces.get(province);
  if (!ps) return { air, ground };
  for (const u of Object.values(sim.state.units)) {
    if (u.status === 'training') continue;
    const info = UNIT_INFO[u.type];
    if (info.air <= 0 && info.domain !== 'air') continue;
    if (!(u.owner === side || allies(sim, side, u.owner))) continue;
    const base = sim.idx.provinces.get(u.location) ?? sim.idx.seaZones.get(u.location);
    if (!base) continue;
    const dist = Math.hypot(base.cx - ps.cx, base.cy - ps.cy);
    if (dist > info.range * 6 + 4) continue;
    const eff = u.strength * u.equipment * (0.4 + 0.6 * u.organization) * (0.5 + 0.5 * u.supply) * u.tech;
    const mission = u.order?.kind;
    air += info.air * eff * (mission === 'air_superiority' ? 1.3 : 0.7);
    if (info.domain === 'air' || u.type === 'carrier_group') ground += info.attack * eff * (mission === 'ground_support' ? 1.4 : 0.5);
  }
  return { air, ground };
}

function landPower(sim: Sim, u: Unit, role: 'attack' | 'defense', province: string): number {
  const info = UNIT_INFO[u.type];
  const c = sim.state.countries[u.owner];
  const ps = sim.idx.provinces.get(province)!;
  const terr = TERRAIN_INFO[ps.terrain];
  const doctrine = c?.military.doctrine === 'offensive' ? (role === 'attack' ? 1.1 : 0.95) : c?.military.doctrine === 'defensive' ? (role === 'defense' ? 1.12 : 0.92) : 1;
  const armorPen = 1 - terr.armorPenalty * info.armor * 0.8 - ps.roughness * info.armor * 0.3;
  const base = role === 'attack' ? info.attack : info.defense;
  return base * u.strength * (0.3 + 0.7 * u.equipment) * (0.35 + 0.65 * u.organization) * (0.55 + 0.45 * u.morale) * (0.5 + 0.5 * u.training)
    * (1 + 0.5 * u.experience) * (0.25 + 0.75 * u.supply) * (1 - 0.4 * u.fatigue) * u.tech * doctrine * Math.max(0.3, armorPen) * (0.7 + 0.6 * (c?.military.commandQuality ?? 0.5));
}

export function combatStep(sim: Sim, dt: number): void {
  const st = sim.state;
  for (const b of Object.values(st.battles).sort((x, y) => (x.id < y.id ? -1 : 1))) {
    if (b.status !== 'active' && b.status !== 'frozen') continue;
    const war = st.wars[b.warId];
    if (!war || war.status === 'ended' || war.status === 'ceasefire') { endBattle(sim, b, 'ended'); continue; }
    if (war.status !== 'active' || !humansMayLoseTerritory(sim, b.defender, war) || (sim.isHuman(b.attacker) && !sim.isOnline(b.attacker))) {
      b.status = 'frozen';
      continue;
    }
    b.status = 'active';
    const att = b.attackers.map((id) => st.units[id]).filter((u): u is Unit => !!u && u.strength > 0.02);
    const def = Object.values(st.units).filter((u) => u.location === b.province && u.domain === 'land' && isHostile(sim, b.attacker, u.owner));
    for (const d of def) { d.battleId = b.id; d.status = 'combat'; if (!b.defenders.includes(d.id)) b.defenders.push(d.id); }
    if (!att.length) { endBattle(sim, b, 'defender_won'); continue; }
    if (!def.length) { attackerWins(sim, b, att); continue; }
    const ps = sim.idx.provinces.get(b.province)!;
    const prov = st.provinces[b.province];
    const terr = TERRAIN_INFO[ps.terrain];
    // ¿se cruza un río para atacar?
    let riverCross = 0;
    for (const a of att) { const link = sim.idx.provinces.get(a.location)?.neighbors.find((l) => l.to === b.province); if (link?.kind === 'river') riverCross = 0.3; if (link?.kind === 'strait') riverCross = 0.5; }
    const urban = Object.values(st.countries).some((c) => c.capital === b.province) ? 0.25 : prov.urban > 0.6 ? 0.15 : 0;
    let A = 0, D = 0;
    for (const a of att) A += landPower(sim, a, 'attack', b.province);
    let entr = 0;
    for (const d of def) { D += landPower(sim, d, 'defense', b.province); entr += d.entrenchment; }
    entr /= def.length;
    const defBonus = 1 + terr.defense + ps.roughness * 0.3 + riverCross + entr * 0.45 + prov.buildings.fortification * 0.15 + urban + (b.amphibious ? 0.6 : 0);
    D *= defBonus;
    // aire: superioridad y apoyo cercano
    const airA = airPower(sim, b.attacker, b.province), airD = airPower(sim, b.defender, b.province);
    const supA = airA.air + airD.air > 0 ? airA.air / (airA.air + airD.air) : 0.5;
    A += airA.ground * supA * 0.8;
    D += airD.ground * (1 - supA) * 0.8;
    // reconocimiento e inteligencia
    const ca = st.countries[b.attacker], cd = st.countries[b.defender];
    const recon = (c: CountryState | undefined, units: Unit[]) => (c ? c.stocks.intelligence * 0.1 + techEffect(c, 'intel') : 0) + units.filter((u) => u.type === 'special_forces').length * 0.04;
    A *= 1 + recon(ca, att) - recon(cd, def) * 0.5;
    // apoyo naval en provincias costeras
    for (const z of ps.seaZones) {
      const [own, enemy] = navalPower(sim, b.attacker, z);
      if (own > enemy * 1.5 && own > 0) A *= 1.08; else if (enemy > own * 1.5 && enemy > 0) D *= 1.08;
    }
    const ratio = clamp(A / Math.max(1e-6, D), 0.05, 20);
    const noise = () => 0.85 + 0.3 * sim.rng.next();
    const defLoss = 0.012 * Math.pow(ratio, 0.75) * noise();
    const attLoss = 0.011 * Math.pow(1 / ratio, 0.75) * noise() * (b.amphibious ? 1.5 : 1);
    let casA = 0, casD = 0;
    for (const a of att) {
      const l = Math.min(a.strength, attLoss * (0.8 + 0.4 * sim.rng.next()));
      a.strength -= l; casA += l * UNIT_INFO[a.type].manpower;
      a.equipment = Math.max(0, a.equipment - l * 0.8);
      a.organization = Math.max(0, a.organization - 0.045 * Math.pow(1 / ratio, 0.6) * noise());
      a.fatigue = Math.min(1, a.fatigue + 0.03);
      a.experience = Math.min(1, a.experience + 0.004);
      a.supply = Math.max(0, a.supply - 0.01 * UNIT_INFO[a.type].supplyUse);
    }
    for (const d of def) {
      const l = Math.min(d.strength, defLoss * (0.8 + 0.4 * sim.rng.next()));
      d.strength -= l; casD += l * UNIT_INFO[d.type].manpower;
      d.equipment = Math.max(0, d.equipment - l * 0.8);
      d.organization = Math.max(0, d.organization - 0.05 * Math.pow(ratio, 0.6) * noise());
      d.entrenchment = Math.max(0, d.entrenchment - 0.02 * ratio);
      d.experience = Math.min(1, d.experience + 0.004);
    }
    prov.devastation = Math.min(1, prov.devastation + 0.004);
    b.casualtiesAttacker += casA;
    b.casualtiesDefender += casD;
    b.lastDay = sim.day;
    b.log.push({ day: sim.day, attackerLoss: Math.round(casA * 1000), defenderLoss: Math.round(casD * 1000), ratio: Math.round(ratio * 100) / 100 });
    if (b.log.length > 60) b.log.shift();
    recordCasualties(sim, war, b.attacker, casA);
    recordCasualties(sim, war, b.defender, casD);
    // civiles: la población de la provincia sufre
    prov.pop = Math.max(0.001, prov.pop - (casA + casD) * 0.0002);
    // resolución: retirada del defensor o fracaso del ataque
    const defBroken = def.every((d) => d.organization < 0.15 || d.strength < 0.15);
    const attBroken = att.every((a) => a.organization < 0.15 || a.strength < 0.15);
    if (defBroken) {
      for (const d of def) retreatOrSurrender(sim, d, b);
      attackerWins(sim, b, att);
    } else if (attBroken) {
      endBattle(sim, b, 'defender_won');
    }
  }
}

function recordCasualties(sim: Sim, war: War, country: CountryId, cas: number): void {
  war.casualties[country] = (war.casualties[country] ?? 0) + cas;
  const c = sim.state.countries[country];
  if (c) c.military.warExhaustion = Math.min(1, c.military.warExhaustion + cas / Math.max(1, population(c) * 1000) * 60);
}

function retreatOrSurrender(sim: Sim, u: Unit, b: Battle): void {
  const ps = sim.idx.provinces.get(u.location);
  const options = (ps?.neighbors ?? []).filter((l) => {
    const p = sim.state.provinces[l.to];
    return p && (p.controller === u.owner || allies(sim, u.owner, p.controller)) && !Object.values(sim.state.battles).some((x) => x.status === 'active' && x.province === l.to);
  });
  if (!options.length) {
    // cercada: se rinde
    const war = sim.state.wars[b.warId];
    if (war) recordCasualties(sim, war, u.owner, u.strength * UNIT_INFO[u.type].manpower * 0.3);
    sim.emit('unit_surrender', 'world', 'major', [u.owner, b.attacker], `${u.name} se rinde cercada`, `La unidad ${u.name} de ${sim.state.countries[u.owner]?.name}, sin vía de retirada, capitula en ${ps?.name}.`, { province: u.location });
    delete sim.state.units[u.id];
    return;
  }
  // retirarse hacia la provincia con mejor abastecimiento propio (la más alejada del frente)
  const target = options.sort((x, y) => (sim.state.provinces[y.to].controller === u.owner ? 1 : 0) - (sim.state.provinces[x.to].controller === u.owner ? 1 : 0))[0];
  u.location = target.to;
  u.path = [];
  u.order = null;
  u.battleId = null;
  u.organization = Math.max(0.05, u.organization);
  u.entrenchment = 0;
  u.status = 'ready';
}

function attackerWins(sim: Sim, b: Battle, att: Unit[]): void {
  const war = sim.state.wars[b.warId];
  endBattle(sim, b, 'attacker_won');
  if (war) war.battlesWon[b.attacker] = (war.battlesWon[b.attacker] ?? 0) + 1;
  const lead = att.sort((x, y) => y.strength - x.strength)[0];
  for (const a of att) {
    if (a.strength < 0.05) continue;
    a.location = b.province;
    a.progress = 0;
    if (a.path[0] === b.province) a.path.shift();
    a.status = a.path.length ? 'moving' : 'ready';
  }
  if (lead) captureProvince(sim, b.province, lead.owner);
  const ca = sim.state.countries[b.attacker];
  if (ca) ca.cooldowns.warSuccess = Math.min(1, (ca.cooldowns.warSuccess ?? 0) + 0.1);
}

function endBattle(sim: Sim, b: Battle, result: Battle['status']): void {
  b.status = result;
  for (const id of [...b.attackers, ...b.defenders]) {
    const u = sim.state.units[id];
    if (!u || u.battleId !== b.id) continue;
    u.battleId = null;
    if (u.status === 'combat') u.status = 'ready';
    if (result === 'defender_won' && b.attackers.includes(id)) { u.path = []; u.order = null; }
  }
  if (result === 'defender_won' || result === 'attacker_won') {
    const ps = sim.idx.provinces.get(b.province);
    const winner = result === 'attacker_won' ? b.attacker : b.defender;
    sim.emit('battle_end', 'world', 'minor', [b.attacker, b.defender], `${sim.state.countries[winner]?.name} vence en ${ps?.name}`,
      `Bajas: ${Math.round(b.casualtiesAttacker * 1000).toLocaleString('es')} atacantes y ${Math.round(b.casualtiesDefender * 1000).toLocaleString('es')} defensores.`, { province: b.province });
  }
}

/** Combate naval, bloqueos y misiones aéreas estratégicas. */
export function navalAirStep(sim: Sim, dt: number): void {
  const st = sim.state;
  sim.blockade.clear();
  // combates navales en zonas con flotas enemigas
  const byZone = new Map<string, Unit[]>();
  for (const u of Object.values(st.units)) if (u.domain === 'sea' && u.status !== 'training') { const l = byZone.get(u.location) ?? []; l.push(u); byZone.set(u.location, l); }
  for (const [zone, units] of byZone) {
    for (const a of units) {
      for (const b of units) {
        if (a.owner >= b.owner || !isHostile(sim, a.owner, b.owner)) continue;
        const war = activeWarBetween(sim, a.owner, b.owner);
        if (!war || (sim.isHuman(a.owner) && !sim.isOnline(a.owner)) || (sim.isHuman(b.owner) && !sim.isOnline(b.owner))) continue;
        const pa = UNIT_INFO[a.type].naval * a.strength * (0.4 + 0.6 * a.organization) * a.tech;
        const pb = UNIT_INFO[b.type].naval * b.strength * (0.4 + 0.6 * b.organization) * b.tech;
        const r = clamp(pa / Math.max(1e-6, pb), 0.05, 20);
        const lb = 0.02 * Math.pow(r, 0.7) * (0.8 + 0.4 * sim.rng.next()), la = 0.02 * Math.pow(1 / r, 0.7) * (0.8 + 0.4 * sim.rng.next());
        a.strength = Math.max(0, a.strength - la); b.strength = Math.max(0, b.strength - lb);
        a.organization = Math.max(0, a.organization - 0.05 / r); b.organization = Math.max(0, b.organization - 0.05 * r);
        recordCasualties(sim, war, a.owner, la * UNIT_INFO[a.type].manpower);
        recordCasualties(sim, war, b.owner, lb * UNIT_INFO[b.type].manpower);
      }
    }
    // bloqueos: flotas con orden de bloqueo reducen el comercio marítimo de los enemigos costeros
    const z = sim.idx.seaZones.get(zone);
    if (!z) continue;
    for (const u of units) {
      if (u.order?.kind !== 'blockade') continue;
      for (const pid of z.provinces) {
        const p = st.provinces[pid];
        if (!p || !isHostile(sim, u.owner, p.owner)) continue;
        const war = activeWarBetween(sim, u.owner, p.owner);
        if (!war || !humansMayLoseTerritory(sim, p.owner, war)) continue;
        const [own, enemy] = navalPower(sim, u.owner, zone);
        if (own > enemy) {
          const ports = Object.values(st.provinces).filter((q) => q.owner === p.owner && q.buildings.port > 0).length || 1;
          const cur = sim.blockade.get(p.owner) ?? 1;
          sim.blockade.set(p.owner, Math.max(0.15, cur - 0.6 / ports * (own / (own + enemy))));
        }
      }
    }
    for (const u of units) if (u.strength < 0.05) { sim.emit('fleet_sunk', 'world', 'major', [u.owner], `Hundida la ${u.name}`, `La ${u.name} de ${st.countries[u.owner]?.name} ha sido destruida en combate naval.`); delete st.units[u.id]; }
  }
  // misiones aéreas estratégicas: bombardeo e interdicción
  sim.interdiction.clear();
  for (const u of Object.values(st.units)) {
    if (u.domain !== 'air' || u.status === 'training' || !u.order?.target) continue;
    const target = st.provinces[u.order.target];
    if (!target) continue;
    const enemy = target.controller;
    const war = activeWarBetween(sim, u.owner, enemy);
    if (!war || !humansMayLoseTerritory(sim, enemy, war) || (sim.isHuman(u.owner) && !sim.isOnline(u.owner))) continue;
    const def = airPower(sim, enemy, target.id);
    const own = airPower(sim, u.owner, target.id);
    const sup = own.air / Math.max(1e-6, own.air + def.air);
    const info = UNIT_INFO[u.type];
    // pérdidas por defensa aérea
    u.strength = Math.max(0, u.strength - 0.004 * (1 - sup) * (0.5 + sim.rng.next()));
    if (u.order.kind === 'bombing') {
      const dmg = info.attack * u.strength * sup * 0.0025;
      target.devastation = Math.min(1, target.devastation + dmg);
      for (let i = 0; i < target.capital.length; i++) target.capital[i] *= 1 - dmg * 0.5;
      target.infra = Math.max(0.05, target.infra - dmg * 0.3);
    } else if (u.order.kind === 'interdiction') {
      sim.interdiction.set(target.id + '|' + enemy, Math.min(0.8, (sim.interdiction.get(target.id + '|' + enemy) ?? 0) + info.attack * u.strength * sup * 0.25));
    }
    if (u.strength < 0.05) delete st.units[u.id];
  }
  void dt;
}

// ---------------------------------------------------------------------------
// Guerras: sincronización, puntuación y cansancio
// ---------------------------------------------------------------------------

export function warParticipants(war: War, side?: 'attacker' | 'defender'): CountryId[] {
  return war.participants.filter((p) => !side || p.side === side).map((p) => p.country);
}

export function computeMandatoryHumans(sim: Sim, war: War): CountryId[] {
  return war.participants.map((p) => p.country).filter((c) => sim.isHuman(c));
}

/** Máquina de estados de la guerra según la conexión de los jugadores humanos obligatorios. */
export function warSyncStep(sim: Sim): void {
  const prepDays = sim.state.settings.warPrepDays ?? 3;
  for (const war of Object.values(sim.state.wars).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (war.status === 'ended' || war.status === 'ceasefire') continue;
    war.mandatoryHumans = computeMandatoryHumans(sim, war);
    const allOnline = war.mandatoryHumans.every((c) => sim.isOnline(c));
    if (war.status === 'pending') {
      if (allOnline) {
        war.status = 'preparing';
        war.preparingUntil = sim.day + (war.mandatoryHumans.length ? prepDays : 1);
        sim.emit('war_preparing', 'world', 'major', warParticipants(war), `Movilización: ${war.name}`,
          war.mandatoryHumans.length ? `Todos los gobiernos implicados están presentes. Las operaciones comienzan en ${prepDays} días o cuando todos confirmen estar listos.` : 'Las fuerzas se movilizan.');
      }
      continue;
    }
    if (war.status === 'preparing') {
      if (!allOnline) continue;
      const allReady = war.mandatoryHumans.every((c) => war.ready.includes(c));
      if (allReady || (war.preparingUntil !== null && sim.day >= war.preparingUntil)) {
        war.status = 'active';
        war.startedDay = war.startedDay ?? sim.day;
        sim.emit('war_active', 'world', 'critical', warParticipants(war), `Comienzan las hostilidades: ${war.name}`, `Las fuerzas de ${sim.state.countries[war.attacker]?.name} y ${sim.state.countries[war.defender]?.name} entran en combate.`);
      }
      continue;
    }
    if (war.status === 'active' && !allOnline) {
      war.status = 'frozen';
      war.frozenReason = war.mandatoryHumans.filter((c) => !sim.isOnline(c)).map((c) => sim.state.countries[c]?.name).join(', ');
      sim.emit('war_frozen', 'world', 'major', warParticipants(war), `Operaciones congeladas: ${war.name}`, `Falta la presencia de: ${war.frozenReason}. Posiciones y órdenes se conservan; la vida civil continúa.`);
      continue;
    }
    if (war.status === 'frozen' && allOnline) {
      war.status = 'active';
      war.frozenReason = null;
      sim.emit('war_resumed', 'world', 'major', warParticipants(war), `Se reanudan las operaciones: ${war.name}`, 'Todos los gobiernos implicados han vuelto. El conflicto continúa desde sus posiciones anteriores.');
    }
    if (war.status === 'active') {
      war.activeDays += 1;
      updateWarscore(sim, war);
      if (checkCapitulation(sim, war)) continue;
      for (const p of war.participants) {
        const c = sim.state.countries[p.country];
        if (c) c.military.warExhaustion = Math.min(1, c.military.warExhaustion + 0.0006 * (p.side === 'attacker' ? 1.2 : 0.8) * (sim.params(c).democracy + 0.5));
      }
    }
  }
}

/**
 * Colapso estatal: un país de IA que no controla ninguna de sus provincias durante 60 días
 * capitula; sus territorios ocupados pasan a los ocupantes y el Estado desaparece.
 */
function checkCapitulation(sim: Sim, war: War): boolean {
  for (const part of war.participants) {
    if (sim.isHuman(part.country)) continue;
    const c = sim.state.countries[part.country];
    if (!c?.alive) continue;
    const owned = Object.values(sim.state.provinces).filter((p) => p.owner === c.id);
    if (!owned.length || owned.some((p) => p.controller === c.id)) { c.cooldowns.fullyOccupiedSince = -1; continue; }
    if ((c.cooldowns.fullyOccupiedSince ?? -1) < 0) { c.cooldowns.fullyOccupiedSince = sim.day; continue; }
    if (sim.day - c.cooldowns.fullyOccupiedSince < 60) continue;
    const byOccupier = new Map<string, string[]>();
    for (const p of owned) { const l = byOccupier.get(p.controller) ?? []; l.push(p.id); byOccupier.set(p.controller, l); }
    sim.emit('capitulation', 'world', 'critical', [c.id], `${c.name} capitula`, `Totalmente ocupado, ${c.longName} se rinde sin condiciones.`);
    if (part.leader) endWar(sim, war, `Capitulación de ${c.name}.`);
    else war.participants = war.participants.filter((p) => p.country !== c.id);
    for (const [occ, provs] of byOccupier) if (sim.state.countries[occ]?.alive) transferProvincesHook(sim, provs, occ);
    return true;
  }
  return false;
}

let transferProvincesHook: (sim: Sim, provs: string[], to: string) => void = () => undefined;
export function setTransferHook(fn: (sim: Sim, provs: string[], to: string) => void): void { transferProvincesHook = fn; }

export function provinceValue(sim: Sim, p: ProvinceState): number {
  let k = 0;
  for (const v of p.capital) k += v;
  return p.pop * 2 + k * 0.01 + 1;
}

export function updateWarscore(sim: Sim, war: War): void {
  const att = new Set(warParticipants(war, 'attacker')), def = new Set(warParticipants(war, 'defender'));
  let defTotal = 0, attTotal = 0, defLost = 0, attLost = 0;
  for (const p of Object.values(sim.state.provinces)) {
    const v = provinceValue(sim, p);
    if (def.has(p.owner)) { defTotal += v; if (att.has(p.controller)) defLost += v; }
    if (att.has(p.owner)) { attTotal += v; if (def.has(p.controller)) attLost += v; }
  }
  let casA = 0, casD = 0;
  for (const c of att) casA += war.casualties[c] ?? 0;
  for (const c of def) casD += war.casualties[c] ?? 0;
  const occ = 100 * (defLost / Math.max(1, defTotal) - attLost / Math.max(1, attTotal)) * 1.6;
  const cas = 20 * (casD - casA) / Math.max(1, casD + casA);
  war.warscore = Math.round(clamp(occ + cas, -100, 100));
}

export function declareWar(sim: Sim, attacker: CountryState, target: CountryState, goal: War['goal']['kind'], provinces: string[]): { ok: boolean; error?: string; war?: War } {
  const st = sim.state;
  if (attacker.id === target.id) return { ok: false, error: 'No se puede declarar la guerra a sí mismo.' };
  if (!target.alive) return { ok: false, error: 'El país no existe.' };
  if (warBetween(st, attacker.id, target.id)) return { ok: false, error: 'Ya existe un conflicto con ese país.' };
  const lp = sim.params(attacker);
  const cost = lp.democracy > 0.6 ? 30 : 12;
  if (attacker.politics.politicalCapital < cost) return { ok: false, error: `Se necesita capital político (${cost}) para declarar la guerra.` };
  attacker.politics.politicalCapital -= cost;
  // romper tratados de no agresión y alianzas tiene consecuencias
  for (const t of Object.values(st.treaties)) {
    if (t.status !== 'active' || !t.parties.includes(attacker.id) || !t.parties.includes(target.id)) continue;
    if (['non_aggression', 'defensive_alliance', 'military_alliance', 'ceasefire', 'peace'].includes(t.type)) breakTreaty(sim, t.id, attacker.id);
  }
  const war: War = {
    id: sim.nextId('W'), name: `Guerra ${attacker.adjective}-${target.adjective}`, attacker: attacker.id, defender: target.id,
    participants: [{ country: attacker.id, side: 'attacker', joinedDay: sim.day, leader: true }, { country: target.id, side: 'defender', joinedDay: sim.day, leader: true }],
    goal: { kind: goal, provinces: provinces.filter((p) => st.provinces[p]?.owner === target.id) }, declaredDay: sim.day, status: 'pending',
    preparingUntil: null, startedDay: null, endedDay: null, frozenReason: null, mandatoryHumans: [], ready: [], callsToArms: [],
    casualties: {}, battlesWon: {}, warscore: 0, result: null, activeDays: 0
  };
  st.wars[war.id] = war;
  // relaciones
  const r = relation(st, attacker.id, target.id);
  r.opinion = -100;
  r.trust = Math.max(0, r.trust - 40);
  for (const o of sim.aliveCountries()) if (o.id !== attacker.id && o.id !== target.id) relation(st, attacker.id, o.id).opinion -= goal === 'conquest' ? 12 : 6;
  // llamadas a las armas: aliados defensivos del objetivo y aliados militares del agresor
  for (const t of Object.values(st.treaties)) {
    if (t.status !== 'active') continue;
    if ((t.type === 'defensive_alliance' || t.type === 'military_alliance') && t.parties.includes(target.id)) {
      for (const ally of t.parties) if (ally !== target.id && ally !== attacker.id) addCall(war, ally, 'defender', t.id, sim.day);
    }
    if (t.type === 'military_alliance' && t.parties.includes(attacker.id)) {
      for (const ally of t.parties) if (ally !== attacker.id && ally !== target.id) addCall(war, ally, 'attacker', t.id, sim.day);
    }
  }
  for (const o of Object.values(st.organizations)) {
    if (!o.active || !o.mutualDefense || !o.members.includes(target.id) || o.members.includes(attacker.id)) continue;
    for (const m of o.members) if (m !== target.id) addCall(war, m, 'defender', null, sim.day);
  }
  war.mandatoryHumans = computeMandatoryHumans(sim, war);
  sim.emit('war_declared', 'world', 'critical', [attacker.id, target.id], `${attacker.name} declara la guerra a ${target.name}`,
    `${attacker.longName} declara la guerra a ${target.longName}${war.goal.provinces.length ? ` reclamando ${war.goal.provinces.length} provincias` : ''}. ${war.mandatoryHumans.length ? 'Las operaciones esperarán a que todos los gobiernos implicados estén presentes.' : ''}`);
  return { ok: true, war };
}

function addCall(war: War, country: CountryId, side: 'attacker' | 'defender', treaty: string | null, day: number): void {
  if (war.callsToArms.some((c) => c.country === country) || war.participants.some((p) => p.country === country)) return;
  war.callsToArms.push({ country, side, status: 'pending', day, treaty });
}

export function joinWar(sim: Sim, war: War, country: CountryId, side: 'attacker' | 'defender'): void {
  if (war.participants.some((p) => p.country === country)) return;
  war.participants.push({ country, side, joinedDay: sim.day, leader: false });
  const enemies = warParticipants(war, side === 'attacker' ? 'defender' : 'attacker');
  for (const e of enemies) { const r = relation(sim.state, country, e); r.opinion = Math.min(r.opinion, -60); }
  war.mandatoryHumans = computeMandatoryHumans(sim, war);
  const c = sim.state.countries[country];
  sim.emit('war_joined', 'world', 'major', [country], `${c?.name} entra en la ${war.name}`, `${c?.name} se une al bando ${side === 'attacker' ? 'atacante' : 'defensor'}.`);
}

export function breakTreaty(sim: Sim, treatyId: string, by: CountryId): void {
  const t = sim.state.treaties[treatyId];
  if (!t || t.status !== 'active') return;
  t.status = 'broken';
  t.brokenBy = by;
  t.endedDay = sim.day;
  const c = sim.state.countries[by];
  for (const o of sim.aliveCountries()) {
    if (o.id === by) continue;
    const r = relation(sim.state, by, o.id);
    r.trust = Math.max(0, r.trust - (t.parties.includes(o.id) ? 40 : 8));
    if (t.parties.includes(o.id)) r.opinion = Math.max(-100, r.opinion - 35);
  }
  sim.emit('treaty_broken', 'world', 'major', t.parties, `${c?.name} rompe el tratado «${t.name}»`, 'La ruptura de compromisos internacionales daña la confianza en todo el mundo.');
}

/** Fin de guerra: los participantes del lado perdedor y ganador vuelven a la paz. */
export function endWar(sim: Sim, war: War, result: string): void {
  war.status = 'ended';
  war.endedDay = sim.day;
  war.result = result;
  for (const b of Object.values(sim.state.battles)) if (b.warId === war.id && (b.status === 'active' || b.status === 'frozen')) endBattleQuiet(sim, b);
  // las provincias ocupadas vuelven a su dueño (salvo las cedidas por tratado, ya transferidas)
  const parts = new Set(warParticipants(war));
  for (const p of Object.values(sim.state.provinces)) {
    if (p.controller !== p.owner && parts.has(p.controller) && parts.has(p.owner)) { p.controller = p.owner; p.occupiedSince = null; }
  }
  // unidades en territorio ajeno regresan a la capital
  for (const u of Object.values(sim.state.units)) {
    if (u.domain !== 'land' || !parts.has(u.owner)) continue;
    const p = sim.state.provinces[u.location];
    if (p && p.controller !== u.owner && !allies(sim, u.owner, p.controller)) { u.location = sim.state.countries[u.owner]?.capital ?? u.location; u.path = []; u.order = null; u.status = 'ready'; }
    if (u.status === 'frozen') u.status = 'ready';
  }
  for (const c of parts) {
    const country = sim.state.countries[c];
    if (country) country.cooldowns.warSuccess = 0;
  }
  sim.emit('war_ended', 'world', 'critical', [...parts], `Fin de la ${war.name}`, result);
}

function endBattleQuiet(sim: Sim, b: Battle): void {
  b.status = 'ended';
  for (const id of [...b.attackers, ...b.defenders]) { const u = sim.state.units[id]; if (u && u.battleId === b.id) { u.battleId = null; if (u.status === 'combat') u.status = 'ready'; } }
}

export function issueOrder(sim: Sim, c: CountryState, unitIds: string[], kind: NonNullable<Unit['order']>['kind'], target: string | null): { ok: boolean; error?: string; moved: number } {
  let moved = 0;
  let lastError: string | undefined;
  for (const id of unitIds) {
    const u = sim.state.units[id];
    if (!u || u.owner !== c.id) { lastError = 'Unidad inexistente o ajena.'; continue; }
    if (u.status === 'training') { lastError = 'La unidad está en formación.'; continue; }
    if (u.status === 'combat' && kind !== 'retreat') { lastError = 'La unidad está en combate: solo puede retirarse.'; continue; }
    if (u.domain === 'land') {
      if (kind === 'hold' || kind === 'defend') { u.path = []; u.order = { kind, target: u.location, issuedDay: sim.day }; if (u.status !== 'combat') u.status = 'ready'; moved++; continue; }
      if (kind === 'retreat') {
        const ps = sim.idx.provinces.get(u.location);
        const safe = ps?.neighbors.find((l) => sim.state.provinces[l.to]?.controller === c.id);
        if (!safe && !target) { lastError = 'No hay provincia segura para retirarse.'; continue; }
        const dest = target ?? safe!.to;
        if (u.battleId) { const b = sim.state.battles[u.battleId]; if (b) { b.attackers = b.attackers.filter((x) => x !== u.id); b.defenders = b.defenders.filter((x) => x !== u.id); } u.battleId = null; u.organization *= 0.8; }
        u.status = 'ready';
        const path = findLandPath(sim, u, dest, false);
        u.path = path ?? [];
        u.order = { kind, target: dest, issuedDay: sim.day };
        moved++;
        continue;
      }
      if (kind === 'sabotage' || kind === 'recon') {
        if (u.type !== 'special_forces') { lastError = 'Solo las fuerzas especiales pueden realizar esa misión.'; continue; }
      }
      if (!target || !sim.state.provinces[target]) { lastError = 'Destino inválido.'; continue; }
      // desembarco anfibio
      const ps = sim.idx.provinces.get(u.location)!;
      const ts = sim.idx.provinces.get(target)!;
      let path = findLandPath(sim, u, target, kind === 'attack' || kind === 'move');
      if (!path && ps.coastal && ts.coastal) {
        const fleet = Object.values(sim.state.units).find((f) => f.owner === c.id && f.type === 'amphibious_fleet' && f.status !== 'training' && ps.seaZones.includes(f.location) && (ts.seaZones.includes(f.location) || ts.seaZones.some((z) => sim.idx.seaZones.get(f.location)?.neighbors.includes(z))));
        if (fleet) {
          const enemyCtl = sim.state.provinces[target].controller;
          const [own, enemy] = navalPower(sim, c.id, fleet.location);
          if (enemy > own) { lastError = 'El enemigo domina el mar: el desembarco es imposible.'; continue; }
          if (enemyCtl !== c.id && !isHostile(sim, c.id, enemyCtl) && !allies(sim, c.id, enemyCtl)) { lastError = 'No se puede desembarcar en un país neutral.'; continue; }
          amphibiousLanding(sim, u, target);
          moved++;
          continue;
        }
      }
      if (!path) { lastError = 'No existe una ruta válida (geografía, fronteras neutrales o mar sin transporte).'; continue; }
      u.path = path;
      u.progress = 0;
      u.order = { kind, target, issuedDay: sim.day };
      u.status = path.length ? 'moving' : 'ready';
      moved++;
    } else if (u.domain === 'sea') {
      if (!target) { u.path = []; u.order = { kind, target: u.location, issuedDay: sim.day }; moved++; continue; }
      const zone = sim.idx.seaZones.has(target) ? target : sim.idx.provinces.get(target)?.seaZones[0];
      if (!zone) { lastError = 'Destino marítimo inválido.'; continue; }
      const path = findSeaPath(sim, u.location, zone);
      if (!path) { lastError = 'No hay ruta marítima.'; continue; }
      u.path = path;
      u.order = { kind, target: zone, issuedDay: sim.day };
      u.status = path.length ? 'moving' : 'ready';
      moved++;
    } else {
      if (kind === 'rebase') {
        if (!target || sim.state.provinces[target]?.controller !== c.id || sim.state.provinces[target].buildings.airport < 1) { lastError = 'La base aérea debe ser propia y tener aeropuerto.'; continue; }
        u.path = [target];
      }
      u.order = { kind, target, issuedDay: sim.day };
      moved++;
    }
  }
  return { ok: moved > 0, error: moved ? undefined : lastError, moved };
}

function amphibiousLanding(sim: Sim, u: Unit, target: string): void {
  const p = sim.state.provinces[target];
  const war = warBetween(sim.state, u.owner, p.controller);
  const defenders = Object.values(sim.state.units).filter((d) => d.location === target && d.domain === 'land' && isHostile(sim, u.owner, d.owner));
  u.organization *= 0.85;
  if (war && war.status === 'active' && humansMayLoseTerritory(sim, p.controller, war)) {
    if (defenders.length) {
      startOrJoinBattle(sim, war, u, target, defenders);
      const b = Object.values(sim.state.battles).find((x) => x.province === target && x.status === 'active' && x.attacker === u.owner);
      if (b) b.amphibious = true;
    } else {
      u.location = target;
      captureProvince(sim, target, u.owner);
    }
  } else if (p.controller === u.owner || allies(sim, u.owner, p.controller)) {
    u.location = target;
  } else {
    u.status = 'frozen';
    u.path = [target];
  }
}

/** Planes de batalla: asignan órdenes a sus unidades cada día (frentes y ofensivas). */
export function plansStep(sim: Sim): void {
  for (const plan of Object.values(sim.state.plans)) {
    if (!plan.active) continue;
    const c = sim.state.countries[plan.owner];
    if (!c) { plan.active = false; continue; }
    plan.units = plan.units.filter((id) => sim.state.units[id]?.owner === plan.owner);
    if (!plan.units.length) { plan.active = false; continue; }
    if (plan.kind === 'front_defense') {
      // provincias propias que limitan con territorio enemigo (o del país señalado)
      const front: string[] = [];
      for (const p of Object.values(sim.state.provinces)) {
        if (p.controller !== plan.owner) continue;
        const ps = sim.idx.provinces.get(p.id)!;
        if (ps.neighbors.some((l) => { const q = sim.state.provinces[l.to]; return q && q.controller !== plan.owner && (plan.enemy ? q.controller === plan.enemy : isHostile(sim, plan.owner, q.controller)); })) front.push(p.id);
      }
      if (!front.length) continue;
      const idle = plan.units.map((id) => sim.state.units[id]).filter((u) => u && u.domain === 'land' && u.status === 'ready' && !u.path.length);
      const covered = new Map<string, number>();
      for (const id of plan.units) { const u = sim.state.units[id]; if (u && front.includes(u.location)) covered.set(u.location, (covered.get(u.location) ?? 0) + 1); }
      for (const u of idle) {
        if (front.includes(u.location) && (covered.get(u.location) ?? 0) <= 1) continue;
        const target = front.slice().sort((a, b) => (covered.get(a) ?? 0) - (covered.get(b) ?? 0) || sim.idx.dist(u.location, a) - sim.idx.dist(u.location, b))[0];
        if (!target || target === u.location) continue;
        const path = findLandPath(sim, u, target, false);
        if (path) { u.path = path; u.order = { kind: 'defend', target, issuedDay: sim.day, planId: plan.id }; u.status = 'moving'; covered.set(target, (covered.get(target) ?? 0) + 1); covered.set(u.location, (covered.get(u.location) ?? 1) - 1); }
      }
    } else {
      const targets = plan.targets.filter((t) => sim.state.provinces[t] && sim.state.provinces[t].controller !== plan.owner);
      if (!targets.length) { plan.active = false; sim.emit('plan_done', 'private', 'info', [plan.owner], 'Ofensiva completada', 'Todos los objetivos del plan están bajo control.'); continue; }
      for (const id of plan.units) {
        const u = sim.state.units[id];
        if (!u || u.domain !== 'land' || u.status !== 'ready' || u.path.length || u.organization < 0.5 || u.supply < 0.35) continue;
        const target = targets.slice().sort((a, b) => sim.idx.dist(u.location, a) - sim.idx.dist(u.location, b))[0];
        const path = findLandPath(sim, u, target, true);
        if (path) { u.path = path; u.order = { kind: 'attack', target, issuedDay: sim.day, planId: plan.id }; u.status = 'moving'; }
      }
    }
  }
}
