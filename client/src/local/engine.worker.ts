/// <reference lib="webworker" />
/**
 * MOTOR LOCAL: la partida completa corre en el navegador, sin servidor.
 *
 * Reproduce el mismo contrato que el servidor (mensajes init/state/events/lobby/chat y las mismas
 * peticiones), así que toda la interfaz funciona igual. Usa el mismo motor determinista
 * (@cyo/simulation), el mismo esquema de comandos y la misma escala de tiempo (20 s = 1 día).
 * Es una partida de un jugador contra la IA; se guarda en IndexedDB.
 */
import {
  commandSchema, formatDate, DEFAULT_SETTINGS, REAL_MS_PER_DAY,
  type WorldMap, type WorldState, type GameSettings, type GameEvent, type ChatMessage, type GameSummary, type LobbyPlayer
} from '@cyo/shared';
import {
  createWorld, runDay, applyCommand, applySystemCommand, buildWorldView, buildPrivateView, projectCountry,
  totalRevenue, nominalGDP, population, GENERATOR_VERSION
} from '@cyo/simulation';
import { getSave, putSave, type LocalSave } from './db';

declare const self: DedicatedWorkerGlobalScope;

export type ToWorker =
  | { kind: 'open'; saveId: string; create?: { settings: GameSettings; playerName: string; officialUrl: string }; msPerDay?: number }
  | { kind: 'request'; id: number; event: string; data: unknown }
  | { kind: 'visible'; visible: boolean }
  | { kind: 'close'; id: number };
export type FromWorker =
  | { kind: 'event'; event: string; data: unknown }
  | { kind: 'reply'; id: number; data: unknown };

const PLAYER_ID = 'local';
const MAX_EVENTS = 600;
const SAVE_EVERY_DAYS = 5;

let save: LocalSave | null = null;
let msPerDay = REAL_MS_PER_DAY;
let visible = true;
let lastWall = Date.now();
let clock: ReturnType<typeof setInterval> | null = null;
let dirty = false;
let saving: Promise<void> = Promise.resolve();
let daysSinceSave = 0;
const chat: ChatMessage[] = [];

const post = (m: FromWorker) => self.postMessage(m);
const send = (event: string, data: unknown) => post({ kind: 'event', event, data });

// ------------------------------------------------------------------ mundo
async function loadOfficial(url: string): Promise<{ map: WorldMap; state: WorldState } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    let bytes = new Uint8Array(await r.arrayBuffer());
    // algunos servidores ya descomprimen el .gz (Content-Encoding); se detecta por la firma gzip
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    const data = JSON.parse(new TextDecoder().decode(bytes)) as { map: WorldMap; state: WorldState };
    return data.map?.generator?.version === GENERATOR_VERSION ? data : null;
  } catch { return null; }
}

async function newGame(id: string, settings: GameSettings, playerName: string, officialUrl: string): Promise<LocalSave> {
  const w = settings.world;
  let world = w.mode === 'official' ? await loadOfficial(officialUrl) : null;
  world ??= createWorld({ mode: w.mode, seed: w.seed || (w.mode === 'random' ? Math.random().toString(36).slice(2, 10) : undefined), countries: w.countries, advancedAI: settings.advancedAI, warPrepDays: settings.warPrepDays });
  world.state.settings.advancedAI = settings.advancedAI;
  world.state.settings.warPrepDays = settings.warPrepDays;
  return { id, settings, status: 'lobby', playerName, countryId: null, ready: false, createdAt: Date.now(), activeMs: 0, map: world.map, state: world.state, events: [], stats: [] };
}

// ------------------------------------------------------------------ vistas (mismo formato que el servidor)
function summary(s: LocalSave): GameSummary {
  return {
    id: s.id, code: 'LOCAL', name: s.settings.name, status: s.status, players: 1, maxPlayers: 1, day: s.state.day,
    privacy: 'private', worldName: s.state.scenario.name, clockMode: s.settings.clockMode, createdAt: s.createdAt
  };
}
function players(s: LocalSave): LobbyPlayer[] {
  return [{ id: PLAYER_ID, name: s.playerName, countryId: s.countryId, ready: s.ready, role: 'admin', online: true, lastSeen: Date.now() }];
}
function payload(s: LocalSave) {
  const c = s.countryId && s.state.countries[s.countryId]?.alive ? s.countryId : null;
  return { day: s.state.day, date: formatDate(s.state.day), view: buildWorldView(s.state, s.map, c), private: c ? buildPrivateView(s.state, s.map, c) : null };
}
const sendState = (s: LocalSave) => send('state', payload(s));
const sendLobby = (s: LocalSave) => send('lobby', { game: summary(s), settings: s.settings, players: players(s), admin: PLAYER_ID });

