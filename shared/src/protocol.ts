import type { CountryId } from './types.js';

export type ClockMode = 'when_online' | 'always' | 'paused';

export interface GameSettings {
  name: string;
  maxPlayers: number;
  privacy: 'public' | 'private';
  advancedAI: boolean;
  clockMode: ClockMode;
  world: { mode: 'official' | 'random'; seed?: string; countries?: number };
  /** segundos reales de gracia antes de congelar una guerra por desconexión */
  warGraceSeconds: number;
  /** días de juego de preparación antes de iniciar operaciones */
  warPrepDays: number;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  countryId: CountryId | null;
  ready: boolean;
  role: 'admin' | 'player';
  online: boolean;
  lastSeen: number;
}

export interface GameSummary {
  id: string;
  code: string;
  name: string;
  status: 'lobby' | 'running' | 'ended';
  players: number;
  maxPlayers: number;
  day: number;
  privacy: 'public' | 'private';
  worldName: string;
  clockMode: ClockMode;
  createdAt: number;
}

export interface ChatMessage { id: string; channel: string; playerId: string; playerName: string; countryId: CountryId | null; text: string; at: number }

export interface DiplomaticMessage { id: string; from: CountryId; to: CountryId; subject: string; body: string; day: number; at: number; read: boolean }

export interface Session { gameId: string; code: string; playerId: string; token: string; name: string }

export const DEFAULT_SETTINGS: GameSettings = {
  name: 'Partida de CYO',
  maxPlayers: 8,
  privacy: 'private',
  advancedAI: true,
  clockMode: 'when_online',
  world: { mode: 'official' },
  warGraceSeconds: 90,
  warPrepDays: 3
};
