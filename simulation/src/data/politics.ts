import type { DimVector, GroupId, RegimeId } from '@cyo/shared';

export const GROUP_INFO: Record<GroupId, { name: string; ideal: DimVector; elite: number }> = {
  workers: { name: 'Trabajadores industriales', ideal: { econ: -0.4, welfare: 0.7, authority: 0, social: 0, nation: 0.2, central: 0.2 }, elite: 0.2 },
  farmers: { name: 'Campesinos y productores rurales', ideal: { econ: 0, welfare: 0.3, authority: 0.2, social: -0.5, nation: 0.4, central: -0.2 }, elite: 0.2 },
  business: { name: 'Empresarios', ideal: { econ: 0.8, welfare: -0.4, authority: 0, social: 0, nation: 0, central: 0.1 }, elite: 1.6 },
  middle: { name: 'Clases medias profesionales', ideal: { econ: 0.3, welfare: 0.2, authority: -0.5, social: 0.3, nation: -0.1, central: 0 }, elite: 0.6 },
  public: { name: 'Empleados públicos', ideal: { econ: -0.3, welfare: 0.6, authority: 0, social: 0.1, nation: 0.1, central: 0.5 }, elite: 0.6 },
  pensioners: { name: 'Jubilados', ideal: { econ: 0, welfare: 0.8, authority: 0.2, social: -0.4, nation: 0.3, central: 0.3 }, elite: 0.3 },
  youth: { name: 'Jóvenes y estudiantes', ideal: { econ: 0, welfare: 0.4, authority: -0.6, social: 0.6, nation: -0.2, central: 0 }, elite: 0.4 },
  military: { name: 'Fuerzas armadas', ideal: { econ: 0, welfare: 0, authority: 0.7, social: -0.4, nation: 0.8, central: 0.8 }, elite: 2.5 },
  religious: { name: 'Sectores religiosos', ideal: { econ: 0, welfare: 0.3, authority: 0.4, social: -0.9, nation: 0.4, central: 0.2 }, elite: 1.2 },
  minorities: { name: 'Minorías culturales', ideal: { econ: 0, welfare: 0.4, authority: -0.4, social: 0.2, nation: -0.8, central: -0.9 }, elite: 0.3 }
};

export interface PartyFamily { id: string; name: string; short: string; color: string; pos: DimVector }

