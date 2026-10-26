import type { GameSettings } from '@cyo/shared';

export interface GameRow {
  id: string;
  code: string;
  name: string;
  status: 'lobby' | 'running' | 'ended';
  settings: GameSettings;
  adminPlayerId: string | null;
  createdAt: number;
  updatedAt: number;
  day: number;
  /** milisegundos de tiempo activo acumulado del reloj de la partida */
  activeMs: number;
  /** último instante real en que el reloj estuvo activo (para modo «siempre activo» tras reinicios) */
  lastActiveAt: number;
  lastSeq: number;
}

export interface PlayerRow {
  id: string;
  gameId: string;
  name: string;
  tokenHash: string;
  countryId: string | null;
  ready: boolean;
  role: 'admin' | 'player';
  createdAt: number;
  lastSeen: number;
}

export interface CommandRow {
  gameId: string;
  seq: number;
  day: number;
  countryId: string | null;
  playerId: string | null;
  commandId: string;
  kind: 'player' | 'system';
  payload: unknown;
  result: unknown;
  createdAt: number;
}

export interface EventRow { gameId: string; day: number; type: string; scope: string; countries: string[]; data: unknown }
export interface ChatRow { id: string; gameId: string; channel: string; playerId: string; playerName: string; countryId: string | null; text: string; at: number }

/** Persistencia de partidas. Implementaciones: PostgreSQL (producción) y SQLite (desarrollo/pruebas). */
export interface Store {
  readonly kind: 'postgres' | 'sqlite';
  init(): Promise<void>;
  close(): Promise<void>;
  createGame(row: GameRow, mapGz: Buffer): Promise<void>;
  getGame(id: string): Promise<GameRow | null>;
  getGameByCode(code: string): Promise<GameRow | null>;
  listGames(opts: { publicOnly?: boolean; ids?: string[]; limit?: number }): Promise<GameRow[]>;
  updateGame(id: string, patch: Partial<Omit<GameRow, 'id'>>): Promise<void>;
  deleteGame(id: string): Promise<void>;
  getMap(gameId: string): Promise<Buffer | null>;
  addPlayer(row: PlayerRow): Promise<void>;
  updatePlayer(id: string, patch: Partial<Omit<PlayerRow, 'id' | 'gameId'>>): Promise<void>;
  getPlayers(gameId: string): Promise<PlayerRow[]>;
  saveSnapshot(gameId: string, day: number, seq: number, stateGz: Buffer): Promise<void>;
  latestSnapshot(gameId: string): Promise<{ day: number; seq: number; state: Buffer } | null>;
  pruneSnapshots(gameId: string, keep: number): Promise<void>;
  appendCommand(row: CommandRow): Promise<void>;
  getCommand(gameId: string, commandId: string): Promise<CommandRow | null>;
  commandsAfter(gameId: string, seq: number): Promise<CommandRow[]>;
  appendEvents(rows: EventRow[]): Promise<void>;
  listEvents(gameId: string, opts: { country?: string; limit?: number; beforeDay?: number; scope?: string[] }): Promise<EventRow[]>;
  appendStats(gameId: string, day: number, rows: { countryId: string; data: unknown }[]): Promise<void>;
  listStats(gameId: string, countryId: string): Promise<{ day: number; data: unknown }[]>;
  appendChat(row: ChatRow): Promise<void>;
  listChat(gameId: string, channels: string[], limit: number): Promise<ChatRow[]>;
}
