import { create } from 'zustand';
import type { WorldMap, GameSummary, GameSettings, LobbyPlayer, ChatMessage, GameEvent } from '@cyo/shared';
import type { WorldView, PrivateView } from '@cyo/simulation';
import type { SessionInfo } from '../net/api';

export type MapLayer = 'political' | 'geographic' | 'economic' | 'population' | 'resources' | 'infrastructure' | 'trade' | 'diplomacy' | 'alliances' | 'military' | 'fronts' | 'stability' | 'technology' | 'culture';
export type PanelId = 'overview' | 'government' | 'economy' | 'budget' | 'taxes' | 'society' | 'infrastructure' | 'industry' | 'energy' | 'trade' | 'defense' | 'diplomacy' | 'intelligence' | 'technology' | 'legislation' | 'elections' | 'statistics' | 'history' | 'news' | 'world';
export type Screen = 'menu' | 'create' | 'join' | 'continue' | 'settings' | 'info' | 'game';

export interface Toast { id: number; text: string; kind: 'info' | 'error' | 'success' }

interface GameStore {
  screen: Screen;
  connection: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  connectionError: string | null;
  session: SessionInfo | null;
  you: { playerId: string; name: string; countryId: string | null; admin: boolean } | null;
  game: GameSummary | null;
  settings: GameSettings | null;
  players: LobbyPlayer[];
  adminId: string | null;
  map: WorldMap | null;
  view: WorldView | null;
  priv: PrivateView | null;
  date: string;
  chat: ChatMessage[];
  news: GameEvent[];
  unreadNews: number;
  selectedProvince: string | null;
  selectedCountry: string | null;
  selectedUnits: string[];
  layer: MapLayer;
  panel: PanelId | null;
  warRoom: string | null;
  diploTarget: string | null;
  toasts: Toast[];
  setScreen(s: Screen): void;
  setSession(s: SessionInfo | null): void;
  setConnection(c: GameStore['connection'], err?: string): void;
  reset(): void;
  applyInit(d: Record<string, unknown>): void;
  applyState(d: Record<string, unknown>): void;
  applyLobby(d: Record<string, unknown>): void;
  setStarted(): void;
  pushEvents(e: GameEvent[]): void;
  pushChat(m: ChatMessage): void;
  selectProvince(id: string | null): void;
  selectCountry(id: string | null): void;
  setSelectedUnits(ids: string[]): void;
  setLayer(l: MapLayer): void;
  openPanel(p: PanelId | null): void;
  openWarRoom(id: string | null): void;
  openDiplomacy(country: string | null): void;
  toast(text: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;
  markNewsRead(): void;
}

let toastId = 1;

export const useGame = create<GameStore>((set, get) => ({
  screen: 'menu', connection: 'idle', connectionError: null, session: null, you: null, game: null, settings: null, players: [], adminId: null,
  map: null, view: null, priv: null, date: '', chat: [], news: [], unreadNews: 0,
  selectedProvince: null, selectedCountry: null, selectedUnits: [], layer: 'political', panel: null, warRoom: null, diploTarget: null, toasts: [],
  setScreen: (screen) => set({ screen }),
  setSession: (session) => set({ session }),
  setConnection: (connection, err) => set({ connection, connectionError: err ?? null }),
  reset: () => set({ you: null, game: null, settings: null, players: [], map: null, view: null, priv: null, chat: [], news: [], selectedProvince: null, selectedCountry: null, selectedUnits: [], panel: null, warRoom: null }),
  applyInit: (d) => {
    const view = d.view as WorldView;
    set({
      you: d.you as GameStore['you'], game: d.game as GameSummary, settings: d.settings as GameSettings, players: d.players as LobbyPlayer[], map: d.map as WorldMap,
      view, priv: d.private as PrivateView | null, date: d.date as string, chat: d.chat as ChatMessage[], news: view?.news?.slice().reverse() ?? [],
      adminId: (d.players as LobbyPlayer[]).find((p) => p.role === 'admin')?.id ?? null
    });
  },
  applyState: (d) => {
    const view = d.view as WorldView;
    const priv = d.private as PrivateView | null;
    const you = get().you;
    set({ view, priv, date: d.date as string, you: you && priv ? { ...you, countryId: priv.country.id } : you });
  },
  applyLobby: (d) => {
    const players = d.players as LobbyPlayer[];
    const you = get().you;
    const me = players.find((p) => p.id === you?.playerId);
    set({ game: d.game as GameSummary, settings: d.settings as GameSettings, players, adminId: d.admin as string, you: you && me ? { ...you, countryId: me.countryId, admin: d.admin === you.playerId } : you });
  },
  setStarted: () => set((s) => ({ game: s.game ? { ...s.game, status: 'running' } : s.game })),
  pushEvents: (events) => set((s) => ({ news: [...events.slice().reverse(), ...s.news].slice(0, 400), unreadNews: s.unreadNews + events.filter((e) => e.severity !== 'info').length })),
  pushChat: (m) => set((s) => ({ chat: [...s.chat, m].slice(-400) })),
  selectProvince: (id) => set({ selectedProvince: id }),
  selectCountry: (id) => set({ selectedCountry: id }),
  setSelectedUnits: (ids) => set({ selectedUnits: ids }),
  setLayer: (layer) => set({ layer }),
  openPanel: (panel) => set({ panel }),
  openWarRoom: (warRoom) => set({ warRoom }),
  openDiplomacy: (country) => set({ diploTarget: country, panel: 'diplomacy' }),
  toast: (text, kind = 'info') => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }].slice(-5) }));
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  markNewsRead: () => set({ unreadNews: 0 })
}));

/** País propio (vista privada completa). */
export function useMyCountry() { return useGame((s) => s.priv?.country ?? null); }
export function useCountryView(id: string | null | undefined) { return useGame((s) => (id ? s.view?.countries.find((c) => c.id === id) ?? null : null)); }
