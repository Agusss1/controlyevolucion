import { REAL_MS_PER_DAY } from '@cyo/shared';

export interface ServerConfig {
  port: number;
  host: string;
  /** postgres://... para PostgreSQL; si falta se usa SQLite en sqlitePath */
  databaseUrl: string | null;
  sqlitePath: string;
  /** milisegundos reales por día de juego. Producción: 20 000 (1 h = 6 meses). Solo se cambia para pruebas. */
  msPerDay: number;
  snapshotEveryDays: number;
  /** minutos sin jugadores antes de descargar una partida de memoria */
  unloadAfterMinutes: number;
  /** días sin actividad antes de borrar partidas en sala de espera abandonadas */
  purgeLobbyAfterDays: number;
  /** tope de días recuperados al reiniciar una partida en modo «siempre activo» */
  maxCatchUpDays: number;
  clientDist: string | null;
  publicUrl: string;
  logLevel: string;
}

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const env = process.env;
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl: env.DATABASE_URL ?? null,
    sqlitePath: env.SQLITE_PATH ?? 'data/cyo.sqlite',
    msPerDay: Number(env.MS_PER_DAY ?? REAL_MS_PER_DAY),
    snapshotEveryDays: Number(env.SNAPSHOT_EVERY_DAYS ?? 10),
    unloadAfterMinutes: Number(env.UNLOAD_AFTER_MINUTES ?? 15),
    purgeLobbyAfterDays: Number(env.PURGE_LOBBY_AFTER_DAYS ?? 14),
    maxCatchUpDays: Number(env.MAX_CATCHUP_DAYS ?? 180),
    clientDist: env.CLIENT_DIST ?? null,
    publicUrl: env.PUBLIC_URL ?? '',
    logLevel: env.LOG_LEVEL ?? 'info',
    ...overrides
  };
}
