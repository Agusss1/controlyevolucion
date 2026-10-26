import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  commandSchema, formatDate, type WorldMap, type WorldState, type GameSettings, type LobbyPlayer, type GameSummary, type CommandResult, type GameEvent, type ChatMessage, type Command
} from '@cyo/shared';
import { runDay, applyCommand, applySystemCommand, buildWorldView, buildPrivateView, projectCountry, totalRevenue, nominalGDP, population, type SystemCommand } from '@cyo/simulation';
import type { Store, GameRow, PlayerRow } from '../store/types.js';
import type { ServerConfig } from '../config.js';

export interface Transport {
  send(playerId: string, event: string, data: unknown): void;
  broadcast(gameId: string, event: string, data: unknown): void;
}

export function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function newToken(): string { return randomBytes(24).toString('base64url'); }
export function newCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
export function stateHash(state: WorldState): string { return createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0, 16); }

/**
 * Una partida cargada en memoria. Mantiene el estado autoritativo, el reloj, la presencia de los
 * jugadores, el registro de comandos (para recuperación y reproducción determinista) y las
 * instantáneas periódicas.
 */
export class GameInstance {
  row: GameRow;
  map: WorldMap;
  state: WorldState;
  players = new Map<string, PlayerRow>();
  /** sockets conectados por jugador */
  connections = new Map<string, number>();
  /** jugadores desconectados durante el período de gracia (siguen contando como presentes) */
  graceUntil = new Map<string, number>();
  private lastWall = Date.now();
  private busy = false;
  private daysSinceSnapshot = 0;
  lastActivity = Date.now();
  private pendingCommands: Promise<unknown> = Promise.resolve();
  private timers = new Set<NodeJS.Timeout>();
  private disposed = false;

