import type { SectorId } from '@cyo/shared';

export interface SectorInfo {
  id: SectorId;
  name: string;
  /** elasticidad del capital en Cobb-Douglas */
  alpha: number;
  /** relación capital/producto inicial */
  capitalOutput: number;
  /** productividad laboral relativa (para distribuir empleo inicial) */
  laborProductivity: number;
  /** comerciable internacionalmente como bien manufacturado/servicio */
  tradable: number;
  /** intensidad de uso de combustibles (valor de energía por unidad de producto) */
  energy: number;
  /** intensidad de uso de minerales */
  minerals: number;
  /** extractivo: limitado por reservas en provincias */
  extractive: boolean;
  /** monopolio natural: sensible a la regulación tras privatizar */
  naturalMonopoly: boolean;
  /** tasa de depreciación anual */
  depreciation: number;
}

export const SECTOR_INFO: Record<SectorId, SectorInfo> = {
  agriculture: { id: 'agriculture', name: 'Agricultura', alpha: 0.3, capitalOutput: 2.2, laborProductivity: 0.35, tradable: 0, energy: 0.03, minerals: 0.01, extractive: false, naturalMonopoly: false, depreciation: 0.05 },
  livestock: { id: 'livestock', name: 'Ganadería', alpha: 0.3, capitalOutput: 2.4, laborProductivity: 0.45, tradable: 0, energy: 0.02, minerals: 0, extractive: false, naturalMonopoly: false, depreciation: 0.05 },
  mining: { id: 'mining', name: 'Minería', alpha: 0.6, capitalOutput: 3.2, laborProductivity: 2.2, tradable: 0, energy: 0.06, minerals: 0, extractive: true, naturalMonopoly: false, depreciation: 0.07 },
  oil: { id: 'oil', name: 'Petróleo', alpha: 0.85, capitalOutput: 3.8, laborProductivity: 7, tradable: 0, energy: 0.02, minerals: 0.01, extractive: true, naturalMonopoly: false, depreciation: 0.07 },
  gas: { id: 'gas', name: 'Gas', alpha: 0.85, capitalOutput: 4.2, laborProductivity: 6, tradable: 0, energy: 0.02, minerals: 0.01, extractive: true, naturalMonopoly: true, depreciation: 0.06 },
  energy: { id: 'energy', name: 'Energía eléctrica', alpha: 0.7, capitalOutput: 4.5, laborProductivity: 3, tradable: 0, energy: 0.35, minerals: 0.01, extractive: false, naturalMonopoly: true, depreciation: 0.045 },
  industry: { id: 'industry', name: 'Industria', alpha: 0.38, capitalOutput: 2.4, laborProductivity: 1.2, tradable: 0.55, energy: 0.07, minerals: 0.06, extractive: false, naturalMonopoly: false, depreciation: 0.07 },
  construction: { id: 'construction', name: 'Construcción', alpha: 0.3, capitalOutput: 1.2, laborProductivity: 0.9, tradable: 0, energy: 0.03, minerals: 0.05, extractive: false, naturalMonopoly: false, depreciation: 0.08 },
  transport: { id: 'transport', name: 'Transporte', alpha: 0.45, capitalOutput: 3.5, laborProductivity: 1.1, tradable: 0.15, energy: 0.1, minerals: 0.01, extractive: false, naturalMonopoly: false, depreciation: 0.06 },
  telecom: { id: 'telecom', name: 'Telecomunicaciones', alpha: 0.6, capitalOutput: 3.6, laborProductivity: 2.5, tradable: 0.05, energy: 0.02, minerals: 0.005, extractive: false, naturalMonopoly: true, depreciation: 0.09 },
  services: { id: 'services', name: 'Servicios', alpha: 0.3, capitalOutput: 1.6, laborProductivity: 0.9, tradable: 0.08, energy: 0.012, minerals: 0, extractive: false, naturalMonopoly: false, depreciation: 0.05 },
  finance: { id: 'finance', name: 'Finanzas', alpha: 0.45, capitalOutput: 1.5, laborProductivity: 2.8, tradable: 0.25, energy: 0.005, minerals: 0, extractive: false, naturalMonopoly: false, depreciation: 0.06 },
  tech: { id: 'tech', name: 'Tecnología', alpha: 0.45, capitalOutput: 1.8, laborProductivity: 2.4, tradable: 0.6, energy: 0.02, minerals: 0.02, extractive: false, naturalMonopoly: false, depreciation: 0.12 },
  tourism: { id: 'tourism', name: 'Turismo', alpha: 0.35, capitalOutput: 2.4, laborProductivity: 0.7, tradable: 0.9, energy: 0.03, minerals: 0, extractive: false, naturalMonopoly: false, depreciation: 0.05 },
  defense: { id: 'defense', name: 'Industria militar', alpha: 0.4, capitalOutput: 2.5, laborProductivity: 1.3, tradable: 0.2, energy: 0.05, minerals: 0.06, extractive: false, naturalMonopoly: false, depreciation: 0.07 }
};

