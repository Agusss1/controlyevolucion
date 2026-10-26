import type { CountryState } from '@cyo/shared';
import { useGame } from '../store/game';

export function totalRevenueOf(c: CountryState): number { let s = 0; for (const v of Object.values(c.fiscal.revenue ?? {})) s += v; return s; }
export function popOf(c: CountryState): number { return c.demography.young + c.demography.adult + c.demography.old; }
export function debtRatio(c: CountryState, ngdp: number): number { return (c.fiscal.debtDomestic + c.fiscal.debtForeign * c.econ.exchangeRate) / Math.max(1e-9, ngdp); }

export function useMe() {
  const priv = useGame((s) => s.priv);
  return priv;
}

export function provinceName(id: string): string {
  const map = useGame.getState().map;
  return map?.provinces.find((p) => p.id === id)?.name ?? map?.seaZones.find((z) => z.id === id)?.name ?? id;
}
export function countryName(id: string): string { return useGame.getState().view?.countries.find((c) => c.id === id)?.name ?? id; }
