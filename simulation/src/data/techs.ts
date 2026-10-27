import type { SectorId } from '@cyo/shared';

/**
 * Árbol tecnológico desde 1990. "year" es solo la referencia histórica de madurez que fija
 * la dificultad; NO es una fecha obligatoria: un país que invierte fuerte puede adelantarse
 * y el mundo puede no alcanzar nunca algunas tecnologías. Las tecnologías posteriores a
 * 2026 son plausibles pero inciertas (coste variable y descubrimiento probabilístico).
 */

export type TechArea = 'computing' | 'telecom' | 'internet' | 'medicine' | 'biotech' | 'energy' | 'industry' | 'transport' |
  'aerospace' | 'agriculture' | 'materials' | 'defense' | 'ai' | 'automation';

export const TECH_AREAS: { id: TechArea; name: string }[] = [
  { id: 'computing', name: 'Informática' }, { id: 'telecom', name: 'Telecomunicaciones' }, { id: 'internet', name: 'Internet' },
  { id: 'medicine', name: 'Medicina' }, { id: 'biotech', name: 'Biotecnología' }, { id: 'energy', name: 'Energía' },
  { id: 'industry', name: 'Industria' }, { id: 'transport', name: 'Transporte' }, { id: 'aerospace', name: 'Aeroespacial' },
  { id: 'agriculture', name: 'Agricultura' }, { id: 'materials', name: 'Materiales' }, { id: 'defense', name: 'Defensa' },
  { id: 'ai', name: 'Inteligencia artificial' }, { id: 'automation', name: 'Automatización' }
];

export interface TechEffects {
  sectors?: Partial<Record<SectorId, number>>;
  health?: number;
  education?: number;
  energyEfficiency?: number;
  military?: number;
  air?: number;
  naval?: number;
  logistics?: number;
  intel?: number;
  admin?: number;
  research?: number;
  unlocks?: string[];
}

export interface TechDef {
  id: string;
  name: string;
  area: TechArea;
  year: number;
  /** nivel de partida: 0 = todos lo conocen en 1990; 1..3 según desarrollo; -1 = por descubrir */
  tier: number;
  cost: number;
  prereqs: string[];
  effects: TechEffects;
  desc: string;
}

const T = (id: string, name: string, area: TechArea, year: number, tier: number, cost: number, prereqs: string[], effects: TechEffects, desc = ''): TechDef =>
  ({ id, name, area, year, tier, cost, prereqs, effects, desc });

