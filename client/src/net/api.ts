import type { GameSettings, GameSummary, FlagSpec } from '@cyo/shared';

export interface SessionInfo { gameId: string; code: string; playerId: string; token: string; name: string; recovery?: string; savedAt: number }

const KEY = 'cyo.sessions.v1';
const PREFS = 'cyo.prefs.v1';

/** Sesiones persistentes en el navegador: permiten volver a la misma partida y al mismo país. */
export function loadSessions(): SessionInfo[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as SessionInfo[]; } catch { return []; }
}
export function saveSession(s: SessionInfo): void {
  const all = loadSessions().filter((x) => !(x.gameId === s.gameId && x.playerId === s.playerId));
  all.unshift(s);
  try { localStorage.setItem(KEY, JSON.stringify(all.slice(0, 40))); } catch { /* almacenamiento no disponible */ }
}
export function forgetSession(gameId: string): void {
  try { localStorage.setItem(KEY, JSON.stringify(loadSessions().filter((x) => x.gameId !== gameId))); } catch { /* */ }
}

export interface Prefs { playerName: string; reduceMotion: boolean; showTutorial: boolean; mapLabels: boolean; uiScale: number }
export const DEFAULT_PREFS: Prefs = { playerName: '', reduceMotion: false, showTutorial: true, mapLabels: true, uiScale: 1 };
export function loadPrefs(): Prefs {
  try { return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS) ?? '{}') as Partial<Prefs>) }; } catch { return DEFAULT_PREFS; }
}
export function savePrefs(p: Prefs): void { try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch { /* */ } }

async function req<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Error ${r.status}`);
  return j as T;
}

export interface CreatedGame { gameId: string; code: string; playerId: string; token: string; recovery: string; inviteUrl: string }
export interface CountryChoice { id: string; name: string; longName: string; color: string; flag: FlagSpec; regime: string; population: number; gdp: number; archetype: string; taken: boolean; strengths: string[]; weaknesses: string[]; history: string[] }

export const api = {
  createGame: (settings: Partial<GameSettings>, playerName: string, countryId: string | null) => req<CreatedGame>('/api/games', { settings, playerName, countryId }),
  join: (code: string, playerName: string, countryId: string | null) => req<CreatedGame>('/api/join', { code, playerName, countryId }),
  recover: (recovery: string) => req<{ gameId: string; code: string; playerId: string; token: string; name: string }>('/api/recover', { recovery }),
  preview: (code: string) => req<{ game: GameSummary; countries: CountryChoice[]; players: { name: string; countryId: string | null }[] }>(`/api/games/code/${encodeURIComponent(code.trim().toUpperCase())}`),
  publicGames: () => req<GameSummary[]>('/api/games/public'),
  mine: (ids: string[]) => req<GameSummary[]>('/api/games/mine', { ids })
};