  /** Libera temporizadores (al descargar la partida o apagar el servidor). */
  dispose(): void {
    this.disposed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  constructor(private store: Store, private config: ServerConfig, private transport: Transport, row: GameRow, map: WorldMap, state: WorldState, players: PlayerRow[]) {
    this.row = row;
    this.map = map;
    this.state = state;
    for (const p of players) this.players.set(p.id, p);
  }

  get id(): string { return this.row.id; }

  // ------------------------------------------------------------------ creación y carga
  static async create(store: Store, config: ServerConfig, transport: Transport, settings: GameSettings, world: { map: WorldMap; state: WorldState }): Promise<GameInstance> {
    const now = Date.now();
    let code = newCode();
    while (await store.getGameByCode(code)) code = newCode();
    const row: GameRow = { id: randomUUID(), code, name: settings.name, status: 'lobby', settings, adminPlayerId: null, createdAt: now, updatedAt: now, day: 0, activeMs: 0, lastActiveAt: now, lastSeq: 0 };
    await store.createGame(row, gzipSync(JSON.stringify(world.map)));
    await store.saveSnapshot(row.id, 0, 0, gzipSync(JSON.stringify(world.state)));
    return new GameInstance(store, config, transport, row, world.map, world.state, []);
  }

  /** Carga desde la base: última instantánea + reproducción de comandos y días posteriores. */
  static async load(store: Store, config: ServerConfig, transport: Transport, row: GameRow): Promise<GameInstance> {
    const mapGz = await store.getMap(row.id);
    const snap = await store.latestSnapshot(row.id);
    if (!mapGz || !snap) throw new Error('Partida sin datos persistidos');
    const map = JSON.parse(gunzipSync(mapGz).toString('utf8')) as WorldMap;
    const state = JSON.parse(gunzipSync(snap.state).toString('utf8')) as WorldState;
    const players = await store.getPlayers(row.id);
    const inst = new GameInstance(store, config, transport, row, map, state, players);
    const cmds = await store.commandsAfter(row.id, snap.seq);
    for (const c of cmds) {
      while (inst.state.day < c.day) runDay(inst.state, map);
      if (c.kind === 'system') applySystemCommand(inst.state, c.payload as SystemCommand);
      else applyCommand(inst.state, map, c.countryId!, c.payload as Command);
    }
    while (inst.state.day < row.day) runDay(inst.state, map);
    inst.row.lastSeq = Math.max(row.lastSeq, cmds.length ? cmds[cmds.length - 1].seq : snap.seq);
    // nadie está conectado tras un reinicio
    const presence = inst.computePresence();
    if (inst.state.onlineCountries.length || JSON.stringify(presence.human) !== JSON.stringify(inst.state.humanCountries)) await inst.logSystem({ type: 'presence', human: presence.human, online: [] });
    // modo «siempre activo»: recuperar el tiempo transcurrido con el servidor apagado (con tope)
    if (row.status === 'running' && row.settings.clockMode === 'always') {
      const missed = Math.min(Date.now() - row.lastActiveAt, config.maxCatchUpDays * config.msPerDay);
      if (missed > 0) inst.row.activeMs += missed;
    }
    await inst.snapshot();
    return inst;
  }

  // ------------------------------------------------------------------ jugadores
  summary(): GameSummary {
    return {
      id: this.row.id, code: this.row.code, name: this.row.name, status: this.row.status, players: this.players.size, maxPlayers: this.row.settings.maxPlayers,
      day: this.state.day, privacy: this.row.settings.privacy, worldName: this.state.scenario.name, clockMode: this.row.settings.clockMode, createdAt: this.row.createdAt
    };
  }

  lobbyPlayers(): LobbyPlayer[] {
    return [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, countryId: p.countryId, ready: p.ready, role: p.id === this.row.adminPlayerId ? 'admin' : 'player',
      online: (this.connections.get(p.id) ?? 0) > 0, lastSeen: p.lastSeen
    }));
  }

  async addPlayer(name: string, countryId: string | null): Promise<{ player: PlayerRow; token: string }> {
    if (this.players.size >= this.row.settings.maxPlayers) throw new Error('La partida está completa.');
    const clean = name.trim().slice(0, 32);
    if (clean.length < 2) throw new Error('Nombre demasiado corto.');
    if (countryId) this.assertCountryFree(countryId, null);
    const token = newToken();
    const now = Date.now();
    const player: PlayerRow = { id: randomUUID(), gameId: this.id, name: clean, tokenHash: hashToken(token), countryId, ready: false, role: this.row.adminPlayerId ? 'player' : 'admin', createdAt: now, lastSeen: now };
    await this.store.addPlayer(player);
    this.players.set(player.id, player);
    if (!this.row.adminPlayerId) { this.row.adminPlayerId = player.id; await this.store.updateGame(this.id, { adminPlayerId: player.id }); }
    await this.syncPresence();
    this.broadcastLobby();
    return { player, token };
  }

  authenticate(playerId: string, token: string): PlayerRow | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const a = Buffer.from(p.tokenHash, 'hex'), b = Buffer.from(hashToken(token), 'hex');
    return a.length === b.length && a.equals(b) ? p : null;
  }

  assertCountryFree(countryId: string, playerId: string | null): void {
    const c = this.state.countries[countryId];
    if (!c || !c.alive) throw new Error('País inexistente.');
    for (const p of this.players.values()) if (p.countryId === countryId && p.id !== playerId) throw new Error(`${c.name} ya tiene gobernante humano.`);
  }

  async pickCountry(playerId: string, countryId: string | null): Promise<void> {
    const p = this.players.get(playerId);
    if (!p) throw new Error('Jugador inexistente.');
    if (countryId) this.assertCountryFree(countryId, playerId);
    p.countryId = countryId;
    p.ready = false;
    await this.store.updatePlayer(p.id, { countryId, ready: false });
    await this.syncPresence();
    this.broadcastLobby();
  }

  async setReady(playerId: string, ready: boolean): Promise<void> {
    const p = this.players.get(playerId);
    if (!p) return;
    p.ready = ready;
    await this.store.updatePlayer(p.id, { ready });
    this.broadcastLobby();
  }

  isAdmin(playerId: string): boolean { return this.row.adminPlayerId === playerId; }

  async start(playerId: string): Promise<void> {
    if (!this.isAdmin(playerId)) throw new Error('Solo el administrador puede comenzar.');
    if (this.row.status !== 'lobby') throw new Error('La partida ya comenzó.');
    this.row.status = 'running';
    this.lastWall = Date.now();
    await this.store.updateGame(this.id, { status: 'running', updatedAt: Date.now() });
    this.transport.broadcast(this.id, 'game:started', this.summary());
    this.broadcastLobby();
    this.broadcastState();
  }

  async updateSettings(playerId: string, patch: Partial<GameSettings>): Promise<void> {
    if (!this.isAdmin(playerId)) throw new Error('Solo el administrador puede cambiar la configuración.');
    const next = { ...this.row.settings, ...patch, world: this.row.settings.world };
    if (patch.maxPlayers !== undefined) next.maxPlayers = Math.max(this.players.size, Math.min(64, Math.round(patch.maxPlayers)));
    this.row.settings = next;
    this.state.settings.advancedAI = next.advancedAI;
    this.state.settings.warPrepDays = next.warPrepDays;
    await this.store.updateGame(this.id, { settings: next });
    this.broadcastLobby();
  }

  async transferAdmin(playerId: string, to: string): Promise<void> {
    if (!this.isAdmin(playerId)) throw new Error('Solo el administrador puede transferir la administración.');
    if (!this.players.has(to)) throw new Error('Jugador inexistente.');
    this.row.adminPlayerId = to;
    await this.store.updateGame(this.id, { adminPlayerId: to });
    this.broadcastLobby();
  }

  /** Libera el país de un jugador (abandono o expulsión): el país vuelve a la IA. */
  async releaseCountry(playerId: string, target: string): Promise<void> {
    if (!this.isAdmin(playerId) && playerId !== target) throw new Error('Sin permiso.');
    const p = this.players.get(target);
    if (!p) throw new Error('Jugador inexistente.');
    p.countryId = null;
    await this.store.updatePlayer(p.id, { countryId: null });
    await this.syncPresence();
    this.broadcastLobby();
  }

  // ------------------------------------------------------------------ presencia (regla de guerras sincronizadas)
  computePresence(): { human: string[]; online: string[] } {
    const human: string[] = [], online: string[] = [];
    const now = Date.now();
    for (const p of this.players.values()) {
      if (!p.countryId || !this.state.countries[p.countryId]?.alive) continue;
      human.push(p.countryId);
      if ((this.connections.get(p.id) ?? 0) > 0 || (this.graceUntil.get(p.id) ?? 0) > now) online.push(p.countryId);
    }
    return { human: [...new Set(human)].sort(), online: [...new Set(online)].sort() };
  }

  async syncPresence(): Promise<void> {
    const pr = this.computePresence();
    if (JSON.stringify(pr.human) === JSON.stringify(this.state.humanCountries) && JSON.stringify(pr.online) === JSON.stringify(this.state.onlineCountries)) return;
    await this.logSystem({ type: 'presence', human: pr.human, online: pr.online });
  }

  private async logSystem(cmd: SystemCommand): Promise<void> {
    applySystemCommand(this.state, cmd);
    this.row.lastSeq += 1;
    await this.store.appendCommand({ gameId: this.id, seq: this.row.lastSeq, day: this.state.day, countryId: null, playerId: null, commandId: `sys-${randomUUID()}`, kind: 'system', payload: cmd, result: null, createdAt: Date.now() });
  }

  async connect(playerId: string): Promise<void> {
    this.connections.set(playerId, (this.connections.get(playerId) ?? 0) + 1);
    this.graceUntil.delete(playerId);
    const p = this.players.get(playerId);
    if (p) { p.lastSeen = Date.now(); await this.store.updatePlayer(p.id, { lastSeen: p.lastSeen }); }
    this.lastActivity = Date.now();
    await this.syncPresence();
    this.broadcastLobby();
  }

  async disconnect(playerId: string): Promise<void> {
    const n = (this.connections.get(playerId) ?? 1) - 1;
    if (n > 0) { this.connections.set(playerId, n); return; }
    this.connections.delete(playerId);
    const p = this.players.get(playerId);
    if (p) { p.lastSeen = Date.now(); await this.store.updatePlayer(p.id, { lastSeen: p.lastSeen }); }
    // ventana de reconexión: el jugador sigue «presente» unos segundos
    const grace = this.row.settings.warGraceSeconds * 1000;
    this.graceUntil.set(playerId, Date.now() + grace);
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (this.disposed) return;
      void this.syncPresence().then(() => this.broadcastLobby()).catch((e) => console.error('presencia', e));
    }, grace + 50);
    t.unref?.();
    this.timers.add(t);
    this.broadcastLobby();
  }

  anyoneConnected(): boolean { for (const n of this.connections.values()) if (n > 0) return true; return false; }

  // ------------------------------------------------------------------ comandos
  async command(playerId: string, envelope: { commandId: string; command: unknown }): Promise<CommandResult> {
    // serializa los comandos de la partida para que el registro sea totalmente ordenado
    const run = this.pendingCommands.then(() => this.commandInner(playerId, envelope));
    this.pendingCommands = run.catch(() => undefined);
    return run;
  }

  private async commandInner(playerId: string, envelope: { commandId: string; command: unknown }): Promise<CommandResult> {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, error: 'Jugador inexistente.' };
    if (!p.countryId) return { ok: false, error: 'No gobierna ningún país.' };
    if (this.row.status === 'lobby') return { ok: false, error: 'La partida aún no comenzó.' };
    if (typeof envelope?.commandId !== 'string' || envelope.commandId.length < 8 || envelope.commandId.length > 64) return { ok: false, error: 'Identificador de comando inválido.' };
    // idempotencia: un comando repetido (p. ej. tras reconexión) devuelve el resultado original
    const prev = await this.store.getCommand(this.id, envelope.commandId);
    if (prev) return { ...(prev.result as CommandResult), message: 'duplicado' };
    const parsed = commandSchema.safeParse(envelope.command);
    if (!parsed.success) return { ok: false, error: 'Comando mal formado.' };
    const { result, events } = applyCommand(this.state, this.map, p.countryId, parsed.data);
    this.row.lastSeq += 1;
    await this.store.appendCommand({ gameId: this.id, seq: this.row.lastSeq, day: this.state.day, countryId: p.countryId, playerId, commandId: envelope.commandId, kind: 'player', payload: parsed.data, result, createdAt: Date.now() });
    if (events.length) await this.persistEvents(events);
    this.lastActivity = Date.now();
    this.sendStateTo(playerId);
    return result;
  }

  // ------------------------------------------------------------------ reloj
  /** Llamado periódicamente: avanza los días que correspondan según el modo de reloj. */
  async tick(now = Date.now()): Promise<number> {
    if (this.busy) return 0;
    const elapsed = now - this.lastWall;
    this.lastWall = now;
    if (this.row.status !== 'running') return 0;
    const mode = this.row.settings.clockMode;
    const active = mode === 'always' || (mode === 'when_online' && this.anyoneConnected());
    if (!active) return 0;
    this.row.activeMs += Math.max(0, elapsed);
    this.row.lastActiveAt = now;
    const target = Math.floor(this.row.activeMs / this.config.msPerDay);
    let ran = 0;
    if (target > this.state.day) {
      this.busy = true;
      try {
        await this.pendingCommands;
        const toRun = Math.min(target - this.state.day, 30);
        for (let i = 0; i < toRun; i++) { await this.advanceOneDay(); ran++; }
      } finally { this.busy = false; }
    }
    return ran;
  }

  /** Avanza un día (también usado por las pruebas y la recuperación). */
  async advanceOneDay(): Promise<void> {
    await this.syncPresence();
    const { events } = runDay(this.state, this.map);
    this.row.day = this.state.day;
    await this.store.updateGame(this.id, { day: this.state.day, activeMs: this.row.activeMs, lastActiveAt: this.row.lastActiveAt, lastSeq: this.row.lastSeq, updatedAt: Date.now() });
    if (events.length) await this.persistEvents(events);
    if (this.state.day % 30 === 0) await this.persistStats();
    this.daysSinceSnapshot++;
    if (this.daysSinceSnapshot >= this.config.snapshotEveryDays) await this.snapshot();
    // si un país humano desapareció, su jugador queda sin país
    for (const p of this.players.values()) if (p.countryId && !this.state.countries[p.countryId]?.alive) { p.countryId = null; await this.store.updatePlayer(p.id, { countryId: null }); }
    this.broadcastState(events);
  }

  async snapshot(): Promise<void> {
    await this.pendingCommands;
    await this.store.saveSnapshot(this.id, this.state.day, this.row.lastSeq, gzipSync(JSON.stringify(this.state)));
    await this.store.updateGame(this.id, { day: this.state.day, activeMs: this.row.activeMs, lastActiveAt: this.row.lastActiveAt, lastSeq: this.row.lastSeq });
    await this.store.pruneSnapshots(this.id, 3);
    this.daysSinceSnapshot = 0;
  }

  private async persistEvents(events: GameEvent[]): Promise<void> {
    await this.store.appendEvents(events.map((e) => ({ gameId: this.id, day: e.day, type: e.type, scope: e.scope, countries: e.countries, data: e })));
  }

  private async persistStats(): Promise<void> {
    const rows = Object.values(this.state.countries).filter((c) => c.alive).map((c) => {
      const ng = nominalGDP(c);
      return {
        countryId: c.id, data: {
          gdp: c.econ.realGDP, growth: c.econ.growth, inflation: c.econ.inflation, unemployment: c.econ.unemployment, population: population(c),
          debt: (c.fiscal.debtDomestic + c.fiscal.debtForeign * c.econ.exchangeRate) / Math.max(1e-6, ng), revenue: totalRevenue(c.fiscal.revenue) / Math.max(1e-6, ng),
          approval: c.politics.approval, stability: c.politics.stability, legitimacy: c.politics.legitimacy, regime: c.regime, techs: c.tech.known.length
        }
      };
    });
    await this.store.appendStats(this.id, this.state.day, rows);
  }

  // ------------------------------------------------------------------ difusión
  playerPayload(playerId: string) {
    const p = this.players.get(playerId);
    const country = p?.countryId ?? null;
    return { day: this.state.day, date: formatDate(this.state.day), view: buildWorldView(this.state, this.map, country), private: country ? buildPrivateView(this.state, this.map, country) : null };
  }

  sendStateTo(playerId: string): void { this.transport.send(playerId, 'state', this.playerPayload(playerId)); }

  broadcastState(events: GameEvent[] = []): void {
    for (const [pid, n] of this.connections) if (n > 0) {
      this.sendStateTo(pid);
      const p = this.players.get(pid);
      const mine = events.filter((e) => e.scope === 'world' || (p?.countryId && e.countries.includes(p.countryId)));
      if (mine.length) this.transport.send(pid, 'events', mine);
    }
  }

  broadcastLobby(): void { this.transport.broadcast(this.id, 'lobby', { game: this.summary(), settings: this.row.settings, players: this.lobbyPlayers(), admin: this.row.adminPlayerId }); }

  projection(playerId: string) {
    const p = this.players.get(playerId);
    if (!p?.countryId) return null;
    return projectCountry(this.state, this.map, p.countryId, 24);
  }

  async chat(playerId: string, channel: string, text: string): Promise<ChatMessage | null> {
    const p = this.players.get(playerId);
    if (!p) return null;
    const clean = text.trim().slice(0, 600);
    if (!clean) return null;
    if (!this.canUseChannel(p, channel)) throw new Error('Canal no permitido.');
    const msg: ChatMessage = { id: randomUUID(), channel, playerId, playerName: p.name, countryId: p.countryId, text: clean, at: Date.now() };
    await this.store.appendChat({ ...msg, gameId: this.id });
    for (const [pid] of this.connections) { const q = this.players.get(pid); if (q && this.canUseChannel(q, channel)) this.transport.send(pid, 'chat', msg); }
    return msg;
  }

  /** global: todos; war:<id>: participantes; dm:<A>|<B>: los dos gobiernos. */
  canUseChannel(p: PlayerRow, channel: string): boolean {
    if (channel === 'global') return true;
    if (channel.startsWith('war:')) {
      const w = this.state.wars[channel.slice(4)];
      return !!w && !!p.countryId && (w.participants.some((x) => x.country === p.countryId) || w.callsToArms.some((x) => x.country === p.countryId));
    }
    if (channel.startsWith('dm:')) {
      const [a, b] = channel.slice(3).split('|');
      return !!p.countryId && (p.countryId === a || p.countryId === b) && a < b;
    }
    return false;
  }

  channelsFor(p: PlayerRow): string[] {
    const ch = ['global'];
    if (p.countryId) {
      for (const w of Object.values(this.state.wars)) if (w.participants.some((x) => x.country === p.countryId)) ch.push(`war:${w.id}`);
      for (const c of Object.keys(this.state.countries)) if (c !== p.countryId) ch.push(`dm:${[c, p.countryId].sort().join('|')}`);
    }
    return ch;
  }
}
