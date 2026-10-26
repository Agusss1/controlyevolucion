import type {
  WorldState, WorldMap, CountryState, ProvinceStatic, SeaZoneStatic, GameEvent, Relation, EventScope, Severity, CountryId, Treaty, TreatyType, Unit, ProvinceState
} from '@cyo/shared';
import { Rng } from '../rng.js';
import { computeLawParams, type LawParams } from '../data/laws.js';

/** Índices precalculados del mapa estático (no se serializan). */
export interface MapIndex {
  map: WorldMap;
  provinces: Map<string, ProvinceStatic>;
  seaZones: Map<string, SeaZoneStatic>;
  /** distancia entre centros de provincias vecinas (unidades de hex) */
  dist(a: string, b: string): number;
}

const indexCache = new WeakMap<WorldMap, MapIndex>();

export function indexMap(map: WorldMap): MapIndex {
  const cached = indexCache.get(map);
  if (cached) return cached;
  const provinces = new Map(map.provinces.map((p) => [p.id, p]));
  const seaZones = new Map(map.seaZones.map((s) => [s.id, s]));
  const idx: MapIndex = {
    map, provinces, seaZones,
    dist(a, b) {
      const pa = provinces.get(a) ?? seaZones.get(a), pb = provinces.get(b) ?? seaZones.get(b);
      if (!pa || !pb) return 99;
      return Math.hypot(pa.cx - pb.cx, pa.cy - pb.cy);
    }
  };
  indexCache.set(map, idx);
  return idx;
}

/** Contexto de ejecución de un paso de simulación. */
export class Sim {
  readonly idx: MapIndex;
  readonly rng: Rng;
  readonly events: GameEvent[] = [];
  /** fracción del comercio marítimo que sigue fluyendo por país (bloqueos navales del día) */
  readonly blockade = new Map<string, number>();
  /** interdicción aérea del día: clave provincia|país afectado */
  readonly interdiction = new Map<string, number>();

  blockadeFactorOf(id: CountryId): number { return this.blockade.get(id) ?? 1; }
  private paramCache = new Map<string, { key: string; params: LawParams }>();

  constructor(public state: WorldState, public map: WorldMap) {
    this.idx = indexMap(map);
    this.rng = new Rng(state.rng);
  }

  /** Persiste el estado del generador aleatorio en el estado del mundo. */
  commit(): void { this.state.rng = [...this.rng.state] as WorldState['rng']; }

  get day(): number { return this.state.day; }

  country(id: CountryId): CountryState {
    const c = this.state.countries[id];
    if (!c) throw new Error(`país inexistente ${id}`);
    return c;
  }

