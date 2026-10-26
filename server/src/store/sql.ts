import pg from 'pg';
import type { Store, GameRow, PlayerRow, CommandRow, EventRow, ChatRow } from './types.js';

/**
 * Implementación SQL compartida. El dialecto cambia la forma de los parámetros ($1 vs ?) y
 * los tipos binarios (BYTEA vs BLOB). Todo el JSON se guarda como texto.
 */

const SCHEMA = (blob: string, bigint: string) => [
  `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)`,
  `CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, settings TEXT NOT NULL,
    admin_player_id TEXT, created_at ${bigint} NOT NULL, updated_at ${bigint} NOT NULL, day INTEGER NOT NULL DEFAULT 0,
    active_ms ${bigint} NOT NULL DEFAULT 0, last_active_at ${bigint} NOT NULL DEFAULT 0, last_seq INTEGER NOT NULL DEFAULT 0, map ${blob} NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE, name TEXT NOT NULL, token_hash TEXT NOT NULL,
    country_id TEXT, ready INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL, created_at ${bigint} NOT NULL, last_seen ${bigint} NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS players_game ON players(game_id)`,
  `CREATE TABLE IF NOT EXISTS snapshots (
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE, day INTEGER NOT NULL, seq INTEGER NOT NULL, state ${blob} NOT NULL, created_at ${bigint} NOT NULL,
    PRIMARY KEY (game_id, day, seq))`,
  `CREATE TABLE IF NOT EXISTS commands (
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE, seq INTEGER NOT NULL, day INTEGER NOT NULL, country_id TEXT, player_id TEXT,
    command_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, result TEXT, created_at ${bigint} NOT NULL,
    PRIMARY KEY (game_id, seq), UNIQUE (game_id, command_id))`,
  `CREATE TABLE IF NOT EXISTS events (
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE, day INTEGER NOT NULL, type TEXT NOT NULL, scope TEXT NOT NULL, countries TEXT NOT NULL, data TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS events_game_day ON events(game_id, day)`,
  `CREATE TABLE IF NOT EXISTS country_stats (
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE, day INTEGER NOT NULL, country_id TEXT NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY (game_id, country_id, day))`,
  `CREATE TABLE IF NOT EXISTS chat (
    id TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE, channel TEXT NOT NULL, player_id TEXT NOT NULL, player_name TEXT NOT NULL,
    country_id TEXT, text TEXT NOT NULL, at ${bigint} NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS chat_game_channel ON chat(game_id, channel, at)`
];

interface Exec {
  run(sql: string, params?: unknown[]): Promise<void>;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  tx(fn: () => Promise<void>): Promise<void>;
  close(): Promise<void>;
  param(i: number): string;
}

const gameCols = 'id, code, name, status, settings, admin_player_id, created_at, updated_at, day, active_ms, last_active_at, last_seq';

function toGame(r: Record<string, unknown>): GameRow {
  return {
    id: String(r.id), code: String(r.code), name: String(r.name), status: r.status as GameRow['status'], settings: JSON.parse(String(r.settings)),
    adminPlayerId: (r.admin_player_id as string) ?? null, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at), day: Number(r.day),
    activeMs: Number(r.active_ms), lastActiveAt: Number(r.last_active_at), lastSeq: Number(r.last_seq)
  };
}
function toPlayer(r: Record<string, unknown>): PlayerRow {
  return {
    id: String(r.id), gameId: String(r.game_id), name: String(r.name), tokenHash: String(r.token_hash), countryId: (r.country_id as string) ?? null,
    ready: Number(r.ready) === 1 || r.ready === true, role: r.role as PlayerRow['role'], createdAt: Number(r.created_at), lastSeen: Number(r.last_seen)
  };
}
function toBuffer(v: unknown): Buffer {
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v);
  return Buffer.from(v as ArrayBuffer);
}

const GAME_FIELDS: Record<string, string> = {
  code: 'code', name: 'name', status: 'status', settings: 'settings', adminPlayerId: 'admin_player_id', createdAt: 'created_at', updatedAt: 'updated_at',
  day: 'day', activeMs: 'active_ms', lastActiveAt: 'last_active_at', lastSeq: 'last_seq'
};
const PLAYER_FIELDS: Record<string, string> = { name: 'name', tokenHash: 'token_hash', countryId: 'country_id', ready: 'ready', role: 'role', createdAt: 'created_at', lastSeen: 'last_seen' };

export class SqlStore implements Store {
  constructor(public readonly kind: 'postgres' | 'sqlite', private db: Exec) {}

