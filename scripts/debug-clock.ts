// Diagnóstico del reloj del servidor (desarrollo)
import { startApp, post, connect } from '../tests/helpers.js';
const app = await startApp({ msPerDay: 150 });
const g = await post<{ gameId: string; playerId: string; token: string }>(app, '/api/games', { settings: { clockMode: 'when_online' }, playerName: 'Ana', countryId: 'HJE' });
const a = await connect(app, g.gameId, g.playerId, g.token);
console.log('start', await a.emit('admin:start'));
const inst = app.manager.loaded(g.gameId)!;
for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 300)); console.log('t', i, 'day', inst.state.day, 'activeMs', inst.row.activeMs, 'status', inst.row.status, 'conn', inst.anyoneConnected()); }
a.close();
await app.close();
process.exit(0);