/** El país del jugador es humano y está conectado mientras la partida está abierta: la IA no lo gobierna. */
function syncPresence(s: LocalSave): void {
  const human = s.countryId && s.state.countries[s.countryId]?.alive ? [s.countryId] : [];
  if (JSON.stringify(human) === JSON.stringify(s.state.humanCountries) && JSON.stringify(human) === JSON.stringify(s.state.onlineCountries)) return;
  applySystemCommand(s.state, { type: 'presence', human, online: human });
}

function relevant(s: LocalSave, events: GameEvent[]): GameEvent[] {
  return events.filter((e) => e.scope === 'world' || (s.countryId !== null && e.countries.includes(s.countryId)));
}

function recordEvents(s: LocalSave, events: GameEvent[]): void {
  if (!events.length) return;
  s.events.push(...events);
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
  const mine = relevant(s, events);
  if (mine.length) send('events', mine);
}

function recordStats(s: LocalSave): void {
  for (const c of Object.values(s.state.countries)) {
    if (!c.alive) continue;
    const ng = nominalGDP(c);
    s.stats.push({
      day: s.state.day, country: c.id, data: {
        gdp: c.econ.realGDP, growth: c.econ.growth, inflation: c.econ.inflation, unemployment: c.econ.unemployment, population: population(c),
        debt: (c.fiscal.debtDomestic + c.fiscal.debtForeign * c.econ.exchangeRate) / Math.max(1e-6, ng), revenue: totalRevenue(c.fiscal.revenue) / Math.max(1e-6, ng),
        approval: c.politics.approval, stability: c.politics.stability, legitimacy: c.politics.legitimacy, regime: c.regime, techs: c.tech.known.length
      }
    });
  }
  // se conservan ~30 años de serie mensual
  const cutoff = s.state.day - 360 * 30;
  if (s.stats.length && s.stats[0].day < cutoff) s.stats = s.stats.filter((r) => r.day >= cutoff);
}

// ------------------------------------------------------------------ persistencia
function persist(): Promise<void> {
  if (!save || !dirty) return saving;
  dirty = false;
  daysSinceSave = 0;
  const snapshot = save;
  saving = saving.then(() => putSave(snapshot)).catch((e) => {
    dirty = true;
    send('notice', { kind: 'error', text: `No se pudo guardar la partida en el navegador: ${(e as Error).message}` });
  });
  return saving;
}

// ------------------------------------------------------------------ reloj
function tick(): void {
  const s = save;
  const now = Date.now();
  const elapsed = now - lastWall;
  lastWall = now;
  if (!s || s.status !== 'running' || s.settings.clockMode === 'paused' || !visible) return;
  s.activeMs += Math.max(0, Math.min(elapsed, 5000));
  const target = Math.floor(s.activeMs / msPerDay);
  let n = 0;
  while (s.state.day < target && n < 5) {
    syncPresence(s);
    const { events } = runDay(s.state, s.map);
    n++;
    dirty = true;
    daysSinceSave++;
    recordEvents(s, events);
    if (s.state.day % 30 === 0) recordStats(s);
    if (s.countryId && !s.state.countries[s.countryId]?.alive) { s.countryId = null; syncPresence(s); sendLobby(s); }
  }
  if (n) {
    sendState(s);
    if (daysSinceSave >= SAVE_EVERY_DAYS) void persist();
  }
}

// ------------------------------------------------------------------ peticiones (mismo contrato que los sockets del servidor)
type Reply = { ok: boolean; error?: string; [k: string]: unknown };