  async init(): Promise<void> {
    const stmts = this.kind === 'postgres' ? SCHEMA('BYTEA', 'BIGINT') : SCHEMA('BLOB', 'INTEGER');
    for (const s of stmts) await this.db.run(s);
    const v = await this.db.all<{ version: number }>('SELECT version FROM schema_version');
    if (!v.length) await this.db.run(`INSERT INTO schema_version (version) VALUES (${this.db.param(1)})`, [1]);
  }
  close(): Promise<void> { return this.db.close(); }
  private p(n: number): string[] { return Array.from({ length: n }, (_, i) => this.db.param(i + 1)); }

  async createGame(row: GameRow, mapGz: Buffer): Promise<void> {
    const ps = this.p(13);
    await this.db.run(`INSERT INTO games (${gameCols}, map) VALUES (${ps.join(',')})`, [
      row.id, row.code, row.name, row.status, JSON.stringify(row.settings), row.adminPlayerId, row.createdAt, row.updatedAt, row.day, row.activeMs, row.lastActiveAt, row.lastSeq, mapGz
    ]);
  }
  async getGame(id: string): Promise<GameRow | null> {
    const r = await this.db.all(`SELECT ${gameCols} FROM games WHERE id = ${this.db.param(1)}`, [id]);
    return r[0] ? toGame(r[0]) : null;
  }
  async getGameByCode(code: string): Promise<GameRow | null> {
    const r = await this.db.all(`SELECT ${gameCols} FROM games WHERE code = ${this.db.param(1)}`, [code.toUpperCase()]);
    return r[0] ? toGame(r[0]) : null;
  }
  async listGames(opts: { publicOnly?: boolean; ids?: string[]; limit?: number }): Promise<GameRow[]> {
    const rows = await this.db.all(`SELECT ${gameCols} FROM games ORDER BY updated_at DESC`);
    let games = rows.map(toGame);
    if (opts.ids) games = games.filter((g) => opts.ids!.includes(g.id));
    if (opts.publicOnly) games = games.filter((g) => g.settings.privacy === 'public' && g.status !== 'ended');
    return games.slice(0, opts.limit ?? 100);
  }
  async updateGame(id: string, patch: Partial<Omit<GameRow, 'id'>>): Promise<void> {
    const keys = Object.keys(patch).filter((k) => GAME_FIELDS[k]);
    if (!keys.length) return;
    const vals = keys.map((k) => (k === 'settings' ? JSON.stringify((patch as Record<string, unknown>)[k]) : (patch as Record<string, unknown>)[k]));
    const sets = keys.map((k, i) => `${GAME_FIELDS[k]} = ${this.db.param(i + 1)}`).join(', ');
    await this.db.run(`UPDATE games SET ${sets} WHERE id = ${this.db.param(keys.length + 1)}`, [...vals, id]);
  }
  async deleteGame(id: string): Promise<void> {
    for (const t of ['chat', 'country_stats', 'events', 'commands', 'snapshots', 'players']) await this.db.run(`DELETE FROM ${t} WHERE game_id = ${this.db.param(1)}`, [id]);
    await this.db.run(`DELETE FROM games WHERE id = ${this.db.param(1)}`, [id]);
  }
  async getMap(gameId: string): Promise<Buffer | null> {
    const r = await this.db.all<{ map: unknown }>(`SELECT map FROM games WHERE id = ${this.db.param(1)}`, [gameId]);
    return r[0] ? toBuffer(r[0].map) : null;
  }
  async addPlayer(row: PlayerRow): Promise<void> {
    await this.db.run(`INSERT INTO players (id, game_id, name, token_hash, country_id, ready, role, created_at, last_seen) VALUES (${this.p(9).join(',')})`,
      [row.id, row.gameId, row.name, row.tokenHash, row.countryId, row.ready ? 1 : 0, row.role, row.createdAt, row.lastSeen]);
  }
  async updatePlayer(id: string, patch: Partial<Omit<PlayerRow, 'id' | 'gameId'>>): Promise<void> {
    const keys = Object.keys(patch).filter((k) => PLAYER_FIELDS[k]);
    if (!keys.length) return;
    const vals = keys.map((k) => (k === 'ready' ? ((patch as Record<string, unknown>)[k] ? 1 : 0) : (patch as Record<string, unknown>)[k]));
    const sets = keys.map((k, i) => `${PLAYER_FIELDS[k]} = ${this.db.param(i + 1)}`).join(', ');
    await this.db.run(`UPDATE players SET ${sets} WHERE id = ${this.db.param(keys.length + 1)}`, [...vals, id]);
  }
  async getPlayers(gameId: string): Promise<PlayerRow[]> {
    const r = await this.db.all(`SELECT * FROM players WHERE game_id = ${this.db.param(1)} ORDER BY created_at`, [gameId]);
    return r.map(toPlayer);
  }
  async saveSnapshot(gameId: string, day: number, seq: number, stateGz: Buffer): Promise<void> {
    await this.db.tx(async () => {
      await this.db.run(`DELETE FROM snapshots WHERE game_id = ${this.db.param(1)} AND day = ${this.db.param(2)} AND seq = ${this.db.param(3)}`, [gameId, day, seq]);
      await this.db.run(`INSERT INTO snapshots (game_id, day, seq, state, created_at) VALUES (${this.p(5).join(',')})`, [gameId, day, seq, stateGz, Date.now()]);
    });
  }
  async latestSnapshot(gameId: string): Promise<{ day: number; seq: number; state: Buffer } | null> {
    const r = await this.db.all<{ day: number; seq: number; state: unknown }>(`SELECT day, seq, state FROM snapshots WHERE game_id = ${this.db.param(1)} ORDER BY seq DESC, day DESC LIMIT 1`, [gameId]);
    return r[0] ? { day: Number(r[0].day), seq: Number(r[0].seq), state: toBuffer(r[0].state) } : null;
  }
  async pruneSnapshots(gameId: string, keep: number): Promise<void> {
    const r = await this.db.all<{ day: number; seq: number }>(`SELECT day, seq FROM snapshots WHERE game_id = ${this.db.param(1)} ORDER BY seq DESC, day DESC`, [gameId]);
    // conservar los más recientes y uno por cada año de juego (historia recuperable)
    const keepSet = new Set<string>();
    r.slice(0, keep).forEach((x) => keepSet.add(`${x.day}:${x.seq}`));
    const years = new Set<number>();
    for (const x of r) { const y = Math.floor(Number(x.day) / 360); if (!years.has(y)) { years.add(y); keepSet.add(`${x.day}:${x.seq}`); } }
    for (const x of r) if (!keepSet.has(`${x.day}:${x.seq}`)) await this.db.run(`DELETE FROM snapshots WHERE game_id = ${this.db.param(1)} AND day = ${this.db.param(2)} AND seq = ${this.db.param(3)}`, [gameId, x.day, x.seq]);
  }
  async appendCommand(row: CommandRow): Promise<void> {
    await this.db.run(`INSERT INTO commands (game_id, seq, day, country_id, player_id, command_id, kind, payload, result, created_at) VALUES (${this.p(10).join(',')})`,
      [row.gameId, row.seq, row.day, row.countryId, row.playerId, row.commandId, row.kind, JSON.stringify(row.payload), JSON.stringify(row.result ?? null), row.createdAt]);
  }
  private toCommand(r: Record<string, unknown>): CommandRow {
    return { gameId: String(r.game_id), seq: Number(r.seq), day: Number(r.day), countryId: (r.country_id as string) ?? null, playerId: (r.player_id as string) ?? null, commandId: String(r.command_id), kind: r.kind as CommandRow['kind'], payload: JSON.parse(String(r.payload)), result: r.result ? JSON.parse(String(r.result)) : null, createdAt: Number(r.created_at) };
  }
  async getCommand(gameId: string, commandId: string): Promise<CommandRow | null> {
    const r = await this.db.all(`SELECT * FROM commands WHERE game_id = ${this.db.param(1)} AND command_id = ${this.db.param(2)}`, [gameId, commandId]);
    return r[0] ? this.toCommand(r[0]) : null;
  }
  async commandsAfter(gameId: string, seq: number): Promise<CommandRow[]> {
    const r = await this.db.all(`SELECT * FROM commands WHERE game_id = ${this.db.param(1)} AND seq > ${this.db.param(2)} ORDER BY seq`, [gameId, seq]);
    return r.map((x) => this.toCommand(x));
  }
  async appendEvents(rows: EventRow[]): Promise<void> {
    if (!rows.length) return;
    await this.db.tx(async () => {
      for (const e of rows) await this.db.run(`INSERT INTO events (game_id, day, type, scope, countries, data) VALUES (${this.p(6).join(',')})`, [e.gameId, e.day, e.type, e.scope, JSON.stringify(e.countries), JSON.stringify(e.data)]);
    });
  }
  async listEvents(gameId: string, opts: { country?: string; limit?: number; beforeDay?: number; scope?: string[] }): Promise<EventRow[]> {
    const r = await this.db.all(`SELECT * FROM events WHERE game_id = ${this.db.param(1)} AND day < ${this.db.param(2)} ORDER BY day DESC LIMIT ${Math.min(2000, (opts.limit ?? 200) * 4)}`, [gameId, opts.beforeDay ?? 1e9]);
    let rows = r.map((x) => ({ gameId, day: Number(x.day), type: String(x.type), scope: String(x.scope), countries: JSON.parse(String(x.countries)) as string[], data: JSON.parse(String(x.data)) }));
    rows = rows.filter((e) => (opts.scope ? opts.scope.includes(e.scope) || (opts.country && e.countries.includes(opts.country)) : true) && (!opts.country || e.scope === 'world' || e.countries.includes(opts.country)));
    return rows.slice(0, opts.limit ?? 200);
  }
  async appendStats(gameId: string, day: number, rows: { countryId: string; data: unknown }[]): Promise<void> {
    await this.db.tx(async () => {
      for (const r of rows) {
        await this.db.run(`DELETE FROM country_stats WHERE game_id = ${this.db.param(1)} AND country_id = ${this.db.param(2)} AND day = ${this.db.param(3)}`, [gameId, r.countryId, day]);
        await this.db.run(`INSERT INTO country_stats (game_id, day, country_id, data) VALUES (${this.p(4).join(',')})`, [gameId, day, r.countryId, JSON.stringify(r.data)]);
      }
    });
  }
  async listStats(gameId: string, countryId: string): Promise<{ day: number; data: unknown }[]> {
    const r = await this.db.all(`SELECT day, data FROM country_stats WHERE game_id = ${this.db.param(1)} AND country_id = ${this.db.param(2)} ORDER BY day`, [gameId, countryId]);
    return r.map((x) => ({ day: Number(x.day), data: JSON.parse(String(x.data)) }));
  }
  async appendChat(row: ChatRow): Promise<void> {
    await this.db.run(`INSERT INTO chat (id, game_id, channel, player_id, player_name, country_id, text, at) VALUES (${this.p(8).join(',')})`, [row.id, row.gameId, row.channel, row.playerId, row.playerName, row.countryId, row.text, row.at]);
  }
  async listChat(gameId: string, channels: string[], limit: number): Promise<ChatRow[]> {
    if (!channels.length) return [];
    const ph = channels.map((_, i) => this.db.param(i + 2)).join(',');
    const r = await this.db.all(`SELECT * FROM chat WHERE game_id = ${this.db.param(1)} AND channel IN (${ph}) ORDER BY at DESC LIMIT ${Math.min(500, limit)}`, [gameId, ...channels]);
    return r.map((x) => ({ id: String(x.id), gameId, channel: String(x.channel), playerId: String(x.player_id), playerName: String(x.player_name), countryId: (x.country_id as string) ?? null, text: String(x.text), at: Number(x.at) })).reverse();
  }
}

