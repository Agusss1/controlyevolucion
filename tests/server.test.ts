import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startApp, post, connect, waitFor, tempDb, hashState, type Client } from './helpers.js';
import type { App } from '../server/src/app.js';

const apps: App[] = [];
const clients: Client[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  for (const a of apps.splice(0)) await a.close().catch(() => undefined);
});

async function newApp(opts: Parameters<typeof startApp>[0] = {}) { const a = await startApp(opts); apps.push(a); return a; }
async function client(app: App, gameId: string, playerId: string, token: string) { const c = await connect(app, gameId, playerId, token); clients.push(c); return c; }

interface Created { gameId: string; code: string; playerId: string; token: string; recovery: string }

describe('multijugador', () => {
  it('tres usuarios entran a la misma partida con código y no pueden elegir el mismo país', async () => {
    const app = await newApp();
    const g = await post<Created>(app, '/api/games', { settings: { name: 'Prueba', maxPlayers: 4 }, playerName: 'Ana', countryId: 'VAL' });
    expect(g.code).toMatch(/^[A-Z0-9]{6}$/);
    const b = await post<Created>(app, '/api/join', { code: g.code, playerName: 'Bruno', countryId: 'KHA' });
    const c = await post<Created>(app, '/api/join', { code: g.code.toLowerCase(), playerName: 'Carla' });
    expect(b.gameId).toBe(g.gameId);
    expect(c.gameId).toBe(g.gameId);
    await expect(post(app, '/api/join', { code: g.code, playerName: 'Dario', countryId: 'VAL' })).rejects.toThrow(/gobernante/);
    const cc = await client(app, c.gameId, c.playerId, c.token);
    const r1 = await cc.emit('lobby:pick', { countryId: 'KHA' });
    expect(r1.ok).toBe(false);
    const r2 = await cc.emit('lobby:pick', { countryId: 'TEC' });
    expect(r2.ok).toBe(true);
    const preview = await (await fetch(`${app.url()}/api/games/code/${g.code}`)).json() as { players: { countryId: string }[] };
    expect(preview.players.map((p) => p.countryId).sort()).toEqual(['KHA', 'TEC', 'VAL']);
    // token inválido: rechazado
    await expect(connect(app, g.gameId, g.playerId, 'falso')).rejects.toThrow();
  });

  it('el reloj avanza en el servidor solo con jugadores conectados (modo por defecto) y respeta la pausa', async () => {
    const app = await newApp({ msPerDay: 150 });
    const g = await post<Created>(app, '/api/games', { settings: { clockMode: 'when_online' }, playerName: 'Ana', countryId: 'HJE' });
    const a = await client(app, g.gameId, g.playerId, g.token);
    expect((await a.emit('admin:start')).ok).toBe(true);
    const inst = app.manager.loaded(g.gameId)!;
    await waitFor(() => inst.state.day >= 5);
    a.close();
    await waitFor(() => !inst.anyoneConnected());
    const d = inst.state.day;
    await new Promise((r) => setTimeout(r, 400));
    expect(inst.state.day).toBeLessThanOrEqual(d + 1);
    // reconexión: vuelve a correr; luego pausa del administrador
    const a2 = await client(app, g.gameId, g.playerId, g.token);
    await waitFor(() => inst.state.day >= d + 3);
    expect((await a2.emit('admin:settings', { clockMode: 'paused' })).ok).toBe(true);
    const p = inst.state.day;
    await new Promise((r) => setTimeout(r, 400));
    expect(inst.state.day).toBe(p);
    // el día corresponde exactamente al tiempo activo acumulado
    expect(inst.state.day).toBe(Math.floor(inst.row.activeMs / 150));
  });

  it('un país desconectado conserva su estado y el jugador recupera el mismo país al volver', async () => {
    const app = await newApp({ msPerDay: 120 });
    const g = await post<Created>(app, '/api/games', { settings: { clockMode: 'always' }, playerName: 'Ana', countryId: 'LUS' });
    const a = await client(app, g.gameId, g.playerId, g.token);
    await a.emit('admin:start');
    const r = await a.command({ type: 'setBudget', budget: { education: 6.6 } });
    expect(r.ok).toBe(true);
    a.close();
    const inst = app.manager.loaded(g.gameId)!;
    const d0 = inst.state.day;
    await waitFor(() => inst.state.day >= d0 + 10);
    const back = await client(app, g.gameId, g.playerId, g.token);
    expect((back.init.you as { countryId: string }).countryId).toBe('LUS');
    const priv = back.init.private as { country: { budget: { education: number }; id: string } };
    expect(priv.country.id).toBe('LUS');
    expect(priv.country.budget.education).toBe(6.6);
    // recuperación desde otro dispositivo con el código de recuperación
    const rec = await post<{ playerId: string; token: string }>(app, '/api/recover', { recovery: g.recovery });
    expect(rec.playerId).toBe(g.playerId);
  });

  it('no hay acciones duplicadas tras reconexión: el mismo commandId se aplica una sola vez', async () => {
    const app = await newApp();
    const g = await post<Created>(app, '/api/games', { settings: {}, playerName: 'Ana', countryId: 'VAL' });
    const a = await client(app, g.gameId, g.playerId, g.token);
    await a.emit('admin:start');
    const inst = app.manager.loaded(g.gameId)!;
    const debt0 = inst.state.countries.VAL.fiscal.debtDomestic + inst.state.countries.VAL.fiscal.debtForeign * inst.state.countries.VAL.econ.exchangeRate;
    const id = randomUUID();
    const r1 = await a.command({ type: 'borrow', amount: 10 }, id);
    expect(r1.ok).toBe(true);
    a.close();
    const b = await client(app, g.gameId, g.playerId, g.token);
    const r2 = await b.command({ type: 'borrow', amount: 10 }, id);
    expect(r2.ok).toBe(true);
    expect(r2.message).toBe('duplicado');
    const c = inst.state.countries.VAL;
    const debt1 = c.fiscal.debtDomestic + c.fiscal.debtForeign * c.econ.exchangeRate;
    expect(debt1 - debt0).toBeGreaterThan(9.99);
    expect(debt1 - debt0).toBeLessThan(10.01);
  });

  it('una declaración de guerra entre humanos espera la conexión del defensor', async () => {
    const app = await newApp({ msPerDay: 120 });
    const g = await post<Created>(app, '/api/games', { settings: { clockMode: 'always', warGraceSeconds: 5, warPrepDays: 2 }, playerName: 'Ana', countryId: 'YRV' });
    const b = await post<Created>(app, '/api/join', { code: g.code, playerName: 'Beto', countryId: 'TEC' });
    const a = await client(app, g.gameId, g.playerId, g.token);
    await a.emit('admin:start');
    const inst = app.manager.loaded(g.gameId)!;
    inst.state.countries.YRV.politics.politicalCapital = 100;
    const r = await a.command({ type: 'declareWar', target: 'TEC', goal: 'claims', provinces: [] });
    expect(r.ok).toBe(true);
    const warId = (r.data as { war: string }).war;
    const d0 = inst.state.day;
    await waitFor(() => inst.state.day >= d0 + 8);
    expect(inst.state.wars[warId].status).toBe('pending');
    const bb = await client(app, b.gameId, b.playerId, b.token);
    await waitFor(() => inst.state.wars[warId].status !== 'pending');
    expect(['preparing', 'active']).toContain(inst.state.wars[warId].status);
    await bb.command({ type: 'warReady', war: warId });
    await a.command({ type: 'warReady', war: warId });
    await waitFor(() => inst.state.wars[warId].status === 'active');
    // canal de chat del conflicto disponible para ambos
    expect((await bb.emit('chat:send', { channel: `war:${warId}`, text: 'Negociemos' })).ok).toBe(true);
  });
});

