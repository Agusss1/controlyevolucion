import { DEFAULT_SETTINGS, type GameSettings, type GameSummary } from '@cyo/shared';
import type { Store } from '../store/types.js';
import type { ServerConfig } from '../config.js';
import { GameInstance, type Transport } from './instance.js';
import { loadWorld } from './worlds.js';

export interface CreateGameInput {
  settings: Partial<GameSettings>;
  playerName: string;
  countryId?: string | null;
}

/** Administra las partidas: creación, carga bajo demanda, reloj global y descarga de partidas inactivas. */
export class GameManager {
  private games = new Map<string, GameInstance>();
  private loading = new Map<string, Promise<GameInstance | null>>();
  private timer: NodeJS.Timeout | null = null;
  private housekeepingTimer: NodeJS.Timeout | null = null;

  constructor(public store: Store, public config: ServerConfig, private transport: Transport) {}

  start(intervalMs = Math.min(250, Math.max(10, Math.floor(this.config.msPerDay / 4)))): void {
    this.timer = setInterval(() => { void this.tickAll(); }, intervalMs);
    this.housekeepingTimer = setInterval(() => { void this.housekeeping(); }, 60_000);
  }

  private stopped = false;
  private inFlight: Promise<void> = Promise.resolve();

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.housekeepingTimer) clearInterval(this.housekeepingTimer);
    await this.inFlight;
    for (const g of this.games.values()) { g.dispose(); await g.snapshot(); }
  }

  tickAll(): Promise<void> {
    if (this.stopped) return this.inFlight;
    this.inFlight = this.inFlight.then(async () => {
      for (const g of this.games.values()) {
        if (this.stopped) return;
        try { await g.tick(); } catch (e) { console.error(`[${g.id}] error en el reloj`, e); }
      }
    });
    return this.inFlight;
  }

  /** Carga en memoria las partidas en modo «siempre activo» (el mundo sigue sin jugadores). */
  async loadAlwaysOn(): Promise<void> {
    const rows = await this.store.listGames({ limit: 1000 });
    for (const r of rows) if (r.status === 'running' && r.settings.clockMode === 'always') await this.get(r.id);
  }

  loaded(id: string): GameInstance | undefined { return this.games.get(id); }

  async get(id: string): Promise<GameInstance | null> {
    const g = this.games.get(id);
    if (g) return g;
    const pending = this.loading.get(id);
    if (pending) return pending;
    const p = (async () => {
      const row = await this.store.getGame(id);
      if (!row) return null;
      const inst = await GameInstance.load(this.store, this.config, this.transport, row);
      this.games.set(id, inst);
      return inst;
    })();
    this.loading.set(id, p);
    try { return await p; } finally { this.loading.delete(id); }
  }

  async getByCode(code: string): Promise<GameInstance | null> {
    const row = await this.store.getGameByCode(code.trim().toUpperCase());
    return row ? this.get(row.id) : null;
  }

  async create(input: CreateGameInput): Promise<{ game: GameInstance; playerId: string; token: string }> {
    const s = input.settings;
    const settings: GameSettings = {
      ...DEFAULT_SETTINGS, ...s,
      name: (s.name ?? DEFAULT_SETTINGS.name).trim().slice(0, 60) || DEFAULT_SETTINGS.name,
      maxPlayers: Math.max(1, Math.min(64, Math.round(s.maxPlayers ?? DEFAULT_SETTINGS.maxPlayers))),
      world: { mode: s.world?.mode === 'random' ? 'random' : 'official', seed: s.world?.seed?.slice(0, 40), countries: s.world?.countries ? Math.max(40, Math.min(70, Math.round(s.world.countries))) : undefined },
      warGraceSeconds: Math.max(5, Math.min(600, s.warGraceSeconds ?? DEFAULT_SETTINGS.warGraceSeconds)),
      warPrepDays: Math.max(0, Math.min(30, s.warPrepDays ?? DEFAULT_SETTINGS.warPrepDays))
    };
    if (settings.world.mode === 'random' && !settings.world.seed) settings.world.seed = Math.random().toString(36).slice(2, 10);
    const world = loadWorld(settings.world.mode, settings.world.seed, settings.world.countries, settings.advancedAI, settings.warPrepDays);
    const game = await GameInstance.create(this.store, this.config, this.transport, settings, world);
    this.games.set(game.id, game);
    const { player, token } = await game.addPlayer(input.playerName, input.countryId ?? null);
    return { game, playerId: player.id, token };
  }

  async join(code: string, playerName: string, countryId: string | null): Promise<{ game: GameInstance; playerId: string; token: string }> {
    const game = await this.getByCode(code);
    if (!game) throw new Error('Código de partida inexistente.');
    if (game.row.status === 'ended') throw new Error('La partida terminó.');
    const { player, token } = await game.addPlayer(playerName, countryId);
    return { game, playerId: player.id, token };
  }

  async summaries(ids: string[]): Promise<GameSummary[]> {
    const rows = await this.store.listGames({ ids, limit: 200 });
    return rows.map((r) => this.games.get(r.id)?.summary() ?? {
      id: r.id, code: r.code, name: r.name, status: r.status, players: 0, maxPlayers: r.settings.maxPlayers, day: r.day,
      privacy: r.settings.privacy, worldName: r.settings.world.mode === 'official' ? 'Vereth (mundo oficial de CYO)' : `Mundo aleatorio ${r.settings.world.seed ?? ''}`, clockMode: r.settings.clockMode, createdAt: r.createdAt
    });
  }

  async publicGames(): Promise<GameSummary[]> {
    const rows = await this.store.listGames({ publicOnly: true, limit: 50 });
    return this.summaries(rows.map((r) => r.id));
  }

  /** Descarga partidas sin jugadores y purga salas de espera abandonadas. */
  async housekeeping(now = Date.now()): Promise<void> {
    for (const [id, g] of this.games) {
      if (g.anyoneConnected() || g.row.settings.clockMode === 'always') continue;
      if (now - g.lastActivity > this.config.unloadAfterMinutes * 60_000) {
        await g.snapshot();
        g.dispose();
        this.games.delete(id);
      }
    }
    const rows = await this.store.listGames({ limit: 1000 });
    for (const r of rows) {
      if (r.status === 'lobby' && now - r.updatedAt > this.config.purgeLobbyAfterDays * 86_400_000 && !this.games.get(r.id)?.anyoneConnected()) {
        this.games.delete(r.id);
        await this.store.deleteGame(r.id);
      }
    }
  }

  async unload(id: string): Promise<void> {
    const g = this.games.get(id);
    if (!g) return;
    await g.snapshot();
    g.dispose();
    this.games.delete(id);
  }

  /** Simula una caída del servidor: descarta la partida en memoria sin guardar instantánea. */
  dropWithoutSaving(id: string): void { this.games.get(id)?.dispose(); this.games.delete(id); }
}