export const TECHS: TechDef[] = [
  // informática
  T('mainframes', 'Grandes computadoras', 'computing', 1965, 0, 300, [], { sectors: { finance: 0.03, services: 0.01 }, admin: 0.02 }),
  T('personal_computers', 'Computación personal', 'computing', 1981, 1, 500, ['mainframes'], { sectors: { services: 0.03, finance: 0.04, tech: 0.06 }, admin: 0.02 }),
  T('graphical_interfaces', 'Interfaces gráficas', 'computing', 1988, 2, 600, ['personal_computers'], { sectors: { tech: 0.05, services: 0.02 } }),
  T('relational_databases', 'Bases de datos relacionales', 'computing', 1986, 2, 600, ['mainframes'], { sectors: { finance: 0.04 }, admin: 0.03 }),
  T('parallel_computing', 'Computación paralela', 'computing', 1996, -1, 900, ['graphical_interfaces', 'relational_databases'], { sectors: { tech: 0.06 }, research: 0.05 }),
  T('mobile_computing', 'Computación móvil', 'computing', 2002, -1, 1300, ['parallel_computing', 'li_ion_batteries'], { sectors: { tech: 0.08, services: 0.03 } }),
  T('cloud_computing', 'Computación en la nube', 'computing', 2008, -1, 1700, ['parallel_computing', 'broadband'], { sectors: { tech: 0.1, finance: 0.04, services: 0.03 }, admin: 0.03 }),
  T('quantum_computing', 'Computación cuántica', 'computing', 2032, -1, 6000, ['cloud_computing', 'advanced_materials'], { sectors: { tech: 0.15, finance: 0.05 }, research: 0.15, intel: 0.1 }),
  // telecomunicaciones
  T('satellite_comms', 'Comunicaciones satelitales', 'telecom', 1970, 1, 450, [], { sectors: { telecom: 0.05 }, intel: 0.03 }),
  T('analog_mobile', 'Telefonía móvil analógica', 'telecom', 1985, 2, 550, ['satellite_comms'], { sectors: { telecom: 0.05 } }),
  T('fiber_optics', 'Fibra óptica', 'telecom', 1985, 2, 600, ['satellite_comms'], { sectors: { telecom: 0.06 } }),
  T('digital_mobile', 'Telefonía móvil digital', 'telecom', 1993, -1, 800, ['analog_mobile'], { sectors: { telecom: 0.1, services: 0.02 } }),
  T('mobile_data', 'Datos móviles', 'telecom', 2002, -1, 1300, ['digital_mobile', 'packet_networks'], { sectors: { telecom: 0.1, services: 0.03 } }),
  T('mobile_broadband', 'Banda ancha móvil', 'telecom', 2010, -1, 1800, ['mobile_data', 'broadband'], { sectors: { telecom: 0.1, services: 0.04, tech: 0.03 } }),
  T('next_gen_networks', 'Redes de nueva generación', 'telecom', 2019, -1, 2400, ['mobile_broadband'], { sectors: { telecom: 0.08, industry: 0.02 } }),
  // internet
  T('packet_networks', 'Redes de conmutación de paquetes', 'internet', 1975, 1, 450, ['mainframes'], { sectors: { telecom: 0.02 }, research: 0.02 }),
  T('world_web', 'Red global de hipertexto', 'internet', 1993, -1, 750, ['packet_networks', 'personal_computers'], { sectors: { services: 0.03, tech: 0.05 }, research: 0.04 }, 'La web masiva aún no existe en 1990.'),
  T('e_commerce', 'Comercio electrónico', 'internet', 1998, -1, 950, ['world_web'], { sectors: { services: 0.05, finance: 0.03, transport: 0.02 } }),
  T('broadband', 'Banda ancha fija', 'internet', 2002, -1, 1200, ['world_web', 'fiber_optics'], { sectors: { services: 0.03, tech: 0.05 }, education: 0.02 }),
  T('social_networks', 'Redes sociales', 'internet', 2006, -1, 1200, ['broadband', 'mobile_data'], { sectors: { services: 0.02, tech: 0.04 } }),
  T('digital_platforms', 'Plataformas digitales', 'internet', 2012, -1, 1900, ['social_networks', 'cloud_computing'], { sectors: { services: 0.05, transport: 0.03, tourism: 0.04 } }),
  // medicina
  T('modern_antibiotics', 'Antibióticos modernos', 'medicine', 1960, 0, 300, [], { health: 0.04 }),
  T('medical_imaging', 'Imagen médica avanzada', 'medicine', 1985, 2, 600, ['modern_antibiotics'], { health: 0.03 }),
  T('antiretrovirals', 'Antirretrovirales', 'medicine', 1996, -1, 900, ['medical_imaging', 'recombinant_dna'], { health: 0.03 }),
  T('genomic_medicine', 'Medicina genómica', 'medicine', 2006, -1, 1700, ['genome_sequencing'], { health: 0.04 }),
  T('mrna_vaccines', 'Vacunas de ARN mensajero', 'medicine', 2020, -1, 2300, ['genomic_medicine', 'crispr'], { health: 0.04 }),
  T('regenerative_medicine', 'Medicina regenerativa', 'medicine', 2036, -1, 5200, ['mrna_vaccines', 'synthetic_biology'], { health: 0.08 }),
  // biotecnología
  T('recombinant_dna', 'ADN recombinante', 'biotech', 1978, 2, 600, ['modern_antibiotics'], { sectors: { agriculture: 0.02 } }),
  T('gm_crops', 'Cultivos transgénicos', 'biotech', 1996, -1, 850, ['recombinant_dna'], { sectors: { agriculture: 0.08 } }),
  T('genome_sequencing', 'Secuenciación genómica', 'biotech', 2001, -1, 1500, ['recombinant_dna', 'parallel_computing'], { research: 0.03 }),
  T('crispr', 'Edición genética precisa', 'biotech', 2013, -1, 2000, ['genome_sequencing'], { sectors: { agriculture: 0.05 }, health: 0.02 }),
  T('synthetic_biology', 'Biología sintética', 'biotech', 2030, -1, 4600, ['crispr', 'machine_learning'], { sectors: { industry: 0.04, agriculture: 0.06 } }),
  // energía
  T('nuclear_fission', 'Energía nuclear de fisión', 'energy', 1960, 1, 700, [], { sectors: { energy: 0.08 }, energyEfficiency: 0.02, unlocks: ['nuclear_plant'] }),
  T('combined_cycle', 'Ciclo combinado a gas', 'energy', 1990, -1, 700, [], { sectors: { energy: 0.08 }, energyEfficiency: 0.04 }),
  T('wind_turbines', 'Aerogeneradores modernos', 'energy', 1996, -1, 850, ['composites'], { sectors: { energy: 0.05 }, energyEfficiency: 0.03 }),
  T('li_ion_batteries', 'Baterías de ion de litio', 'energy', 1992, -1, 800, ['composites'], { sectors: { tech: 0.03 } }),
  T('solar_pv', 'Fotovoltaica barata', 'energy', 2006, -1, 1300, ['semiconductors', 'advanced_materials'], { sectors: { energy: 0.07 }, energyEfficiency: 0.04 }),
  T('smart_grid', 'Redes eléctricas inteligentes', 'energy', 2012, -1, 1600, ['broadband', 'li_ion_batteries'], { sectors: { energy: 0.06 }, energyEfficiency: 0.05 }),
  T('advanced_nuclear', 'Fisión avanzada modular', 'energy', 2030, -1, 4000, ['nuclear_fission', 'advanced_materials'], { sectors: { energy: 0.1 }, energyEfficiency: 0.04 }),
  T('fusion_power', 'Energía de fusión', 'energy', 2048, -1, 9500, ['advanced_nuclear', 'superconductors'], { sectors: { energy: 0.3 }, energyEfficiency: 0.12 }),
  // industria
  T('assembly_line', 'Producción en cadena', 'industry', 1930, 0, 200, [], { sectors: { industry: 0.03 } }),
  T('semiconductors', 'Semiconductores', 'industry', 1970, 1, 500, ['assembly_line'], { sectors: { tech: 0.05, industry: 0.02 } }),
  T('cnc_machining', 'Mecanizado CNC', 'industry', 1975, 1, 500, ['assembly_line', 'mainframes'], { sectors: { industry: 0.05, defense: 0.03 } }),
  T('lean_manufacturing', 'Manufactura esbelta', 'industry', 1985, 2, 600, ['cnc_machining'], { sectors: { industry: 0.05 } }),
  T('additive_manufacturing', 'Fabricación aditiva', 'industry', 2013, -1, 1800, ['cnc_machining', 'advanced_materials'], { sectors: { industry: 0.05, defense: 0.04 } }),
  // transporte
  T('jet_airliners', 'Aviación a reacción comercial', 'transport', 1960, 0, 300, [], { sectors: { transport: 0.03, tourism: 0.05 } }),
  T('containerization', 'Contenedorización', 'transport', 1970, 1, 400, ['assembly_line'], { sectors: { transport: 0.06 }, logistics: 0.05 }),
  T('high_speed_rail', 'Tren de alta velocidad', 'transport', 1985, 2, 700, ['containerization'], { sectors: { transport: 0.04, tourism: 0.02 }, logistics: 0.03 }),
  T('gps', 'Navegación satelital', 'transport', 1995, -1, 900, ['satellite_comms', 'space_launch'], { sectors: { transport: 0.04 }, logistics: 0.06, military: 0.03 }),
  T('electric_vehicles', 'Vehículos eléctricos', 'transport', 2012, -1, 1800, ['li_ion_batteries', 'advanced_materials'], { sectors: { transport: 0.04, industry: 0.02 }, energyEfficiency: 0.04 }),
  T('autonomous_vehicles', 'Vehículos autónomos', 'transport', 2028, -1, 3600, ['deep_learning', 'electric_vehicles', 'gps'], { sectors: { transport: 0.12 }, logistics: 0.08 }),
  // aeroespacial
  T('space_launch', 'Lanzadores espaciales', 'aerospace', 1965, 1, 700, ['satellite_comms'], { intel: 0.03 }),
  T('reconnaissance_satellites', 'Satélites de reconocimiento', 'aerospace', 1975, 2, 650, ['space_launch'], { intel: 0.1, military: 0.02 }),
  T('reusable_rockets', 'Cohetes reutilizables', 'aerospace', 2016, -1, 2600, ['space_launch', 'advanced_materials'], { sectors: { telecom: 0.03 }, intel: 0.04 }),
  T('orbital_industry', 'Industria orbital', 'aerospace', 2040, -1, 7000, ['reusable_rockets', 'robotic_services'], { sectors: { tech: 0.08, telecom: 0.05 } }),
  // agricultura
  T('green_revolution', 'Revolución verde', 'agriculture', 1965, 0, 250, [], { sectors: { agriculture: 0.06 } }),
  T('drip_irrigation', 'Riego por goteo', 'agriculture', 1975, 1, 400, ['green_revolution'], { sectors: { agriculture: 0.05 } }),
  T('precision_agriculture', 'Agricultura de precisión', 'agriculture', 2002, -1, 1000, ['gps', 'drip_irrigation'], { sectors: { agriculture: 0.07, livestock: 0.03 } }),
  T('vertical_farming', 'Agricultura vertical', 'agriculture', 2026, -1, 2700, ['precision_agriculture', 'smart_factories'], { sectors: { agriculture: 0.08 } }),
  // materiales
  T('composites', 'Materiales compuestos', 'materials', 1980, 1, 500, ['assembly_line'], { sectors: { industry: 0.02, defense: 0.03 } }),
  T('advanced_materials', 'Materiales avanzados', 'materials', 2000, -1, 1300, ['composites', 'semiconductors'], { sectors: { industry: 0.04, tech: 0.03 } }),
  T('graphene', 'Grafeno y nanomateriales', 'materials', 2016, -1, 2300, ['advanced_materials'], { sectors: { tech: 0.05, industry: 0.03 } }),
  T('superconductors', 'Superconductores de alta temperatura', 'materials', 2036, -1, 5200, ['graphene'], { sectors: { energy: 0.06, transport: 0.04 } }),
  // defensa
  T('modern_armor', 'Carros de combate modernos', 'defense', 1980, 1, 600, ['assembly_line'], { military: 0.05, unlocks: ['armored'] }),
  T('jet_fighters_4g', 'Cazas de cuarta generación', 'defense', 1978, 1, 700, ['jet_airliners'], { air: 0.08 }),
  T('carrier_aviation', 'Aviación embarcada', 'defense', 1960, 2, 700, ['jet_airliners'], { naval: 0.04, unlocks: ['carrier_group'] }),
  T('night_vision', 'Visión nocturna', 'defense', 1975, 1, 450, ['semiconductors'], { military: 0.04 }),
  T('precision_munitions', 'Municiones de precisión', 'defense', 1985, 2, 750, ['semiconductors'], { military: 0.06, air: 0.05 }),
  T('cruise_missiles', 'Misiles de crucero', 'defense', 1985, 2, 800, ['precision_munitions'], { naval: 0.05, air: 0.04 }),
  T('stealth_aircraft', 'Aviones furtivos', 'defense', 1990, 3, 1300, ['jet_fighters_4g', 'composites'], { air: 0.12 }),
  T('combat_drones', 'Drones de combate', 'defense', 2005, -1, 1400, ['gps', 'composites'], { military: 0.06, air: 0.05, intel: 0.04 }),
  T('network_warfare', 'Guerra centrada en redes', 'defense', 2005, -1, 1600, ['world_web', 'gps'], { military: 0.07, logistics: 0.05 }),
  T('missile_defense', 'Defensa antimisiles', 'defense', 2006, -1, 2000, ['precision_munitions', 'parallel_computing'], { air: 0.06, naval: 0.04 }),
  T('hypersonic_weapons', 'Armas hipersónicas', 'defense', 2025, -1, 3600, ['missile_defense', 'advanced_materials'], { naval: 0.08, air: 0.06 }),
  T('autonomous_weapons', 'Sistemas de armas autónomos', 'defense', 2032, -1, 4200, ['combat_drones', 'deep_learning'], { military: 0.1, air: 0.08 }),
  // inteligencia artificial
  T('expert_systems', 'Sistemas expertos', 'ai', 1985, 2, 600, ['relational_databases'], { sectors: { finance: 0.02 }, admin: 0.02 }),
  T('machine_learning', 'Aprendizaje automático', 'ai', 2002, -1, 1300, ['parallel_computing', 'expert_systems'], { sectors: { tech: 0.05, finance: 0.04 }, intel: 0.03 }),
  T('deep_learning', 'Aprendizaje profundo', 'ai', 2014, -1, 2200, ['machine_learning', 'cloud_computing'], { sectors: { tech: 0.08, services: 0.03 }, research: 0.06, intel: 0.04 }),
  T('language_models', 'Modelos de lenguaje a gran escala', 'ai', 2022, -1, 3200, ['deep_learning'], { sectors: { services: 0.06, tech: 0.06, finance: 0.04 }, admin: 0.04, research: 0.06 }),
  T('general_ai', 'Inteligencia artificial general', 'ai', 2042, -1, 9500, ['language_models', 'quantum_computing'], { sectors: { services: 0.15, tech: 0.15, industry: 0.08 }, research: 0.25 }),
  // automatización
  T('industrial_robots', 'Robots industriales', 'automation', 1985, 2, 700, ['cnc_machining'], { sectors: { industry: 0.05 } }),
  T('flexible_automation', 'Automatización flexible', 'automation', 1998, -1, 1000, ['industrial_robots', 'personal_computers'], { sectors: { industry: 0.06, defense: 0.03 } }),
  T('smart_factories', 'Fábricas inteligentes', 'automation', 2015, -1, 2100, ['flexible_automation', 'machine_learning', 'broadband'], { sectors: { industry: 0.08 } }),
  T('robotic_services', 'Robótica de servicios', 'automation', 2030, -1, 3900, ['smart_factories', 'deep_learning'], { sectors: { services: 0.08 }, health: 0.02 })
];

export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

export const FUTURE_YEAR = 2026;
