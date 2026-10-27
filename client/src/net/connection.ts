import { io, type Socket } from 'socket.io-client';
import type { Command, CommandResult, GameSettings } from '@cyo/shared';
import { useGame } from '../store/game';
import type { SessionInfo } from './api';
import type { FromWorker, ToWorker } from '../local/engine.worker';

/**
 * Conexión con la partida. Dos modos con el mismo contrato de mensajes:
 * - servidor (Socket.IO): multijugador. Reconecta sola; los comandos llevan un identificador único
 *   y se reintentan hasta recibir confirmación (el servidor los aplica una sola vez).
 * - local (Web Worker): un jugador contra la IA, sin servidor; el motor corre en el navegador.
 */
let socket: Socket | null = null;
let worker: Worker | null = null;
let workerSeq = 1;
const workerReplies = new Map<number, (r: unknown) => void>();
const pending = new Map<string, { command: Command; resolve: (r: CommandResult) => void; tries: number }>();

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); });
}

export const isLocalSession = (s: Pick<SessionInfo, 'gameId'> | null | undefined) => !!s?.gameId.startsWith('local:');

/** Mensajes comunes a ambos modos. */
function dispatch(event: string, data: unknown): void {
  const st = useGame.getState();
  switch (event) {
    case 'init':
      st.setConnection('connected');
      st.applyInit(data as Record<string, unknown>);
      // reenviar comandos que quedaron sin confirmar durante la desconexión
      for (const [id, p] of pending) sendCommand(id, p.command, p.resolve, p.tries);
      break;
    case 'state': st.applyState(data as Record<string, unknown>); break;
    case 'events': st.pushEvents(data as never); break;
    case 'lobby': st.applyLobby(data as Record<string, unknown>); break;
    case 'chat': st.pushChat(data as never); break;
    case 'game:started': st.setStarted(); break;
    case 'fatal': st.setConnection('error', (data as { error: string }).error); break;
    case 'notice': { const n = data as { kind: 'error' | 'info'; text: string }; st.toast(n.text, n.kind); break; }
  }
}

export interface LocalCreate { settings: GameSettings; playerName: string }

export function connect(session: SessionInfo, localCreate?: LocalCreate): void {
  disconnect();
  const st = useGame.getState();
  st.reset();
  st.setConnection('connecting');
  if (isLocalSession(session)) { openLocal(session.gameId.slice(6), localCreate); return; }
  socket = io({ auth: { gameId: session.gameId, playerId: session.playerId, token: session.token }, transports: ['websocket', 'polling'], reconnectionDelay: 800, reconnectionDelayMax: 6000 });
  socket.on('connect', () => useGame.getState().setConnection('connected'));
  socket.on('disconnect', () => useGame.getState().setConnection('reconnecting'));
  socket.io.on('reconnect_attempt', () => useGame.getState().setConnection('reconnecting'));
  socket.on('fatal', (e: { error: string }) => { dispatch('fatal', e); socket?.disconnect(); });
  for (const ev of ['init', 'state', 'events', 'lobby', 'chat', 'game:started']) socket.on(ev, (data: unknown) => dispatch(ev, data));
}

// ------------------------------------------------------------------ modo local
function onVisibility(): void { worker?.postMessage({ kind: 'visible', visible: document.visibilityState === 'visible' } satisfies ToWorker); }

function openLocal(saveId: string, create?: LocalCreate): void {
  worker = new Worker(new URL('../local/engine.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent<FromWorker>) => {
    const m = ev.data;
    if (m.kind === 'reply') { workerReplies.get(m.id)?.(m.data); workerReplies.delete(m.id); }
    else dispatch(m.event, m.data);
  };
  worker.onerror = (e) => dispatch('fatal', { error: `Error del motor local: ${e.message}` });
  // solo para pruebas: acelerar el reloj con localStorage cyo.dev.msPerDay
  let msPerDay: number | undefined;
  try { const v = Number(localStorage.getItem('cyo.dev.msPerDay')); if (v > 0) msPerDay = v; } catch { /* */ }
  const officialUrl = new URL('worlds/vereth-1990.bin', document.baseURI).href;
  worker.postMessage({ kind: 'open', saveId, msPerDay, create: create && { ...create, officialUrl } } satisfies ToWorker);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flushLocal);
}

function workerRequest<T>(event: string, data: unknown): Promise<T> {
  return new Promise((resolve) => {
    if (!worker) { resolve({ ok: false, error: 'Sin partida abierta' } as T); return; }
    const id = workerSeq++;
    workerReplies.set(id, resolve as (r: unknown) => void);
    worker.postMessage({ kind: 'request', id, event, data } satisfies ToWorker);
  });
}

/** Guarda la partida local (al ocultar o cerrar la página). */
function flushLocal(): void { worker?.postMessage({ kind: 'visible', visible: false } satisfies ToWorker); }

export function disconnect(): void {
  if (socket) { socket.removeAllListeners(); socket.disconnect(); socket = null; }
  if (worker) {
    const w = worker;
    worker = null;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', flushLocal);
    // el worker guarda antes de terminar
    const id = workerSeq++;
    const done = () => w.terminate();
    w.onmessage = (ev: MessageEvent<FromWorker>) => { if (ev.data.kind === 'reply' && ev.data.id === id) done(); };
    w.postMessage({ kind: 'close', id } satisfies ToWorker);
    setTimeout(done, 5000);
    for (const r of workerReplies.values()) r({ ok: false, error: 'Partida cerrada' });
    workerReplies.clear();
  }
}

// ------------------------------------------------------------------ comandos y peticiones
function sendCommand(id: string, command: Command, resolve: (r: CommandResult) => void, tries: number): void {
  if (worker) { void workerRequest<CommandResult>('command', { commandId: id, command }).then(resolve); return; }
  pending.set(id, { command, resolve, tries });
  if (!socket?.connected) return;
  socket.timeout(10_000).emit('command', { commandId: id, command }, (err: Error | null, res: CommandResult) => {
    if (err) {
      if (tries < 5) setTimeout(() => sendCommand(id, command, resolve, tries + 1), 800);
      else { pending.delete(id); resolve({ ok: false, error: 'Sin respuesta del servidor.' }); }
      return;
    }
    pending.delete(id);
    resolve(res);
  });
}

export function command(cmd: Command): Promise<CommandResult> {
  return new Promise((resolve) => {
    const id = uuid();
    sendCommand(id, cmd, (r) => {
      const st = useGame.getState();
      if (!r.ok) st.toast(r.error ?? 'Acción rechazada', 'error');
      else if (r.message && r.message !== 'duplicado') st.toast(r.message, 'info');
      resolve(r);
    }, 0);
  });
}

function reportError<T>(res: T): T {
  const r = res as unknown as { ok?: boolean; error?: string };
  if (r && r.ok === false && r.error) useGame.getState().toast(r.error, 'error');
  return res;
}

export function emit<T = { ok: boolean; error?: string }>(event: string, data: unknown = {}): Promise<T> {
  if (worker) return workerRequest<T>(event, data).then(reportError);
  return new Promise((resolve) => {
    if (!socket) { resolve({ ok: false, error: 'Sin conexión' } as T); return; }
    socket.timeout(15_000).emit(event, data, (err: Error | null, res: T) => {
      if (err) resolve({ ok: false, error: 'Sin respuesta del servidor' } as T);
      else resolve(reportError(res));
    });
  });
}