/** Estructuras sectoriales iniciales (participación en el PIB) por arquetipo. */
export const ARCHETYPE_SECTORS: Record<string, Partial<Record<SectorId, number>>> = {
  industrial: { agriculture: 0.03, livestock: 0.01, mining: 0.01, energy: 0.03, industry: 0.27, construction: 0.07, transport: 0.06, telecom: 0.03, services: 0.33, finance: 0.08, tech: 0.04, tourism: 0.02, defense: 0.02 },
  emerging_industrial: { agriculture: 0.1, livestock: 0.03, mining: 0.02, energy: 0.03, industry: 0.27, construction: 0.08, transport: 0.06, telecom: 0.02, services: 0.3, finance: 0.04, tech: 0.02, tourism: 0.02, defense: 0.01 },
  socialist_industrial: { agriculture: 0.12, livestock: 0.04, mining: 0.04, energy: 0.04, industry: 0.32, construction: 0.08, transport: 0.07, telecom: 0.01, services: 0.17, finance: 0.01, tech: 0.02, tourism: 0.01, defense: 0.07 },
  socialist_agrarian: { agriculture: 0.26, livestock: 0.08, mining: 0.03, energy: 0.03, industry: 0.2, construction: 0.07, transport: 0.05, telecom: 0.01, services: 0.2, finance: 0.01, tech: 0.01, tourism: 0.01, defense: 0.04 },
  petrostate: { agriculture: 0.03, livestock: 0.02, mining: 0.02, oil: 0.4, gas: 0.08, energy: 0.03, industry: 0.06, construction: 0.09, transport: 0.05, telecom: 0.02, services: 0.15, finance: 0.03, tourism: 0.01, defense: 0.01 },
  resource_exporter: { agriculture: 0.12, livestock: 0.06, mining: 0.16, oil: 0.04, energy: 0.03, industry: 0.12, construction: 0.07, transport: 0.06, telecom: 0.02, services: 0.24, finance: 0.04, tourism: 0.03, defense: 0.01 },
  agrarian: { agriculture: 0.3, livestock: 0.1, mining: 0.03, energy: 0.02, industry: 0.1, construction: 0.06, transport: 0.05, telecom: 0.01, services: 0.27, finance: 0.02, tourism: 0.03, defense: 0.01 },
  tech_trader: { agriculture: 0.01, energy: 0.03, industry: 0.2, construction: 0.06, transport: 0.08, telecom: 0.05, services: 0.3, finance: 0.12, tech: 0.12, tourism: 0.02, defense: 0.01 },
  services_finance: { agriculture: 0.02, livestock: 0.01, energy: 0.03, industry: 0.13, construction: 0.06, transport: 0.06, telecom: 0.04, services: 0.37, finance: 0.2, tech: 0.04, tourism: 0.03, defense: 0.01 },
  tourism_islands: { agriculture: 0.06, livestock: 0.02, energy: 0.03, industry: 0.06, construction: 0.08, transport: 0.08, telecom: 0.02, services: 0.35, finance: 0.06, tourism: 0.23, defense: 0.01 },
  mixed_developing: { agriculture: 0.18, livestock: 0.06, mining: 0.05, oil: 0.03, energy: 0.03, industry: 0.16, construction: 0.07, transport: 0.05, telecom: 0.01, services: 0.28, finance: 0.03, tourism: 0.03, defense: 0.02 },
  military_industrial: { agriculture: 0.1, livestock: 0.04, mining: 0.05, oil: 0.05, gas: 0.04, energy: 0.04, industry: 0.26, construction: 0.07, transport: 0.06, telecom: 0.01, services: 0.15, finance: 0.01, tech: 0.02, tourism: 0.01, defense: 0.09 }
};
