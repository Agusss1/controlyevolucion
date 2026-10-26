// Congela el mundo oficial de CYO en geodata/official/vereth-1990.json.gz (idéntico para todas las partidas).
import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createWorld } from '../simulation/src/index.js';

const world = createWorld({ mode: 'official' });
const json = JSON.stringify(world);
mkdirSync('geodata/official', { recursive: true });
writeFileSync('geodata/official/vereth-1990.json.gz', gzipSync(json, { level: 9 }));
const hash = createHash('sha256').update(json).digest('hex');
writeFileSync('geodata/official/vereth-1990.sha256', hash + '\n');
console.log(`Mundo oficial congelado: ${Object.keys(world.state.countries).length} países, ${world.map.provinces.length} provincias, ${world.map.seaZones.length} zonas marítimas · sha256 ${hash.slice(0, 16)}…`);
