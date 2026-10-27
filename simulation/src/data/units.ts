import type { UnitDomain, UnitType } from '@cyo/shared';

export interface UnitInfo {
  type: UnitType;
  name: string;
  short: string;
  domain: UnitDomain;
  /** personal en miles */
  manpower: number;
  /** equipo requerido (juegos de equipo) */
  equipment: { arms: number; vehicles: number; aircraft: number; ships: number };
  /** coste de formación en miles de millones de UMI de 1990 */
  cost: number;
  /** mantenimiento anual en miles de millones de UMI de 1990 */
  upkeep: number;
  trainingDays: number;
  attack: number;
  defense: number;
  /** velocidad relativa (1 = infantería a pie) */
  speed: number;
  armor: number;
  supplyUse: number;
  fuelUse: number;
  air: number;
  naval: number;
  /** alcance de operaciones aéreas en saltos de provincia */
  range: number;
  capacity: number;
  requires: string | null;
}

export const UNIT_INFO: Record<UnitType, UnitInfo> = {
  infantry: { type: 'infantry', name: 'División de infantería', short: 'INF', domain: 'land', manpower: 12, equipment: { arms: 1, vehicles: 0.1, aircraft: 0, ships: 0 }, cost: 0.3, upkeep: 0.14, trainingDays: 120, attack: 1, defense: 1.3, speed: 1, armor: 0, supplyUse: 1, fuelUse: 0.2, air: 0, naval: 0, range: 0, capacity: 0, requires: null },
  mechanized: { type: 'mechanized', name: 'División mecanizada', short: 'MEC', domain: 'land', manpower: 12, equipment: { arms: 0.8, vehicles: 0.7, aircraft: 0, ships: 0 }, cost: 0.9, upkeep: 0.32, trainingDays: 180, attack: 1.7, defense: 1.55, speed: 1.9, armor: 0.4, supplyUse: 1.4, fuelUse: 1, air: 0, naval: 0, range: 0, capacity: 0, requires: null },
  armored: { type: 'armored', name: 'División blindada', short: 'BLI', domain: 'land', manpower: 10, equipment: { arms: 0.4, vehicles: 1.5, aircraft: 0, ships: 0 }, cost: 1.8, upkeep: 0.55, trainingDays: 210, attack: 2.7, defense: 1.5, speed: 1.7, armor: 1, supplyUse: 1.9, fuelUse: 1.7, air: 0, naval: 0, range: 0, capacity: 0, requires: 'modern_armor' },
  artillery: { type: 'artillery', name: 'Brigada de artillería', short: 'ART', domain: 'land', manpower: 7, equipment: { arms: 0.5, vehicles: 0.5, aircraft: 0, ships: 0 }, cost: 0.7, upkeep: 0.22, trainingDays: 150, attack: 1.9, defense: 1.1, speed: 1.1, armor: 0.1, supplyUse: 1.6, fuelUse: 0.6, air: 0, naval: 0, range: 0, capacity: 0, requires: null },
  special_forces: { type: 'special_forces', name: 'Fuerzas especiales', short: 'FE', domain: 'land', manpower: 3, equipment: { arms: 0.5, vehicles: 0.1, aircraft: 0, ships: 0 }, cost: 0.45, upkeep: 0.15, trainingDays: 270, attack: 0.9, defense: 0.7, speed: 1.7, armor: 0, supplyUse: 0.4, fuelUse: 0.2, air: 0, naval: 0, range: 0, capacity: 0, requires: 'night_vision' },
  fighter: { type: 'fighter', name: 'Ala de caza', short: 'CAZ', domain: 'air', manpower: 2.5, equipment: { arms: 0.1, vehicles: 0, aircraft: 1, ships: 0 }, cost: 3, upkeep: 0.6, trainingDays: 270, attack: 0.3, defense: 0.3, speed: 6, armor: 0, supplyUse: 0.8, fuelUse: 2, air: 2, naval: 0.2, range: 5, capacity: 0, requires: 'jet_fighters_4g' },
  strike: { type: 'strike', name: 'Ala de ataque', short: 'ATQ', domain: 'air', manpower: 2.5, equipment: { arms: 0.1, vehicles: 0, aircraft: 0.85, ships: 0 }, cost: 2.6, upkeep: 0.55, trainingDays: 270, attack: 1.8, defense: 0.2, speed: 5, armor: 0, supplyUse: 1, fuelUse: 2, air: 0.6, naval: 0.6, range: 6, capacity: 0, requires: null },
  surface_fleet: { type: 'surface_fleet', name: 'Flota de superficie', short: 'FLO', domain: 'sea', manpower: 4, equipment: { arms: 0.2, vehicles: 0, aircraft: 0, ships: 1 }, cost: 4, upkeep: 0.8, trainingDays: 480, attack: 0.8, defense: 1, speed: 3, armor: 0.5, supplyUse: 1.2, fuelUse: 1.5, air: 0.6, naval: 2, range: 0, capacity: 0, requires: null },
  submarine_fleet: { type: 'submarine_fleet', name: 'Flotilla submarina', short: 'SUB', domain: 'sea', manpower: 2, equipment: { arms: 0.1, vehicles: 0, aircraft: 0, ships: 0.8 }, cost: 3.2, upkeep: 0.6, trainingDays: 540, attack: 0, defense: 0.6, speed: 2.5, armor: 0.2, supplyUse: 0.8, fuelUse: 0.8, air: 0, naval: 1.7, range: 0, capacity: 0, requires: null },
  amphibious_fleet: { type: 'amphibious_fleet', name: 'Grupo anfibio', short: 'ANF', domain: 'sea', manpower: 2, equipment: { arms: 0.2, vehicles: 0.2, aircraft: 0, ships: 0.8 }, cost: 2.2, upkeep: 0.45, trainingDays: 420, attack: 0.3, defense: 0.6, speed: 2.5, armor: 0.2, supplyUse: 0.8, fuelUse: 1.2, air: 0.2, naval: 0.6, range: 0, capacity: 3, requires: null },
  carrier_group: { type: 'carrier_group', name: 'Grupo de portaaviones', short: 'PAV', domain: 'sea', manpower: 7, equipment: { arms: 0.3, vehicles: 0, aircraft: 0.6, ships: 2.5 }, cost: 12, upkeep: 2.2, trainingDays: 900, attack: 1.4, defense: 1.4, speed: 3, armor: 0.6, supplyUse: 2, fuelUse: 2, air: 1.6, naval: 2.4, range: 4, capacity: 0, requires: 'carrier_aviation' }
};

/** Coste de producción de un "juego" de cada tipo de equipo, en miles de millones de UMI de 1990. */
export const EQUIPMENT_COST = { arms: 0.12, vehicles: 0.55, aircraft: 2.2, ships: 3.2 };
