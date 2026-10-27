import type { GameEvent, GameSettings, WorldMap, WorldState } from '@cyo/shared';

/**
 * Partidas locales guardadas en el navegador (IndexedDB). Se usa desde el hilo principal (listar,
 * borrar) y desde el worker del motor (guardar, cargar). La metadata va en un almacén aparte para
 * listar partidas sin cargar el estado completo (~1-3 MB por partida).
 */
export interface LocalMeta {
  id: string;
  name: string;
  playerName: string;
  countryId: string | null;
  countryName: string | null;
  worldName: string;
  status: 'lobby' | 'running';
  day: number;
  createdAt: number;
  updatedAt: number;
}

export interface LocalSave {
  id: string;
  settings: GameSettings;
  status: 'lobby' | 'running';
  playerName: string;
  countryId: string | null;
  ready: boolean;
  createdAt: number;
  activeMs: number;
  map: WorldMap;
  state: WorldState;
  /** últimos acontecimientos (para el historial de noticias) */
  events: GameEvent[];
  /** indicadores mensuales por país */
  stats: { day: number; country: string; data: unknown }[];
}

const DB_NAME = 'cyo-local';
const SAVES = 'saves';
const META = 'meta';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SAVES)) db.createObjectStore(SAVES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir el almacenamiento del navegador.'));
  });
}

function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then((db) => new Promise<T | undefined>((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const r = fn(t);
    t.oncomplete = () => { db.close(); resolve(r ? r.result : undefined); };
    t.onerror = () => { db.close(); reject(t.error ?? new Error('Error de almacenamiento.')); };
    t.onabort = () => { db.close(); reject(t.error ?? new Error('Almacenamiento lleno o no disponible.')); };
  }));
}

export function metaOf(s: LocalSave): LocalMeta {
  const c = s.countryId ? s.state.countries[s.countryId] : null;
  return {
    id: s.id, name: s.settings.name, playerName: s.playerName, countryId: s.countryId, countryName: c?.name ?? null,
    worldName: s.state.scenario.name, status: s.status, day: s.state.day, createdAt: s.createdAt, updatedAt: Date.now()
  };
}

export async function putSave(s: LocalSave): Promise<void> {
  const meta = metaOf(s);
  await tx([SAVES, META], 'readwrite', (t) => { t.objectStore(SAVES).put(s); t.objectStore(META).put(meta); });
}

export async function getSave(id: string): Promise<LocalSave | null> {
  return (await tx<LocalSave>([SAVES], 'readonly', (t) => t.objectStore(SAVES).get(id))) ?? null;
}

export async function listSaves(): Promise<LocalMeta[]> {
  const all = (await tx<LocalMeta[]>([META], 'readonly', (t) => t.objectStore(META).getAll())) ?? [];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteSave(id: string): Promise<void> {
  await tx([SAVES, META], 'readwrite', (t) => { t.objectStore(SAVES).delete(id); t.objectStore(META).delete(id); });
}