  aliveCountries(): CountryState[] {
    return Object.values(this.state.countries).filter((c) => c.alive).sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  /** Parámetros institucionales del país (en caché durante el paso; se invalidan al cambiar leyes). */
  params(c: CountryState): LawParams {
    const cached = this.paramCache.get(c.id);
    if (cached && cached.key === c.regime) return cached.params;
    const params = computeLawParams(c.laws);
    this.paramCache.set(c.id, { key: c.regime, params });
    return params;
  }

  invalidateParams(id: CountryId): void { this.paramCache.delete(id); }

  private _unitsByOwner: Map<string, Unit[]> | null = null;
  private _provByOwner: Map<string, ProvinceState[]> | null = null;
  /** Unidades por dueño (caché del paso; invalidar tras crear/destruir unidades). */
  unitsOf(owner: CountryId): Unit[] {
    if (!this._unitsByOwner) {
      this._unitsByOwner = new Map();
      for (const u of Object.values(this.state.units)) { const l = this._unitsByOwner.get(u.owner) ?? []; l.push(u); this._unitsByOwner.set(u.owner, l); }
    }
    return (this._unitsByOwner.get(owner) ?? []).filter((u) => this.state.units[u.id] === u && u.owner === owner);
  }
  ownedProvinces(owner: CountryId): ProvinceState[] {
    if (!this._provByOwner) {
      this._provByOwner = new Map();
      for (const p of Object.values(this.state.provinces)) { const l = this._provByOwner.get(p.owner) ?? []; l.push(p); this._provByOwner.set(p.owner, l); }
    }
    return (this._provByOwner.get(owner) ?? []).filter((p) => p.owner === owner);
  }
  invalidateCaches(): void { this._unitsByOwner = null; this._provByOwner = null; }

  nextId(prefix: string): string {
    this.state.nextId += 1;
    return `${prefix}${this.state.nextId}`;
  }

  emit(type: string, scope: EventScope, severity: Severity, countries: CountryId[], title: string, text: string, extra: Partial<GameEvent> = {}): GameEvent {
    const ev: GameEvent = { id: this.nextId('E'), day: this.state.day, type, scope, severity, countries, title, text, ...extra };
    this.events.push(ev);
    this.state.recentEvents.push(ev);
    if (this.state.recentEvents.length > 300) this.state.recentEvents.splice(0, this.state.recentEvents.length - 300);
    return ev;
  }

  isHuman(id: CountryId): boolean { return this.state.humanCountries.includes(id); }
  isOnline(id: CountryId): boolean { return this.state.onlineCountries.includes(id); }

  provincesOf(id: CountryId, mode: 'owned' | 'controlled' = 'owned'): string[] {
    const out: string[] = [];
    for (const p of Object.values(this.state.provinces)) if ((mode === 'owned' ? p.owner : p.controller) === id) out.push(p.id);
    return out.sort();
  }
}

export function relKey(a: CountryId, b: CountryId): string { return a < b ? `${a}|${b}` : `${b}|${a}`; }

export function relation(state: WorldState, a: CountryId, b: CountryId): Relation {
  const key = relKey(a, b);
  let r = state.relations[key];
  if (!r) {
    const [x, y] = a < b ? [a, b] : [b, a];
    r = { a: x, b: y, opinion: 0, trust: 50, rivalry: 0, embassies: true, sanctions: [], recognized: true, border: false };
    state.relations[key] = r;
  }
  return r;
}

export function activeTreaties(state: WorldState, a: CountryId, b?: CountryId, type?: TreatyType): Treaty[] {
  const out: Treaty[] = [];
  for (const t of Object.values(state.treaties)) {
    if (t.status !== 'active') continue;
    if (!t.parties.includes(a)) continue;
    if (b && !t.parties.includes(b)) continue;
    if (type && t.type !== type) continue;
    out.push(t);
  }
  return out;
}

// Índice de tratados activos por par y tipo. Se reconstruye cuando cambia la firma del conjunto.
const treatyIndex = new WeakMap<WorldState, { sig: string; set: Set<string> }>();
function treatySignature(state: WorldState): string {
  let n = 0, active = 0;
  for (const k in state.treaties) { n++; if (state.treaties[k].status === 'active') active++; }
  return `${n}:${active}`;
}
export function hasTreaty(state: WorldState, a: CountryId, b: CountryId, type: TreatyType): boolean {
  let idx = treatyIndex.get(state);
  const sig = treatySignature(state);
  if (!idx || idx.sig !== sig) {
    const set = new Set<string>();
    for (const t of Object.values(state.treaties)) {
      if (t.status !== 'active') continue;
      for (const x of t.parties) for (const y of t.parties) if (x !== y) set.add(`${x}|${y}|${t.type}`);
    }
    idx = { sig, set };
    treatyIndex.set(state, idx);
  }
  return idx.set.has(`${a}|${b}|${type}`);
}

export function sharedOrganizations(state: WorldState, a: CountryId, b: CountryId) {
  return Object.values(state.organizations).filter((o) => o.active && o.members.includes(a) && o.members.includes(b));
}

export function atWar(state: WorldState, a: CountryId, b: CountryId): boolean {
  for (const w of Object.values(state.wars)) {
    if (w.status === 'ended' || w.status === 'pending') continue;
    const pa = w.participants.find((p) => p.country === a), pb = w.participants.find((p) => p.country === b);
    if (pa && pb && pa.side !== pb.side) return true;
  }
  return false;
}

export function warBetween(state: WorldState, a: CountryId, b: CountryId) {
  for (const w of Object.values(state.wars)) {
    if (w.status === 'ended') continue;
    const pa = w.participants.find((p) => p.country === a), pb = w.participants.find((p) => p.country === b);
    if (pa && pb && pa.side !== pb.side) return w;
  }
  return null;
}

export function fmtMoney(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toFixed(2)} billones`;
  if (a >= 1) return `${v.toFixed(1)} mil millones`;
  return `${(v * 1000).toFixed(0)} millones`;
}

export function pushSeries(c: CountryState, key: string, value: number, max = 240): void {
  const s = (c.series[key] ??= []);
  s.push(Math.round(value * 10000) / 10000);
  if (s.length > max) s.splice(0, s.length - max);
}
