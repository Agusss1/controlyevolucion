import { createApp } from './app.js';

const app = await createApp();
console.log(`CYO escuchando en ${app.url()} (persistencia: ${app.store.kind}, ${app.config.msPerDay} ms por día de juego)`);

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  console.log(`${signal}: guardando partidas…`);
  await app.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
