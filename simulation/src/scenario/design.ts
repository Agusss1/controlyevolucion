import type { CultureDef, DimVector, FlagSpec, ReligionDef, RegimeId, TreatyType } from '@cyo/shared';
import type { GeoParams } from '../worldgen/geography.js';

/** Descripción de un país antes de construir el estado inicial. */
export interface CountryDesign {
  key: string;
  name: string;
  longName: string;
  adjective: string;
  culture: string;
  religion: string;
  anchor: [number, number];
  /** peso territorial relativo dentro de su masa continental */
  weight: number;
  /** población en millones (1990) */
  population: number;
  /** PIB per cápita en UMI de 1990 */
  gdpPerCapita: number;
  regime: RegimeId;
  archetype: string;
  ideology: Partial<DimVector>;
  bloc: string | null;
  /** multiplicador de fuerza militar respecto a lo típico por PIB/población */
  military: number;
  /** 0..1 nivel tecnológico de partida */
  techLevel: number;
  /** 0..1 calidad institucional (estado de derecho, capacidad administrativa) */
  institutions: number;
  gini: number;
  debt: number;
  inflation: number;
  stateShare: number;
  /** 0..1 apertura comercial */
  openness: number;
  color: string;
  flag: FlagSpec;
  currency: { name: string; code: string; rate: number };
  capitalName: string;
  foundedYear: number;
  history: string[];
  strengths: string[];
  weaknesses: string[];
  aiProfile: string;
  laws?: Record<string, string>;
  religiosity?: number;
}

export interface DesignOrganization { name: string; kind: 'economic' | 'military' | 'political' | 'scientific'; members: string[]; tariffCut: number; mutualDefense: boolean; scienceShare: number }
export interface DesignTreaty { type: TreatyType; parties: [string, string]; name?: string }
export interface DesignRelation { a: string; b: string; rivalry?: number; opinion?: number }
export interface DesignClaim { claimant: string; x: number; y: number; r: number; reason: string }

export interface WorldDesign {
  name: string;
  mode: 'official' | 'random';
  seed: string;
  geo: GeoParams;
  cultures: (CultureDef & { anchors: [number, number][] })[];
  religions: (ReligionDef & { anchors: [number, number][] })[];
  countries: CountryDesign[];
  /** masas de tierra sin capital propia asignadas a un país (territorios de ultramar) */
  territories: { x: number; y: number; owner: string }[];
  oceans: { name: string; x: number; y: number }[];
  organizations: DesignOrganization[];
  treaties: DesignTreaty[];
  relations: DesignRelation[];
  claims: DesignClaim[];
  /** historia general del mundo */
  worldHistory: string[];
  /** nombres diseñados para masas de tierra, accidentes y ríos (se aplican al más cercano) */
  landmassNames?: { x: number; y: number; name: string }[];
  featureNames?: { x: number; y: number; name: string; kind: 'mountains' | 'desert' | 'forest' | 'lake' | 'plains' | 'river' }[];
}