describe('persistencia', () => {
  it('un servidor reiniciado recupera la partida exactamente (instantánea + reproducción de comandos)', async () => {
    const db = tempDb();
    const app = await newApp({ msPerDay: 120, sqlitePath: db });
    const g = await post<Created>(app, '/api/games', { settings: { clockMode: 'always' }, playerName: 'Ana', countryId: 'MOR' });
    const a = await client(app, g.gameId, g.playerId, g.token);
    await a.emit('admin:start');
    const inst = app.manager.loaded(g.gameId)!;
    await waitFor(() => inst.state.day >= 7);
    await a.command({ type: 'setTaxes', taxes: { vat: 0.19 } });
    await a.command({ type: 'proposeLaw', law: 'environment', option: 'strict' });
    await waitFor(() => inst.state.day >= 13);
    // pausa para congelar el estado y compararlo
    await a.emit('admin:settings', { clockMode: 'paused' });
    await new Promise((r) => setTimeout(r, 100));
    const day = inst.state.day;
    a.close();
    await waitFor(() => !inst.anyoneConnected());
    const hash = hashState({ ...inst.state, onlineCountries: [] });
    // caída abrupta: sin instantánea final
    app.manager.dropWithoutSaving(g.gameId);
    await app.close();
    apps.splice(apps.indexOf(app), 1);
    const app2 = await newApp({ msPerDay: 120, sqlitePath: db });
    const again = await app2.manager.get(g.gameId);
    expect(again).toBeTruthy();
    expect(again!.state.day).toBe(day);
    expect(hashState({ ...again!.state, onlineCountries: [] })).toBe(hash);
    expect(again!.state.countries.MOR.taxes.vat).toBe(0.19);
    const b = await client(app2, g.gameId, g.playerId, g.token);
    expect((b.init.you as { countryId: string }).countryId).toBe('MOR');
  });

  it('funciona también sobre PostgreSQL', async () => {
    const url = process.env.TEST_DATABASE_URL ?? 'postgresql://cyo:cyo@localhost/cyo_test';
    let app: App;
    try { app = await newApp({ msPerDay: 120, databaseUrl: url }); } catch (e) {
      console.warn('PostgreSQL no disponible, prueba omitida:', (e as Error).message);
      return;
    }
    const g = await post<Created>(app, '/api/games', { settings: { clockMode: 'always' }, playerName: 'Ana', countryId: 'HAL' });
    const a = await client(app, g.gameId, g.playerId, g.token);
    await a.emit('admin:start');
    const inst = app.manager.loaded(g.gameId)!;
    await waitFor(() => inst.state.day >= 6);
    await a.command({ type: 'setBudget', budget: { science: 4.2 } });
    await a.emit('admin:settings', { clockMode: 'paused' });
    await new Promise((r) => setTimeout(r, 100));
    const hash = hashState({ ...inst.state, onlineCountries: [] });
    app.manager.dropWithoutSaving(g.gameId);
    a.close();
    const again = await app.manager.get(g.gameId);
    expect(hashState({ ...again!.state, onlineCountries: [] })).toBe(hash);
    await app.store.deleteGame(g.gameId);
  });
});
