// Copia el mundo oficial congelado al cliente para el modo sin servidor (se sirve como archivo estático).
// Se usa la extensión .bin para que ningún servidor web le agregue Content-Encoding: gzip.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'geodata/official/vereth-1990.json.gz');
const dst = resolve(root, 'client/public/worlds/vereth-1990.bin');
if (!existsSync(src)) { console.warn('Sin mundo oficial congelado: el navegador lo generará (npm run world:official)'); process.exit(0); }
mkdirSync(dirname(dst), { recursive: true });
copyFileSync(src, dst);
console.log('Mundo oficial copiado a client/public/worlds/');
