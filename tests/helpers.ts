import { io as ioc, type Socket } from 'socket.io-client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { WorldState, WorldMap } from '@cyo/shared';
import { createWorld } from '@cyo/simulation';
import { createApp, type App } from '../server/src/app.js';

let cachedWorld: { map: WorldMap; state: WorldState } | null = null;
/** Mundo oficial construido una vez por archivo de pruebas; cada prueba recibe una copia. */
export function officialWorld(): { map: WorldMap; state: WorldState } {
  if (!cachedWorld) cachedWorld = createWorld({ mode: 'official' });
  return { map: cachedWorld.map, state: structuredClone(cachedWorld.state) };
}

export function hashState(state: unknown): string { return createHash('sha256').update(JSON.stringify(state)).digest('hex'); }

export function tempDb(): string { return join(mkdtempSync(join(tmpdir(), 'cyo-test-')), 'test.sqlite'); }

export async function startApp(opts: { msPerDay?: number; sqlitePath?: string; databaseUrl?: string | null } = {}): Promise<App> {
  return createApp({ port: 0, host: '127.0.0.1', msPerDay: opts.msPerDay ?? 60_000, sqlitePath: opts.sqlitePath ?? tempDb(), databaseUrl: opts.databaseUrl ?? null, logLevel: 'silent', snapshotEveryDays: 5, clientDist: '/nonexistent' });
}

export async function post<T = Record<string, unknown>>(app: App, path: string, body: unknown): Promise<T> {
  const r = await fetch(app.url() + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json() as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

export interface Client { socket: Socket; init: Record<string, unknown>; states: Record<string, unknown>[]; lobbies: Record<string, unknown>[]; emit<T = Record<string, unknown>>(event: string, data?: unknown): Promise<T>; command(command: unknown, commandId?: string): Promise<Record<string, unknown>>; close(): void }

export async function connect(app: App, gameId: string, playerId: string, token: string): Promise<Client> {
  const socket = ioc(app.url(), { auth: { gameId, playerId, token }, transports: ['websocket'], forceNew: true, reconnection: false });
  const states: Record<string, unknown>[] = [];
  const lobbies: Record<string, unknown>[] = [];
  socket.on('state', (s) => states.push(s));
  socket.on('lobby', (s) => lobbies.push(s));
  const init = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout init')), 15000);
    socket.once('init', (d) => { clearTimeout(t); resolve(d); });
    socket.once('fatal', (e) => { clearTimeout(t); reject(new Error(e.error)); });
  });
  return {
    socket, init, states, lobbies,
    emit: (event, data) => new Promise((resolve) => socket.emit(event, data ?? {}, resolve)),
    command: (command, commandId = randomUUID()) => new Promise((resolve) => socket.emit('command', { commandId, command }, resolve)),
    close: () => socket.disconnect()
  };
}

export async function waitFor(pred: () => boolean | Promise<boolean>, timeoutMs = 15000, stepMs = 20): Promise<void> {
  const start = Date.now();
  while (!(await pred())) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: tiempo agotado');
    await new Promise((r) => setTimeout(r, stepMs));
  }
}
