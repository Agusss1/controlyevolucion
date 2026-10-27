import { TERRAIN, type TerrainCode } from '@cyo/shared';

export interface TerrainInfo {
  code: TerrainCode;
  id: string;
  name: string;
  color: string;
  water: boolean;
  /** multiplicador de tiempo de movimiento terrestre */
  move: number;
  /** bonificación defensiva */
  defense: number;
  /** penalización para unidades blindadas/mecanizadas (0..1) */
  armorPenalty: number;
  /** habitabilidad base 0..1 */
  habitability: number;
  /** infraestructura: coste relativo de construir */
  buildCost: number;
}

export const TERRAIN_INFO: Record<number, TerrainInfo> = {
  [TERRAIN.OCEAN]: { code: TERRAIN.OCEAN, id: 'ocean', name: 'Océano', color: '#1d3b5c', water: true, move: 1, defense: 0, armorPenalty: 0, habitability: 0, buildCost: 1 },
  [TERRAIN.SHALLOW]: { code: TERRAIN.SHALLOW, id: 'shallow', name: 'Mar costero', color: '#2b5679', water: true, move: 1, defense: 0, armorPenalty: 0, habitability: 0, buildCost: 1 },
  [TERRAIN.LAKE]: { code: TERRAIN.LAKE, id: 'lake', name: 'Lago', color: '#3a6d93', water: true, move: 1, defense: 0, armorPenalty: 0, habitability: 0, buildCost: 1 },
  [TERRAIN.PLAINS]: { code: TERRAIN.PLAINS, id: 'plains', name: 'Llanura', color: '#8fa865', water: false, move: 1, defense: 0, armorPenalty: 0, habitability: 1, buildCost: 1 },
  [TERRAIN.GRASSLAND]: { code: TERRAIN.GRASSLAND, id: 'grassland', name: 'Pradera', color: '#a3b46c', water: false, move: 1, defense: 0, armorPenalty: 0, habitability: 0.9, buildCost: 1 },
  [TERRAIN.FOREST]: { code: TERRAIN.FOREST, id: 'forest', name: 'Bosque', color: '#4f7a45', water: false, move: 1.5, defense: 0.25, armorPenalty: 0.3, habitability: 0.55, buildCost: 1.3 },
  [TERRAIN.JUNGLE]: { code: TERRAIN.JUNGLE, id: 'jungle', name: 'Selva', color: '#356a3a', water: false, move: 2.0, defense: 0.35, armorPenalty: 0.5, habitability: 0.4, buildCost: 1.8 },
  [TERRAIN.HILLS]: { code: TERRAIN.HILLS, id: 'hills', name: 'Colinas', color: '#a09060', water: false, move: 1.4, defense: 0.3, armorPenalty: 0.25, habitability: 0.6, buildCost: 1.4 },
  [TERRAIN.MOUNTAINS]: { code: TERRAIN.MOUNTAINS, id: 'mountains', name: 'Montañas', color: '#8a7f74', water: false, move: 2.6, defense: 0.7, armorPenalty: 0.6, habitability: 0.2, buildCost: 2.5 },
  [TERRAIN.DESERT]: { code: TERRAIN.DESERT, id: 'desert', name: 'Desierto', color: '#d8c38a', water: false, move: 1.3, defense: 0, armorPenalty: 0, habitability: 0.12, buildCost: 1.3 },
  [TERRAIN.STEPPE]: { code: TERRAIN.STEPPE, id: 'steppe', name: 'Estepa', color: '#bcb27a', water: false, move: 1, defense: 0, armorPenalty: 0, habitability: 0.45, buildCost: 1 },
  [TERRAIN.TUNDRA]: { code: TERRAIN.TUNDRA, id: 'tundra', name: 'Tundra', color: '#9ba79a', water: false, move: 1.4, defense: 0.1, armorPenalty: 0.1, habitability: 0.12, buildCost: 1.7 },
  [TERRAIN.ICE]: { code: TERRAIN.ICE, id: 'ice', name: 'Hielo', color: '#e6edf0', water: false, move: 2.5, defense: 0.2, armorPenalty: 0.4, habitability: 0.01, buildCost: 3 },
  [TERRAIN.MARSH]: { code: TERRAIN.MARSH, id: 'marsh', name: 'Pantano', color: '#5f7d62', water: false, move: 1.9, defense: 0.25, armorPenalty: 0.5, habitability: 0.3, buildCost: 1.8 },
  [TERRAIN.SAVANNA]: { code: TERRAIN.SAVANNA, id: 'savanna', name: 'Sabana', color: '#c2b264', water: false, move: 1.1, defense: 0.05, armorPenalty: 0.05, habitability: 0.6, buildCost: 1.1 }
};

export function isWater(t: number): boolean { return t === TERRAIN.OCEAN || t === TERRAIN.SHALLOW || t === TERRAIN.LAKE; }
export function isSea(t: number): boolean { return t === TERRAIN.OCEAN || t === TERRAIN.SHALLOW; }
