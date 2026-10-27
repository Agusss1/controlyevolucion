import { useQuery } from '@tanstack/react-query';
import { serverAvailable } from './api';

/** null mientras se comprueba; true si hay servidor multijugador; false en alojamiento estático (modo local). */
export function useServer(): boolean | null {
  const q = useQuery({ queryKey: ['server-available'], queryFn: serverAvailable, staleTime: Infinity, retry: false });
  return q.data ?? null;
}