export const PARTY_FAMILIES: PartyFamily[] = [
  { id: 'communist', name: 'Partido Comunista', short: 'PC', color: '#b22222', pos: { econ: -0.95, welfare: 0.8, authority: 0.5, social: 0, nation: 0.1, central: 0.8 } },
  { id: 'socialist', name: 'Partido Socialista', short: 'PS', color: '#e05a5a', pos: { econ: -0.5, welfare: 0.8, authority: -0.2, social: 0.4, nation: -0.1, central: 0.3 } },
  { id: 'socialdemocrat', name: 'Partido Socialdemócrata', short: 'PSD', color: '#e8837a', pos: { econ: -0.1, welfare: 0.6, authority: -0.4, social: 0.4, nation: -0.2, central: 0.1 } },
  { id: 'green', name: 'Partido Verde', short: 'PV', color: '#4caf50', pos: { econ: -0.2, welfare: 0.5, authority: -0.6, social: 0.8, nation: -0.5, central: -0.3 } },
  { id: 'liberal', name: 'Partido Liberal', short: 'PL', color: '#f2c94c', pos: { econ: 0.7, welfare: -0.2, authority: -0.6, social: 0.5, nation: -0.4, central: -0.1 } },
  { id: 'centrist', name: 'Unión de Centro', short: 'UC', color: '#f2a74c', pos: { econ: 0.2, welfare: 0.2, authority: -0.1, social: 0, nation: 0, central: 0.2 } },
  { id: 'christian', name: 'Partido Confesional', short: 'PCF', color: '#4a6fb0', pos: { econ: 0.2, welfare: 0.3, authority: 0.2, social: -0.6, nation: 0.2, central: 0.2 } },
  { id: 'conservative', name: 'Partido Conservador', short: 'PCO', color: '#2f4f8f', pos: { econ: 0.6, welfare: -0.1, authority: 0.3, social: -0.5, nation: 0.4, central: 0.4 } },
  { id: 'nationalist', name: 'Frente Nacional', short: 'FN', color: '#3a2a6a', pos: { econ: 0.1, welfare: 0.2, authority: 0.7, social: -0.6, nation: 0.95, central: 0.8 } },
  { id: 'agrarian', name: 'Partido Agrario', short: 'PA', color: '#8bc34a', pos: { econ: 0, welfare: 0.3, authority: 0.1, social: -0.4, nation: 0.4, central: -0.5 } },
  { id: 'regionalist', name: 'Coalición Regionalista', short: 'CR', color: '#ff9800', pos: { econ: 0.1, welfare: 0.3, authority: -0.3, social: 0.1, nation: -0.7, central: -0.95 } },
  { id: 'populist', name: 'Movimiento Popular', short: 'MP', color: '#9c27b0', pos: { econ: -0.3, welfare: 0.7, authority: 0.4, social: -0.2, nation: 0.6, central: 0.5 } },
  { id: 'military', name: 'Movimiento Cívico-Militar', short: 'MCM', color: '#5d4037', pos: { econ: 0.2, welfare: 0, authority: 0.9, social: -0.5, nation: 0.9, central: 0.9 } },
  { id: 'royalist', name: 'Partido Monárquico', short: 'PM', color: '#6a1b9a', pos: { econ: 0.3, welfare: 0.1, authority: 0.7, social: -0.7, nation: 0.6, central: 0.8 } },
  { id: 'clerical', name: 'Consejo de la Fe', short: 'CF', color: '#00695c', pos: { econ: 0, welfare: 0.4, authority: 0.8, social: -1, nation: 0.6, central: 0.7 } }
];

export const REGIME_INFO: Record<RegimeId, { name: string; democratic: boolean; baseLegitimacy: number; decreeFreedom: number; eliteGroups: string[] }> = {
  parliamentary_democracy: { name: 'Democracia parlamentaria', democratic: true, baseLegitimacy: 72, decreeFreedom: 0.05, eliteGroups: [] },
  presidential_republic: { name: 'República presidencial', democratic: true, baseLegitimacy: 65, decreeFreedom: 0.25, eliteGroups: [] },
  constitutional_monarchy: { name: 'Monarquía constitucional', democratic: true, baseLegitimacy: 74, decreeFreedom: 0.05, eliteGroups: [] },
  absolute_monarchy: { name: 'Monarquía absoluta', democratic: false, baseLegitimacy: 55, decreeFreedom: 1, eliteGroups: ['religious', 'military', 'business'] },
  one_party_state: { name: 'Estado de partido único', democratic: false, baseLegitimacy: 48, decreeFreedom: 1, eliteGroups: ['public', 'military', 'workers'] },
  military_junta: { name: 'Junta militar', democratic: false, baseLegitimacy: 35, decreeFreedom: 1, eliteGroups: ['military', 'business'] },
  theocracy: { name: 'Teocracia', democratic: false, baseLegitimacy: 55, decreeFreedom: 1, eliteGroups: ['religious', 'military'] }
};

export function dimDistance(a: DimVector, b: DimVector): number {
  return Math.sqrt(
    (a.econ - b.econ) ** 2 + (a.welfare - b.welfare) ** 2 + (a.authority - b.authority) ** 2 +
    (a.social - b.social) ** 2 + (a.nation - b.nation) ** 2 + (a.central - b.central) ** 2
  ) / Math.sqrt(6);
}

export function fullDims(p: Partial<DimVector>): DimVector {
  return { econ: p.econ ?? 0, welfare: p.welfare ?? 0, authority: p.authority ?? 0, social: p.social ?? 0, nation: p.nation ?? 0, central: p.central ?? 0 };
}