function handle(event: string, data: unknown): Reply {
  const s = save;
  if (!s) return { ok: false, error: 'No hay partida abierta.' };
  const d = (data ?? {}) as Record<string, unknown>;
  switch (event) {
    case 'command': {
      if (!s.countryId) return { ok: false, error: 'No gobierna ningún país.' };
      if (s.status !== 'running') return { ok: false, error: 'La partida aún no comenzó.' };
      const parsed = commandSchema.safeParse((d as { command?: unknown }).command);
      if (!parsed.success) return { ok: false, error: 'Comando mal formado.' };
      const { result, events } = applyCommand(s.state, s.map, s.countryId, parsed.data);
      dirty = true;
      recordEvents(s, events);
      sendState(s);
      void persist();
      return result as Reply;
    }
    case 'lobby:pick': {
      const id = (d.countryId as string | null) ?? null;
      if (id && !s.state.countries[id]?.alive) return { ok: false, error: 'País inexistente.' };
      s.countryId = id;
      s.ready = false;
      syncPresence(s);
      dirty = true;
      sendLobby(s);
      sendState(s);
      return { ok: true };
    }
    case 'lobby:ready': s.ready = !!d.ready; sendLobby(s); return { ok: true };
    case 'admin:start': {
      if (s.status !== 'lobby') return { ok: false, error: 'La partida ya comenzó.' };
      s.status = 'running';
      lastWall = Date.now();
      dirty = true;
      void persist();
      send('game:started', summary(s));
      sendLobby(s);
      sendState(s);
      return { ok: true };
    }
    case 'admin:settings': {
      const patch = d as Partial<GameSettings>;
      s.settings = { ...s.settings, ...patch, world: s.settings.world, maxPlayers: 1 };
      s.state.settings.advancedAI = s.settings.advancedAI;
      s.state.settings.warPrepDays = s.settings.warPrepDays;
      lastWall = Date.now();
      dirty = true;
      void persist();
      sendLobby(s);
      return { ok: true };
    }
    case 'admin:transfer':
    case 'admin:release':
      return { ok: false, error: 'No disponible en una partida local de un jugador.' };
    case 'chat:send': {
      const text = String(d.text ?? '').trim().slice(0, 600);
      if (!text) return { ok: true };
      const msg: ChatMessage = { id: `${Date.now()}-${chat.length}`, channel: String(d.channel ?? 'global'), playerId: PLAYER_ID, playerName: s.playerName, countryId: s.countryId, text, at: Date.now() };
      chat.push(msg);
      send('chat', msg);
      return { ok: true };
    }
    case 'request:projection': return { ok: true, projection: s.countryId ? projectCountry(s.state, s.map, s.countryId, 24) : null };
    case 'request:history': {
      const country = String(d.country ?? '');
      return { ok: true, stats: s.stats.filter((r) => r.country === country).map((r) => ({ day: r.day, data: r.data })) };
    }
    case 'request:events': {
      const before = typeof d.beforeDay === 'number' ? d.beforeDay : Infinity;
      const list = relevant(s, s.events).filter((e) => e.day < before).slice(-200).reverse();
      return { ok: true, events: list };
    }
    case 'request:state': sendState(s); return { ok: true };
    default: return { ok: false, error: `Acción desconocida: ${event}` };
  }
}

// ------------------------------------------------------------------ mensajes
self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  try {
    if (m.kind === 'open') {
      if (m.msPerDay && m.msPerDay >= 50) msPerDay = m.msPerDay;
      if (m.create) {
        send('progress', { text: 'Creando el mundo…' });
        save = await newGame(m.saveId, { ...DEFAULT_SETTINGS, ...m.create.settings, maxPlayers: 1, privacy: 'private' }, m.create.playerName, m.create.officialUrl);
        dirty = true;
        await persist();
      } else {
        save = await getSave(m.saveId);
        if (!save) { send('fatal', { error: 'La partida guardada no existe en este navegador.' }); return; }
        // el reloj continúa desde el último día guardado
        save.activeMs = Math.max(save.activeMs, save.state.day * msPerDay);
      }
      const s = save;
      syncPresence(s);
      lastWall = Date.now();
      send('init', {
        you: { playerId: PLAYER_ID, name: s.playerName, countryId: s.countryId, admin: true },
        game: summary(s), settings: s.settings, players: players(s), map: s.map, chat, ...payload(s)
      });
      if (s.status === 'running') send('game:started', summary(s));
      if (!clock) clock = setInterval(tick, 200);
    } else if (m.kind === 'request') {
      post({ kind: 'reply', id: m.id, data: handle(m.event, m.data) });
    } else if (m.kind === 'visible') {
      visible = m.visible;
      lastWall = Date.now();
      if (!visible) void persist();
    } else if (m.kind === 'close') {
      if (clock) clearInterval(clock);
      clock = null;
      await persist();
      post({ kind: 'reply', id: m.id, data: { ok: true } });
    }
  } catch (e) {
    if (m.kind === 'request' || m.kind === 'close') post({ kind: 'reply', id: m.id, data: { ok: false, error: (e as Error).message } });
    else send('fatal', { error: (e as Error).message });
  }
};
