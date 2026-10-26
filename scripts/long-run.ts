// Corrida larga sin jugadores para revisar estabilidad: npx tsx scripts/long-run.ts [años] [semilla-aleatoria]
import { createWorld, runDay, population } from '../simulation/src/index.js';

const years = Number(process.argv[2] ?? 10);
const seed = process.argv[3];
const { map, state } = createWorld(seed ? { mode: 'random', seed } : { mode: 'official' });
const counts = new Map<string, number>();
const t0 = Date.now();
const gdp0 = new Map(Object.values(state.countries).map((c) => [c.id, c.econ.realGDP]));
let bad = 0;
for (let y = 1; y <= years; y++) {
  for (let d = 0; d < 360; d++) for (const e of runDay(state, map).events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  const alive = Object.values(state.countries).filter((c) => c.alive);
  for (const c of alive) {
    const vals = [c.econ.realGDP, c.econ.inflation, c.fiscal.treasury, population(c), c.politics.stability, c.econ.exchangeRate];
    if (vals.some((v) => !Number.isFinite(v)) || c.econ.realGDP <= 0 || population(c) <= 0) { bad++; console.log('  ¡valor inválido!', c.id, vals); }
  }
  const gdp = alive.reduce((a, c) => a + c.econ.realGDP, 0);
  const infl = alive.map((c) => c.econ.inflation).sort((a, b) => a - b);
  const wars = Object.values(state.wars).filter((w) => w.status !== 'ended').length;
  console.log(`${1989 + y + 1}: PIB mundial ${gdp.toFixed(0)} · inflación mediana ${(infl[infl.length >> 1] * 100).toFixed(1)} % (máx ${(infl[infl.length - 1] * 100).toFixed(0)} %) · Estados ${alive.length} · guerras abiertas ${wars} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
const growth = Object.values(state.countries).filter((c) => c.alive && gdp0.has(c.id)).map((c) => [c.id, Math.pow(c.econ.realGDP / gdp0.get(c.id)!, 1 / years) - 1] as const).sort((a, b) => a[1] - b[1]);
console.log('crecimiento anual medio: peor', growth.slice(0, 3).map(([k, g]) => `${k} ${(g * 100).toFixed(1)} %`).join(', '), '· mejor', growth.slice(-3).map(([k, g]) => `${k} ${(g * 100).toFixed(1)} %`).join(', '));
const keys = ['war_declared', 'war_ended', 'independence', 'state_collapse', 'state_dissolved', 'unification', 'coup', 'revolution', 'default', 'hyperinflation', 'banking_crisis', 'devaluation', 'election', 'tech_first', 'tech', 'territory_transfer'];
console.log('acontecimientos:', keys.map((k) => `${k}=${counts.get(k) ?? 0}`).join(' '));
console.log(bad ? `${bad} valores inválidos` : 'sin valores inválidos');
