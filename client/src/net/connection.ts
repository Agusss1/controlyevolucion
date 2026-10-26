import { io, type Socket } from 'socket.io-client';
import type { Command, CommandResult } from '@cyo/shared';
import { useGame } from '../store/game';
import type { SessionInfo } from './api';

/**
 * Conexión en tiempo real. Reconecta sola; los comandos llevan un identificador único y se
 * reintentan hasta recibir confirmación: el servidor los aplica una sola vez (idempotencia).
 */
let socket: Socket | null = null;
const pending = new Map<string, { command: Command; resolve: (r: CommandResult) => void; tries: number }>();

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); });
}

export function connect(session: SessionInfo): void {
  disconnect();
  const st = useGame.getState();
  st.reset();
  st.setConnection('connecting');
  socket = io({ auth: { gameId: session.gameId, playerId: session.playerId, token: session.token }, transports: ['websocket', 'polling'], reconnectionDelay: 800, reconnectionDelayMax: 6000 });
  socket.on('connect', () => useGame.getState().setConnection('connected'));
  socket.on('disconnect', () => useGame.getState().setConnection('reconnecting'));
  socket.io.on('reconnect_attempt', () => useGame.getState().setConnection('reconnecting'));
  socket.on('fatal', (e: { error: string }) => { useGame.getState().setConnection('error', e.error); socket?.disconnect(); });
  socket.on('init', (data) => {
    useGame.getState().applyInit(data);
    // reenviar comandos que quedaron sin confirmar durante la desconexión
    for (const [id, p] of pending) sendCommand(id, p.command, p.resolve, p.tries);
  });
  socket.on('state', (data) => useGame.getState().applyState(data));
  socket.on('events', (events) => useGame.getState().pushEvents(events));
  socket.on('lobby', (data) => useGame.getState().applyLobby(data));
  socket.on('chat', (msg) => useGame.getState().pushChat(msg));
  socket.on('game:started', () => useGame.getState().setStarted());
}

export function disconnect(): void {
  if (socket) { socket.removeAllListeners(); socket.disconnect(); socket = null; }
}

function sendCommand(id: string, command: Command, resolve: (r: CommandResult) => void, tries: number): void {
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

export function emit<T = { ok: boolean; error?: string }>(event: string, data: unknown = {}): Promise<T> {
  return new Promise((resolve) => {
    if (!socket) { resolve({ ok: false, error: 'Sin conexión' } as T); return; }
    socket.timeout(15_000).emit(event, data, (err: Error | null, res: T) => {
      if (err) resolve({ ok: false, error: 'Sin respuesta del servidor' } as T);
      else {
        const r = res as unknown as { ok?: boolean; error?: string };
        if (r && r.ok === false && r.error) useGame.getState().toast(r.error, 'error');
        resolve(res);
      }
    });
  });
}
