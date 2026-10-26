import type { WorldMap, WorldState } from '@cyo/shared';
import { OFFICIAL_DESIGN } from './official.js';
import { randomDesign } from './random.js';
import { buildWorld } from './initialState.js';

export interface WorldOptions { mode: 'official' | 'random'; seed?: string; countries?: number; advancedAI?: boolean; warPrepDays?: number }

/** Crea un mundo nuevo (mapa estático + estado al 1 de enero de 1990). */
export function createWorld(opts: WorldOptions): { map: WorldMap; state: WorldState } {
  const design = opts.mode === 'official' ? OFFICIAL_DESIGN : randomDesign(opts.seed ?? String(Date.now()), opts.countries ?? 52);
  const { map, state, errors } = buildWorld(design, { advancedAI: opts.advancedAI, warPrepDays: opts.warPrepDays });
  if (errors.length) throw new Error(`Mundo inválido: ${errors.slice(0, 3).join('; ')}`);
  return { map, state };
}
