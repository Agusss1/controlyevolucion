import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { Server as IOServer, type Socket } from 'socket.io';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import type { GameSettings } from '@cyo/shared';
import { LAWS, TECHS, UNIT_INFO } from '@cyo/simulation';
import { loadConfig, type ServerConfig } from './config.js';
import { createPgStore, createSqliteStore } from './store/sql.js';
import type { Store } from './store/types.js';
import { GameManager } from './game/manager.js';
import type { GameInstance, Transport } from './game/instance.js';

export interface App { fastify: FastifyInstance; io: IOServer; manager: GameManager; store: Store; config: ServerConfig; close(): Promise<void>; url(): string }

const settingsSchema = z.object({
  name: z.string().max(60).optional(),
  maxPlayers: z.number().int().min(1).max(64).optional(),
  privacy: z.enum(['public', 'private']).optional(),
  advancedAI: z.boolean().optional(),
  clockMode: z.enum(['when_online', 'always', 'paused']).optional(),
  world: z.object({ mode: z.enum(['official', 'random']), seed: z.string().max(40).optional(), countries: z.number().int().min(40).max(70).optional() }).optional(),
  warGraceSeconds: z.number().int().min(5).max(600).optional(),
  warPrepDays: z.number().int().min(0).max(30).optional()
});