export async function createPgStore(url: string): Promise<SqlStore> {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  let txClient: pg.PoolClient | null = null;
  const exec: Exec = {
    async run(sql, params = []) { await (txClient ?? pool).query(sql, params as unknown[]); },
    async all(sql, params = []) { const r = await (txClient ?? pool).query(sql, params as unknown[]); return r.rows; },
    async tx(fn) {
      if (txClient) { await fn(); return; }
      const client = await pool.connect();
      txClient = client;
      try { await client.query('BEGIN'); await fn(); await client.query('COMMIT'); } catch (e) { await client.query('ROLLBACK'); throw e; } finally { txClient = null; client.release(); }
    },
    async close() { await pool.end(); },
    param: (i) => `$${i}`
  };
  const store = new SqlStore('postgres', exec);
  await store.init();
  return store;
}

export async function createSqliteStore(path: string): Promise<SqlStore> {
  // se obtiene como módulo interno para que los empaquetadores no intenten resolverlo
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  let depth = 0;
  const exec: Exec = {
    async run(sql, params = []) { db.prepare(sql).run(...(params as never[])); },
    async all(sql, params = []) { return db.prepare(sql).all(...(params as never[])) as never[]; },
    async tx(fn) {
      if (depth > 0) { await fn(); return; }
      depth++;
      db.exec('BEGIN');
      try { await fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } finally { depth--; }
    },
    async close() { db.close(); },
    param: () => '?'
  };
  const store = new SqlStore('sqlite', exec);
  await store.init();
  return store;
}
