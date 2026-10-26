import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { WorldMap, WorldState } from '@cyo/shared';
import { createWorld, GENERATOR_VERSION } from '@cyo/simulation';

const here = dirname(fileURLToPath(import.meta.url));
export const OFFICIAL_WORLD_FILE = resolve(here, '../../../geodata/official/vereth-1990.json.gz');

/**
 * Mundo oficial: se lee del archivo congelado en geodata/ (idéntico para todas las partidas).
 * Si el archivo no existe o fue generado con otra versión del generador, se reconstruye.
 */
export function loadWorld(mode: 'official' | 'random', seed?: string, countries?: number, advancedAI = true, warPrepDays = 3): { map: WorldMap; state: WorldState } {
  if (mode === 'official' && existsSync(OFFICIAL_WORLD_FILE)) {
    const data = JSON.parse(gunzipSync(readFileSync(OFFICIAL_WORLD_FILE)).toString('utf8')) as { map: WorldMap; state: WorldState };
    if (data.map.generator.version === GENERATOR_VERSION) {
      data.state.settings.advancedAI = advancedAI;
      data.state.settings.warPrepDays = warPrepDays;
      return data;
    }
  }
  return createWorld({ mode, seed, countries, advancedAI, warPrepDays });
}
