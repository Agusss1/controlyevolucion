/**
 * Copia de seguridad portable de las partidas (independiente del motor de base de datos).
 *
 *   npm run backup --workspace server                       → backups/cyo-AAAAMMDD-HHMMSS.json.gz
 *   npm run backup --workspace server -- --out archivo.json.gz
 *   npm run backup --workspace server -- --restore archivo.json.gz
 *
 * Por partida se guarda lo mínimo necesario para recuperarla exactamente: la fila de la partida,
 * los jugadores (solo hashes de token), el mapa, la última instantánea y los comandos posteriores
 * (la recuperación reproduce esos comandos sobre la instantánea). Usa la misma base que el servidor
 * (DATABASE_URL o SQLITE_PATH). Para PostgreSQL también puede usarse pg_dump.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { loadConfig } from './config.js';
import { createPgStore, createSqliteStore } from './store/sql.js';
import type { CommandRow, GameRow, PlayerRow, Store } from './store/types.js';

interface GameBackup {
  game: GameRow;
  players: PlayerRow[];
  map: string | null;
  snapshot: { day: number; seq: number; state: string } | null;
  commands: CommandRow[];
}

interface BackupFile { format: 'cyo-backup'; version: 1; createdAt: number; games: GameBackup[] }

async function openStore(): Promise<Store> {
  const cfg = loadConfig();
  const store = cfg.databaseUrl ? await createPgStore(cfg.databaseUrl) : await createSqliteStore(cfg.sqlitePath);
  await store.init();
  return store;
}

export async function exportGames(store: Store): Promise<BackupFile> {
  const games: GameBackup[] = [];
  for (const game of await store.listGames({ limit: 100000 })) {
    const snap = await store.latestSnapshot(game.id);
    const map = await store.getMap(game.id);
    games.push({
      game,
      players: await store.getPlayers(game.id),
      map: map ? map.toString('base64') : null,
      snapshot: snap ? { day: snap.day, seq: snap.seq, state: snap.state.toString('base64') } : null,
      commands: await store.commandsAfter(game.id, snap?.seq ?? 0)
    });
  }
  return { format: 'cyo-backup', version: 1, createdAt: Date.now(), games };
}

export async function importGames(store: Store, file: BackupFile): Promise<{ restored: string[]; skipped: string[] }> {
  if (file.format !== 'cyo-backup' || file.version !== 1) throw new Error('Formato de copia no reconocido');
  const restored: string[] = [], skipped: string[] = [];
  for (const g of file.games) {
    if (await store.getGame(g.game.id)) { skipped.push(g.game.id); continue; }
    await store.createGame(g.game, g.map ? Buffer.from(g.map, 'base64') : Buffer.alloc(0));
    for (const p of g.players) await store.addPlayer(p);
    if (g.snapshot) await store.saveSnapshot(g.game.id, g.snapshot.day, g.snapshot.seq, Buffer.from(g.snapshot.state, 'base64'));
    for (const c of g.commands) await store.appendCommand(c);
    restored.push(g.game.id);
  }
  return { restored, skipped };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const restoreIdx = args.indexOf('--restore');
  const store = await openStore();
  try {
    if (restoreIdx >= 0) {
      const path = args[restoreIdx + 1];
      if (!path) throw new Error('Falta el archivo: --restore archivo.json.gz');
      const file = JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as BackupFile;
      const r = await importGames(store, file);
      console.log(`Restauradas ${r.restored.length} partidas; omitidas ${r.skipped.length} que ya existían.`);
    } else {
      const outIdx = args.indexOf('--out');
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
      const out = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : `backups/cyo-${stamp}.json.gz`;
      const file = await exportGames(store);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, gzipSync(JSON.stringify(file)));
      console.log(`Copia de ${file.games.length} partidas escrita en ${out}`);
    }
  } finally {
    await store.close();
  }
}

if (process.argv[1] && /backup\.ts$/.test(process.argv[1])) {
  main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