export async function createApp(overrides: Partial<ServerConfig> = {}): Promise<App> {
  const config = loadConfig(overrides);
  let store: Store;
  if (config.databaseUrl) store = await createPgStore(config.databaseUrl);
  else {
    if (config.sqlitePath !== ':memory:') mkdirSync(dirname(resolve(config.sqlitePath)), { recursive: true });
    store = await createSqliteStore(config.sqlitePath);
  }
  const fastify = Fastify({ logger: config.logLevel === 'silent' ? false : { level: config.logLevel }, bodyLimit: 1_000_000 });
  await fastify.register(cors, { origin: true });

  // sockets por jugador para el transporte
  const socketsByPlayer = new Map<string, Set<Socket>>();
  let io: IOServer;
  const transport: Transport = {
    send(playerId, event, data) { for (const s of socketsByPlayer.get(playerId) ?? []) s.emit(event, data); },
    broadcast(gameId, event, data) { io.to(`game:${gameId}`).emit(event, data); }
  };
  const manager = new GameManager(store, config, transport);

  // ------------------------------------------------------------------ HTTP
  fastify.get('/api/health', async () => ({ ok: true, store: store.kind, msPerDay: config.msPerDay }));

  fastify.get('/api/catalog', async () => ({
    laws: LAWS, techs: TECHS, units: UNIT_INFO
  }));

  fastify.post('/api/games', async (req, reply) => {
    const body = z.object({ settings: settingsSchema.default({}), playerName: z.string().min(2).max(32), countryId: z.string().max(16).nullable().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos.' });
    try {
      const { game, playerId, token } = await manager.create({ settings: body.data.settings as Partial<GameSettings>, playerName: body.data.playerName, countryId: body.data.countryId ?? null });
      return { gameId: game.id, code: game.row.code, playerId, token, recovery: `${game.row.code}.${playerId}.${token}`, inviteUrl: `${config.publicUrl}/?join=${game.row.code}` };
    } catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
  });

  fastify.get('/api/games/public', async () => manager.publicGames());

  fastify.post('/api/games/mine', async (req) => {
    const body = z.object({ ids: z.array(z.string().max(64)).max(100) }).safeParse(req.body);
    return body.success ? manager.summaries(body.data.ids) : [];
  });

  fastify.get('/api/games/code/:code', async (req, reply) => {
    const { code } = req.params as { code: string };
    const g = await manager.getByCode(code);
    if (!g) return reply.code(404).send({ error: 'Código inexistente.' });
    const taken = new Set([...g.players.values()].map((p) => p.countryId).filter(Boolean));
    const countries = Object.values(g.state.countries).filter((c) => c.alive).map((c) => ({
      id: c.id, name: c.name, longName: c.longName, color: c.color, flag: c.flag, regime: c.regime, population: c.demography.young + c.demography.adult + c.demography.old,
      gdp: c.econ.realGDP, archetype: c.archetype, taken: taken.has(c.id), strengths: c.strengths, weaknesses: c.weaknesses, history: c.history
    }));
    return { game: g.summary(), countries, players: g.lobbyPlayers() };
  });

  fastify.post('/api/join', async (req, reply) => {
    const body = z.object({ code: z.string().min(4).max(12), playerName: z.string().min(2).max(32), countryId: z.string().max(16).nullable().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos.' });
    try {
      const { game, playerId, token } = await manager.join(body.data.code, body.data.playerName, body.data.countryId ?? null);
      return { gameId: game.id, code: game.row.code, playerId, token, recovery: `${game.row.code}.${playerId}.${token}` };
    } catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
  });

  /** Recuperación de sesión en otro dispositivo con el código de recuperación. */
  fastify.post('/api/recover', async (req, reply) => {
    const body = z.object({ recovery: z.string().min(10).max(200) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Código inválido.' });
    const [code, playerId, token] = body.data.recovery.trim().split('.');
    const g = code ? await manager.getByCode(code) : null;
    const p = g && playerId && token ? g.authenticate(playerId, token) : null;
    if (!g || !p) return reply.code(404).send({ error: 'Código de recuperación inválido.' });
    return { gameId: g.id, code: g.row.code, playerId: p.id, token, name: p.name };
  });

  fastify.get('/api/games/:id/stats/:country', async (req, reply) => {
    const { id, country } = req.params as { id: string; country: string };
    const g = await store.getGame(id);
    if (!g) return reply.code(404).send({ error: 'Partida inexistente.' });
    return store.listStats(id, country);
  });

  // cliente compilado
  const dist = config.clientDist ?? resolve(process.cwd(), 'client/dist');
  if (existsSync(dist)) {
    await fastify.register(fastifyStatic, { root: dist, prefix: '/' });
    fastify.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/socket.io')) return reply.code(404).send({ error: 'No encontrado' });
      return reply.sendFile('index.html');
    });
  }

  await fastify.listen({ port: config.port, host: config.host });
  io = new IOServer(fastify.server, { cors: { origin: true }, maxHttpBufferSize: 200_000, perMessageDeflate: { threshold: 4096 } });

  // ------------------------------------------------------------------ sockets
  io.on('connection', async (socket) => {
    const auth = socket.handshake.auth as { gameId?: string; playerId?: string; token?: string };
    const game = auth.gameId ? await manager.get(auth.gameId).catch(() => null) : null;
    const player = game && auth.playerId && auth.token ? game.authenticate(auth.playerId, auth.token) : null;
    if (!game || !player) { socket.emit('fatal', { error: 'Sesión inválida.' }); socket.disconnect(true); return; }
    const pid = player.id;
    const set = socketsByPlayer.get(pid) ?? new Set();
    set.add(socket);
    socketsByPlayer.set(pid, set);
    socket.join(`game:${game.id}`);
    await game.connect(pid);
    const chat = await store.listChat(game.id, game.channelsFor(player), 150);
    socket.emit('init', {
      you: { playerId: pid, name: player.name, countryId: player.countryId, admin: game.isAdmin(pid) },
      game: game.summary(), settings: game.row.settings, players: game.lobbyPlayers(), map: game.map, chat, ...game.playerPayload(pid)
    });

    // limitador de frecuencia por socket (cubo de fichas)
    let tokens = 30, last = Date.now();
    const allow = () => { const now = Date.now(); tokens = Math.min(30, tokens + (now - last) / 100); last = now; if (tokens < 1) return false; tokens -= 1; return true; };
    const handle = (event: string, fn: (data: unknown) => Promise<unknown>) => {
      socket.on(event, async (data: unknown, ack?: (r: unknown) => void) => {
        if (!allow()) { ack?.({ ok: false, error: 'Demasiadas acciones por segundo.' }); return; }
        try { const r = await fn(data); ack?.(r ?? { ok: true }); } catch (e) { ack?.({ ok: false, error: (e as Error).message }); }
      });
    };
    const g: GameInstance = game;
    handle('command', async (data) => g.command(pid, data as { commandId: string; command: unknown }));
    handle('lobby:pick', async (data) => { await g.pickCountry(pid, (data as { countryId: string | null }).countryId ?? null); g.sendStateTo(pid); return { ok: true }; });
    handle('lobby:ready', async (data) => { await g.setReady(pid, !!(data as { ready: boolean }).ready); return { ok: true }; });
    handle('admin:start', async () => { await g.start(pid); return { ok: true }; });
    handle('admin:settings', async (data) => { const p = settingsSchema.partial().parse(data); await g.updateSettings(pid, p as Partial<GameSettings>); return { ok: true }; });
    handle('admin:transfer', async (data) => { await g.transferAdmin(pid, String((data as { playerId: string }).playerId)); return { ok: true }; });
    handle('admin:release', async (data) => { await g.releaseCountry(pid, String((data as { playerId: string }).playerId)); return { ok: true }; });
    handle('chat:send', async (data) => { const d = data as { channel: string; text: string }; await g.chat(pid, String(d.channel), String(d.text ?? '')); return { ok: true }; });
    handle('request:projection', async () => ({ ok: true, projection: g.projection(pid) }));
    handle('request:history', async (data) => ({ ok: true, stats: await store.listStats(g.id, String((data as { country: string }).country)) }));
    handle('request:events', async (data) => {
      const d = data as { beforeDay?: number; country?: string };
      const me = g.players.get(pid)?.countryId ?? undefined;
      const rows = await store.listEvents(g.id, { beforeDay: d.beforeDay, limit: 200, country: me });
      return { ok: true, events: rows.map((r) => r.data) };
    });
    handle('request:state', async () => { g.sendStateTo(pid); return { ok: true }; });
    socket.on('disconnect', () => {
      socketsByPlayer.get(pid)?.delete(socket);
      void g.disconnect(pid);
    });
  });

  manager.start();
  await manager.loadAlwaysOn();

  return {
    fastify, io, manager, store, config,
    url: () => { const a = fastify.server.address(); return typeof a === 'object' && a ? `http://127.0.0.1:${a.port}` : `http://127.0.0.1:${config.port}`; },
    async close() {
      await manager.stop();
      io.close();
      await fastify.close();
      await store.close();
    }
  };
}
