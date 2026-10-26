import type { GeoParams } from '../worldgen/geography.js';

/**
 * Geografía DISEÑADA del mundo oficial de CYO ("Vereth").
 * Coordenadas normalizadas 0..1 (x hacia el este, y hacia el sur). El ecuador está en y = 0.56.
 */
export const OFFICIAL_SEED = 'CYO-VERETH-1990';

export const OFFICIAL_GEO: GeoParams = {
  seed: OFFICIAL_SEED,
  width: 180,
  height: 112,
  landFraction: 0.37,
  equator: 0.56,
  provinceCells: 17,
  seaZoneCells: 150,
  blobs: [
    // Aurelia (noroeste, templada, industrial)
    { x: 0.21, y: 0.27, rx: 0.13, ry: 0.13, rot: 0.2 },
    { x: 0.11, y: 0.38, rx: 0.06, ry: 0.09, rot: -0.3 },
    { x: 0.31, y: 0.19, rx: 0.08, ry: 0.06, rot: 0.4 },
    { x: 0.27, y: 0.38, rx: 0.06, ry: 0.06 },
    // Kharzun (noreste, estepas y montañas)
    { x: 0.64, y: 0.24, rx: 0.17, ry: 0.11, rot: -0.1 },
    { x: 0.82, y: 0.28, rx: 0.09, ry: 0.11, rot: 0.3 },
    { x: 0.53, y: 0.34, rx: 0.07, ry: 0.07 },
    { x: 0.73, y: 0.14, rx: 0.1, ry: 0.05 },
    // Solvara (península desértica central, unida a Kharzun por el istmo de Qeddah)
    { x: 0.45, y: 0.49, rx: 0.07, ry: 0.1, rot: 0.25 },
    { x: 0.5, y: 0.42, rx: 0.035, ry: 0.04 },
    { x: 0.43, y: 0.59, rx: 0.04, ry: 0.05 },
    // Meridia (suroeste, tropical-austral)
    { x: 0.21, y: 0.66, rx: 0.11, ry: 0.13, rot: 0.15 },
    { x: 0.28, y: 0.8, rx: 0.07, ry: 0.08, rot: -0.3 },
    { x: 0.14, y: 0.56, rx: 0.06, ry: 0.05 },
    // Ostria (sureste, isla-continente)
    { x: 0.79, y: 0.69, rx: 0.085, ry: 0.075, rot: 0.5 },
    { x: 0.87, y: 0.6, rx: 0.04, ry: 0.04 },
    // Archipiélago de Velmar (mar central)
    { x: 0.58, y: 0.6, rx: 0.025, ry: 0.025, weight: 0.85 },
    { x: 0.62, y: 0.67, rx: 0.03, ry: 0.025, weight: 0.85 },
    { x: 0.55, y: 0.71, rx: 0.025, ry: 0.02, weight: 0.85 },
    { x: 0.66, y: 0.58, rx: 0.02, ry: 0.02, weight: 0.8 },
    { x: 0.6, y: 0.76, rx: 0.02, ry: 0.02, weight: 0.8 },
    // Islas Brumas (norte)
    { x: 0.42, y: 0.09, rx: 0.035, ry: 0.025, weight: 0.85 },
    { x: 0.49, y: 0.08, rx: 0.025, ry: 0.02, weight: 0.8 },
    // Isla de Sarn (océano occidental)
    { x: 0.05, y: 0.62, rx: 0.025, ry: 0.035, weight: 0.85 },
    // Halenui (isla tecnológica al este de Ostria)
    { x: 0.94, y: 0.75, rx: 0.02, ry: 0.025, weight: 0.85 },
    // Coralia (isla al este de Meridia)
    { x: 0.35, y: 0.7, rx: 0.02, ry: 0.025, weight: 0.85 }
  ],
  ridges: [
    { x1: 0.14, y1: 0.24, x2: 0.27, y2: 0.33, width: 0.016, height: 0.9 }, // Montes Cendrios
    { x1: 0.07, y1: 0.34, x2: 0.12, y2: 0.45, width: 0.014, height: 0.7 },
    { x1: 0.56, y1: 0.2, x2: 0.6, y2: 0.36, width: 0.015, height: 1 }, // Cordillera Kharz
    { x1: 0.76, y1: 0.2, x2: 0.86, y2: 0.36, width: 0.014, height: 0.8 },
    { x1: 0.11, y1: 0.56, x2: 0.2, y2: 0.86, width: 0.012, height: 1 }, // Sierra Mayor de Meridia
    { x1: 0.45, y1: 0.4, x2: 0.47, y2: 0.47, width: 0.012, height: 0.7 },
    { x1: 0.74, y1: 0.66, x2: 0.82, y2: 0.73, width: 0.012, height: 0.8 } // Altos de Ostria
  ],
  climateZones: [
    { x: 0.45, y: 0.5, r: 0.12, moisture: -0.55 }, // desierto de Solvara
    { x: 0.66, y: 0.36, r: 0.1, moisture: -0.22 }, // estepa kharzi
    { x: 0.26, y: 0.84, r: 0.07, moisture: -0.15 }, // estepa austral
    { x: 0.2, y: 0.62, r: 0.08, moisture: 0.25 }, // selva meridiana
    { x: 0.2, y: 0.26, r: 0.1, moisture: 0.1 }
  ],
  hotspots: [
    { x: 0.46, y: 0.5, r: 0.08, resource: 'oil', amount: 3.5 },
    { x: 0.51, y: 0.42, r: 0.04, resource: 'oil', amount: 3 },
    { x: 0.7, y: 0.3, r: 0.07, resource: 'gas', amount: 2.5 },
    { x: 0.66, y: 0.15, r: 0.06, resource: 'oil', amount: 1.6 },
    { x: 0.25, y: 0.62, r: 0.04, resource: 'oil', amount: 1.5 },
    { x: 0.16, y: 0.75, r: 0.05, resource: 'minerals', amount: 2.5 },
    { x: 0.3, y: 0.3, r: 0.05, resource: 'coal', amount: 2 },
    { x: 0.58, y: 0.28, r: 0.05, resource: 'minerals', amount: 2 },
    { x: 0.08, y: 0.18, r: 0.05, resource: 'gas', amount: 1.5 }
  ]
};
