import type { Dimension, GroupId, RegimeId } from '@cyo/shared';

/**
 * Catálogo legislativo. Las leyes NO son paquetes ideológicos: cada opción fija parámetros
 * institucionales concretos que leen los módulos del motor (economía, sociedad, política,
 * militar). Las dimensiones solo sirven para medir cuánto apoyo tiene cada opción entre
 * partidos y grupos sociales.
 */

export interface LawParams {
  democracy: number; civilLiberty: number; repression: number; judicialIndependence: number; anticorruption: number;
  centralization: number; laborRigidity: number; unionPower: number; minWage: number; retirementAge: number;
  regulation: number; fdiOpenness: number; priceControls: number; capitalOpenness: number; tradeBarriers: number;
  educationAccess: number; universityAccess: number; healthCoverage: number; pensionGenerosity: number;
  policePower: number; envProtection: number; extractionLimit: number; conscription: number; mobilization: number;
  immigration: number; emigration: number; stateReligion: number; religiousFreedom: number; pressFreedom: number;
  minorityRights: number; familySupport: number; cbIndependence: number; fiscalRule: number; peg: number;
  militaryPosture: number; partyFreedom: number; termYears: number; intelOversight: number; socialProgress: number;
}

export const DEFAULT_PARAMS: LawParams = {
  democracy: 0.5, civilLiberty: 0.5, repression: 0, judicialIndependence: 0.5, anticorruption: 0.3,
  centralization: 0.6, laborRigidity: 0.5, unionPower: 0.4, minWage: 0.3, retirementAge: 62,
  regulation: 0.5, fdiOpenness: 0.5, priceControls: 0.1, capitalOpenness: 0.5, tradeBarriers: 0.3,
  educationAccess: 0.6, universityAccess: 0.4, healthCoverage: 0.5, pensionGenerosity: 0.4,
  policePower: 0.4, envProtection: 0.2, extractionLimit: 0, conscription: 0.01, mobilization: 0,
  immigration: 0.3, emigration: 1, stateReligion: 0.2, religiousFreedom: 0.8, pressFreedom: 0.6,
  minorityRights: 0.4, familySupport: 0.3, cbIndependence: 0.3, fiscalRule: 99, peg: 0, militaryPosture: 0.4,
  partyFreedom: 1, termYears: 4, intelOversight: 0.5, socialProgress: 0.4
};

export interface LawOption {
  id: string;
  name: string;
  desc: string;
  params: Partial<LawParams>;
  dims: Partial<Record<Dimension, number>>;
  groups: Partial<Record<GroupId, number>>;
  regimes?: RegimeId[];
  /** coste en capital político para proponerla */
  cost?: number;
  /** días que tarda en implementarse tras aprobarse */
  implDays?: number;
}

export interface LawDef {
  id: string;
  category: LawCategory;
  name: string;
  constitutional?: boolean;
  options: LawOption[];
}

export type LawCategory = 'constitution' | 'electoral' | 'fiscal' | 'labor' | 'business' | 'education' | 'health' | 'security' |
  'justice' | 'environment' | 'liberties' | 'defense' | 'commerce' | 'migration' | 'religion' | 'media';

export const LAW_CATEGORIES: { id: LawCategory; name: string }[] = [
  { id: 'constitution', name: 'Constitución' }, { id: 'electoral', name: 'Régimen electoral' }, { id: 'fiscal', name: 'Impuestos y moneda' },
  { id: 'labor', name: 'Trabajo' }, { id: 'business', name: 'Empresas' }, { id: 'education', name: 'Educación' }, { id: 'health', name: 'Salud' },
  { id: 'security', name: 'Seguridad' }, { id: 'justice', name: 'Justicia' }, { id: 'environment', name: 'Medioambiente' },
  { id: 'liberties', name: 'Libertades civiles' }, { id: 'defense', name: 'Defensa' }, { id: 'commerce', name: 'Comercio' },
  { id: 'migration', name: 'Migraciones' }, { id: 'religion', name: 'Religión y Estado' }, { id: 'media', name: 'Medios de comunicación' }
];

const DEMOCRATIC: RegimeId[] = ['parliamentary_democracy', 'presidential_republic', 'constitutional_monarchy'];
const AUTOCRATIC: RegimeId[] = ['absolute_monarchy', 'one_party_state', 'military_junta', 'theocracy'];

export const LAWS: LawDef[] = [
  // ------------------------------------------------------------ constitución
  {
    id: 'regime', category: 'constitution', name: 'Forma de gobierno', constitutional: true, options: [
      { id: 'parliamentary_democracy', name: 'Democracia parlamentaria', desc: 'El gobierno surge del parlamento y depende de su confianza.', params: { democracy: 0.9 }, dims: { authority: -0.6 }, groups: { middle: 4, youth: 3, military: -2 } },
      { id: 'presidential_republic', name: 'República presidencial', desc: 'Presidente electo con amplios poderes ejecutivos y decretos limitados.', params: { democracy: 0.8 }, dims: { authority: -0.3 }, groups: { middle: 3, business: 1 } },
      { id: 'constitutional_monarchy', name: 'Monarquía constitucional', desc: 'Monarca simbólico, parlamento soberano.', params: { democracy: 0.85 }, dims: { authority: -0.4, social: -0.2 }, groups: { religious: 3, youth: -1 } },
      { id: 'absolute_monarchy', name: 'Monarquía absoluta', desc: 'El monarca gobierna por decreto.', params: { democracy: 0.05 }, dims: { authority: 0.9, social: -0.6 }, groups: { religious: 4, middle: -6, youth: -6, minorities: -3 } },
      { id: 'one_party_state', name: 'Estado de partido único', desc: 'Un partido monopoliza el poder político.', params: { democracy: 0.08 }, dims: { authority: 0.8, econ: -0.4 }, groups: { public: 4, middle: -5, business: -4, youth: -4 } },
      { id: 'military_junta', name: 'Junta militar', desc: 'Las fuerzas armadas ejercen el gobierno.', params: { democracy: 0.03 }, dims: { authority: 1, nation: 0.5 }, groups: { military: 10, middle: -6, workers: -4, youth: -6 } },
      { id: 'theocracy', name: 'Teocracia', desc: 'La autoridad religiosa es la autoridad política.', params: { democracy: 0.1 }, dims: { authority: 0.8, social: -1 }, groups: { religious: 12, middle: -6, youth: -6, minorities: -6 } }
    ]
  },
  {
    id: 'territorial', category: 'constitution', name: 'Organización territorial', constitutional: true, options: [
      { id: 'centralized', name: 'Estado unitario centralizado', desc: 'Todas las competencias en el gobierno central.', params: { centralization: 0.9 }, dims: { central: 1 }, groups: { minorities: -6, public: 2 } },
      { id: 'decentralized', name: 'Unitario descentralizado', desc: 'Regiones con competencias delegadas.', params: { centralization: 0.6 }, dims: { central: 0.3 }, groups: { minorities: 1 } },
      { id: 'federal', name: 'Federación', desc: 'Estados federados con autogobierno y recursos propios.', params: { centralization: 0.35 }, dims: { central: -0.6 }, groups: { minorities: 5 } },
      { id: 'confederal', name: 'Confederación', desc: 'Unión laxa de entidades casi soberanas.', params: { centralization: 0.15 }, dims: { central: -1 }, groups: { minorities: 8, military: -3 } }
    ]
  },
  {
    id: 'judiciary', category: 'justice', name: 'Poder judicial', options: [
      { id: 'subordinate', name: 'Subordinado al ejecutivo', desc: 'Los jueces responden al gobierno.', params: { judicialIndependence: 0.1 }, dims: { authority: 0.8 }, groups: { business: -4, middle: -4 } },
      { id: 'partial', name: 'Parcialmente independiente', desc: 'Nombramientos políticos con cierta autonomía.', params: { judicialIndependence: 0.5 }, dims: { authority: 0.1 }, groups: {} },
      { id: 'independent', name: 'Independiente', desc: 'Carrera judicial autónoma y control de constitucionalidad.', params: { judicialIndependence: 0.9 }, dims: { authority: -0.6 }, groups: { business: 4, middle: 4, military: -2 } }
    ]
  },
  {
    id: 'anticorruption', category: 'justice', name: 'Lucha contra la corrupción', options: [
      { id: 'none', name: 'Sin organismo específico', desc: 'La corrupción se persigue con medios ordinarios.', params: { anticorruption: 0.1 }, dims: {}, groups: { business: 1, public: 2 } },
      { id: 'agency', name: 'Agencia anticorrupción', desc: 'Organismo de control con recursos propios.', params: { anticorruption: 0.45 }, dims: { authority: -0.1 }, groups: { middle: 3, public: -1 }, cost: 10 },
      { id: 'strong', name: 'Fiscalía anticorrupción fuerte', desc: 'Investigación independiente y transparencia obligatoria.', params: { anticorruption: 0.8 }, dims: { authority: -0.3 }, groups: { middle: 5, public: -4, business: -2 }, cost: 20 }
    ]
  },
  {
    id: 'deathPenalty', category: 'justice', name: 'Pena capital', options: [
      { id: 'abolished', name: 'Abolida', desc: '', params: {}, dims: { social: 0.5, authority: -0.3 }, groups: { youth: 2, religious: -2 } },
      { id: 'exceptional', name: 'Solo en tiempo de guerra', desc: '', params: {}, dims: {}, groups: {} },
      { id: 'applied', name: 'Aplicada', desc: '', params: { repression: 0.05 }, dims: { social: -0.5, authority: 0.5 }, groups: { religious: 2, youth: -2, middle: -1 } }
    ]
  },
  // ------------------------------------------------------------ electoral
  {
    id: 'electoral', category: 'electoral', name: 'Sistema electoral', constitutional: true, options: [
      { id: 'none', name: 'Sin elecciones competitivas', desc: 'No hay elecciones libres.', params: {}, dims: { authority: 1 }, groups: { middle: -6, youth: -5 }, regimes: AUTOCRATIC },
      { id: 'majoritarian', name: 'Mayoritario uninominal', desc: 'Favorece a los partidos grandes y gobiernos estables.', params: {}, dims: { authority: 0.1 }, groups: {}, regimes: DEMOCRATIC },
      { id: 'mixed', name: 'Mixto', desc: 'Combina distritos y listas proporcionales.', params: {}, dims: {}, groups: {}, regimes: DEMOCRATIC },
      { id: 'proportional', name: 'Proporcional', desc: 'Parlamentos fragmentados y coaliciones.', params: {}, dims: { authority: -0.2 }, groups: { minorities: 3 }, regimes: DEMOCRATIC }
    ]
  },
  {
    id: 'parties', category: 'electoral', name: 'Pluralismo político', options: [
      { id: 'single', name: 'Partido único legal', desc: '', params: { partyFreedom: 0 }, dims: { authority: 1 }, groups: { middle: -5, youth: -4 }, regimes: AUTOCRATIC },
      { id: 'restricted', name: 'Partidos restringidos', desc: 'Se prohíben partidos considerados extremistas.', params: { partyFreedom: 0.5 }, dims: { authority: 0.4 }, groups: {} },
      { id: 'free', name: 'Libertad de partidos', desc: '', params: { partyFreedom: 1 }, dims: { authority: -0.5 }, groups: { middle: 2, youth: 2 } }
    ]
  },
  {
    id: 'term', category: 'electoral', name: 'Duración del mandato', options: [
      { id: 'four', name: '4 años', desc: '', params: { termYears: 4 }, dims: { authority: -0.1 }, groups: {} },
      { id: 'five', name: '5 años', desc: '', params: { termYears: 5 }, dims: {}, groups: {} },
      { id: 'six', name: '6 años', desc: '', params: { termYears: 6 }, dims: { authority: 0.2 }, groups: {} }
    ]
  },
  // ------------------------------------------------------------ fiscal y monetario
  {
    id: 'centralBank', category: 'fiscal', name: 'Banco central', options: [
      { id: 'government', name: 'Subordinado al Tesoro', desc: 'Permite financiar déficit con emisión; expectativas de inflación poco ancladas.', params: { cbIndependence: 0.1 }, dims: { econ: -0.3 }, groups: { public: 2 } },
      { id: 'independent', name: 'Independiente', desc: 'Regla de tasas automática; no monetiza déficit; menor prima de riesgo.', params: { cbIndependence: 0.9 }, dims: { econ: 0.5 }, groups: { business: 4 }, cost: 15 }
    ]
  },
  {
    id: 'currency', category: 'fiscal', name: 'Régimen cambiario', options: [
      { id: 'floating', name: 'Flotación libre', desc: 'El tipo de cambio absorbe los shocks.', params: { peg: 0 }, dims: { econ: 0.4 }, groups: {} },
      { id: 'managed', name: 'Flotación administrada', desc: 'El banco central suaviza movimientos con reservas.', params: { peg: 0.5 }, dims: {}, groups: {} },
      { id: 'fixed', name: 'Tipo de cambio fijo', desc: 'Defiende la paridad con reservas; riesgo de crisis si se agotan.', params: { peg: 1 }, dims: { econ: -0.1 }, groups: { business: 2, middle: 2 } }
    ]
  },
  {
    id: 'fiscalRule', category: 'fiscal', name: 'Regla fiscal', options: [
      { id: 'none', name: 'Sin regla', desc: '', params: { fiscalRule: 99 }, dims: {}, groups: {} },
      { id: 'cap3', name: 'Déficit máximo 3% del PIB', desc: 'El Tesoro no puede endeudarse por encima del límite.', params: { fiscalRule: 3 }, dims: { econ: 0.3, welfare: -0.2 }, groups: { business: 3, public: -2 } },
      { id: 'balanced', name: 'Presupuesto equilibrado', desc: 'Prohíbe el déficit salvo en guerra.', params: { fiscalRule: 0.5 }, dims: { econ: 0.6, welfare: -0.4 }, groups: { business: 4, public: -4, pensioners: -2 } }
    ]
  },
  // ------------------------------------------------------------ trabajo
  {
    id: 'unions', category: 'labor', name: 'Sindicatos', options: [
      { id: 'banned', name: 'Prohibidos', desc: '', params: { unionPower: 0, repression: 0.08 }, dims: { authority: 0.6, econ: 0.4 }, groups: { workers: -12, business: 5 } },
      { id: 'state', name: 'Sindicato oficial único', desc: '', params: { unionPower: 0.3 }, dims: { authority: 0.5, econ: -0.4 }, groups: { workers: -3, public: 2 } },
      { id: 'restricted', name: 'Restringidos', desc: 'Huelgas limitadas por ley.', params: { unionPower: 0.35 }, dims: { econ: 0.2 }, groups: { workers: -4, business: 2 } },
      { id: 'free', name: 'Libertad sindical', desc: '', params: { unionPower: 0.6 }, dims: { econ: -0.2, authority: -0.3 }, groups: { workers: 6, business: -3 } }
    ]
  },
  {
    id: 'minimumWage', category: 'labor', name: 'Salario mínimo', options: [
      { id: 'none', name: 'Sin salario mínimo', desc: '', params: { minWage: 0 }, dims: { econ: 0.6, welfare: -0.5 }, groups: { workers: -6, business: 4 } },
      { id: 'low', name: 'Bajo', desc: '', params: { minWage: 0.3 }, dims: { econ: 0.1 }, groups: { workers: 1 } },
      { id: 'moderate', name: 'Moderado', desc: '', params: { minWage: 0.5 }, dims: { welfare: 0.3 }, groups: { workers: 4, business: -2 } },
      { id: 'high', name: 'Alto', desc: 'Aumenta salarios formales pero también la informalidad.', params: { minWage: 0.75 }, dims: { econ: -0.4, welfare: 0.6 }, groups: { workers: 8, business: -6, farmers: -2 } }
    ]
  },
  {
    id: 'laborProtection', category: 'labor', name: 'Protección del empleo', options: [
      { id: 'flexible', name: 'Flexible', desc: 'Despido barato: más dinamismo y menos estabilidad.', params: { laborRigidity: 0.15 }, dims: { econ: 0.6 }, groups: { workers: -6, business: 6 } },
      { id: 'moderate', name: 'Moderada', desc: '', params: { laborRigidity: 0.45 }, dims: {}, groups: {} },
      { id: 'rigid', name: 'Estricta', desc: 'Despidos caros: mayor desempleo estructural y reasignación lenta.', params: { laborRigidity: 0.85 }, dims: { econ: -0.5, welfare: 0.4 }, groups: { workers: 6, business: -6, youth: -2 } }
    ]
  },
  {
    id: 'retirement', category: 'labor', name: 'Edad de jubilación', options: [
      { id: 'early', name: '57 años', desc: '', params: { retirementAge: 57 }, dims: { welfare: 0.5 }, groups: { pensioners: 6, workers: 4 } },
      { id: 'standard', name: '62 años', desc: '', params: { retirementAge: 62 }, dims: {}, groups: {} },
      { id: 'late', name: '67 años', desc: 'Más población activa y menor gasto previsional.', params: { retirementAge: 67 }, dims: { welfare: -0.4, econ: 0.2 }, groups: { pensioners: -3, workers: -6 } }
    ]
  },
  // ------------------------------------------------------------ empresas
  {
    id: 'regulation', category: 'business', name: 'Regulación empresarial', options: [
      { id: 'minimal', name: 'Mínima', desc: '', params: { regulation: 0.15 }, dims: { econ: 0.7 }, groups: { business: 6, workers: -2 } },
      { id: 'moderate', name: 'Moderada', desc: '', params: { regulation: 0.45 }, dims: {}, groups: {} },
      { id: 'heavy', name: 'Intensa', desc: 'Licencias, controles y burocracia: más informalidad.', params: { regulation: 0.8 }, dims: { econ: -0.6 }, groups: { business: -6, public: 3 } }
    ]
  },
  {
    id: 'foreignInvestment', category: 'business', name: 'Inversión extranjera', options: [
      { id: 'closed', name: 'Prohibida', desc: '', params: { fdiOpenness: 0 }, dims: { nation: 0.7, econ: -0.5 }, groups: { business: -2, workers: 1 } },
      { id: 'restricted', name: 'Restringida', desc: 'Socio local obligatorio en sectores estratégicos.', params: { fdiOpenness: 0.4 }, dims: { nation: 0.2 }, groups: {} },
      { id: 'open', name: 'Abierta', desc: '', params: { fdiOpenness: 0.95 }, dims: { nation: -0.6, econ: 0.5 }, groups: { business: 4, workers: -1 } }
    ]
  },
  {
    id: 'prices', category: 'business', name: 'Control de precios', options: [
      { id: 'free', name: 'Precios libres', desc: '', params: { priceControls: 0 }, dims: { econ: 0.6 }, groups: { business: 4, farmers: 2 } },
      { id: 'partial', name: 'Controles en bienes básicos', desc: 'Frena la inflación medida pero genera escasez y desalienta la inversión.', params: { priceControls: 0.35 }, dims: { econ: -0.3, welfare: 0.2 }, groups: { workers: 3, farmers: -3, business: -3 } },
      { id: 'planned', name: 'Precios planificados', desc: 'Precios fijados por el plan económico.', params: { priceControls: 0.85 }, dims: { econ: -1 }, groups: { business: -10, public: 4, farmers: -4 } }
    ]
  },
  {
    id: 'competition', category: 'business', name: 'Defensa de la competencia', options: [
      { id: 'tolerant', name: 'Monopolios tolerados', desc: '', params: {}, dims: { econ: 0.1 }, groups: { business: 3 } },
      { id: 'antitrust', name: 'Ley antimonopolio', desc: 'Mejora la productividad de los sectores privatizados.', params: { regulation: 0.05 }, dims: { econ: 0.2, authority: -0.1 }, groups: { middle: 2, business: -1 }, cost: 8 }
    ]
  },
  // ------------------------------------------------------------ educación y salud
  {
    id: 'education', category: 'education', name: 'Sistema educativo', options: [
      { id: 'elite', name: 'Educación elitista', desc: 'Escolaridad pública limitada.', params: { educationAccess: 0.35 }, dims: { welfare: -0.6, social: -0.3 }, groups: { business: 1, youth: -5, workers: -3 } },
      { id: 'basic', name: 'Primaria pública', desc: '', params: { educationAccess: 0.6 }, dims: { welfare: -0.1 }, groups: {} },
      { id: 'universal', name: 'Pública universal hasta secundaria', desc: '', params: { educationAccess: 0.9 }, dims: { welfare: 0.4 }, groups: { youth: 4, workers: 3, middle: 2 } },
      { id: 'vouchers', name: 'Mixta con bonos escolares', desc: '', params: { educationAccess: 0.8 }, dims: { econ: 0.4, welfare: 0.2 }, groups: { middle: 3, public: -3 } }
    ]
  },
  {
    id: 'university', category: 'education', name: 'Universidad', options: [
      { id: 'paid', name: 'Arancelada', desc: '', params: { universityAccess: 0.3 }, dims: { econ: 0.4, welfare: -0.3 }, groups: { youth: -4 } },
      { id: 'subsidized', name: 'Subsidiada', desc: '', params: { universityAccess: 0.55 }, dims: { welfare: 0.2 }, groups: { youth: 2, middle: 2 } },
      { id: 'free', name: 'Gratuita', desc: '', params: { universityAccess: 0.8 }, dims: { welfare: 0.5, econ: -0.2 }, groups: { youth: 6, middle: 3 } }
    ]
  },
  {
    id: 'healthcare', category: 'health', name: 'Sistema de salud', options: [
      { id: 'private', name: 'Privado', desc: '', params: { healthCoverage: 0.3 }, dims: { econ: 0.6, welfare: -0.6 }, groups: { business: 3, workers: -5, pensioners: -5 } },
      { id: 'insurance', name: 'Seguro obligatorio', desc: '', params: { healthCoverage: 0.7 }, dims: { econ: 0.2, welfare: 0.3 }, groups: { middle: 2 } },
      { id: 'universal', name: 'Universal público', desc: '', params: { healthCoverage: 0.95 }, dims: { welfare: 0.8, econ: -0.3 }, groups: { workers: 5, pensioners: 6, business: -2 } }
    ]
  },
  {
    id: 'pensions', category: 'health', name: 'Pensiones', options: [
      { id: 'none', name: 'Sin sistema público', desc: '', params: { pensionGenerosity: 0.05 }, dims: { welfare: -0.8 }, groups: { pensioners: -12 } },
      { id: 'contributory', name: 'Contributivo', desc: '', params: { pensionGenerosity: 0.4 }, dims: {}, groups: { pensioners: 1 } },
      { id: 'generous', name: 'Universal y generoso', desc: '', params: { pensionGenerosity: 0.75 }, dims: { welfare: 0.8 }, groups: { pensioners: 10, youth: -2, business: -2 } }
    ]
  },
  // ------------------------------------------------------------ seguridad
  {
    id: 'police', category: 'security', name: 'Poderes policiales', options: [
      { id: 'limited', name: 'Limitados', desc: '', params: { policePower: 0.25 }, dims: { authority: -0.6 }, groups: { youth: 3, minorities: 3, military: -2 } },
      { id: 'standard', name: 'Estándar', desc: '', params: { policePower: 0.45 }, dims: {}, groups: {} },
      { id: 'extensive', name: 'Amplios', desc: '', params: { policePower: 0.7, repression: 0.1 }, dims: { authority: 0.6 }, groups: { religious: 2, youth: -4, minorities: -4 } },
      { id: 'police_state', name: 'Estado policial', desc: 'Reprime protestas pero erosiona la legitimidad.', params: { policePower: 0.95, repression: 0.35 }, dims: { authority: 1 }, groups: { middle: -6, youth: -8, minorities: -8, military: 2 } }
    ]
  },
  {
    id: 'intelligence', category: 'security', name: 'Servicios de inteligencia', options: [
      { id: 'oversight', name: 'Bajo control parlamentario', desc: '', params: { intelOversight: 0.9 }, dims: { authority: -0.4 }, groups: { middle: 1 } },
      { id: 'autonomous', name: 'Autónomos', desc: '', params: { intelOversight: 0.5 }, dims: { authority: 0.2 }, groups: {} },
      { id: 'political', name: 'Policía política', desc: '', params: { intelOversight: 0.05, repression: 0.15 }, dims: { authority: 0.9 }, groups: { middle: -5, youth: -4 } }
    ]
  },
  // ------------------------------------------------------------ medioambiente
  {
    id: 'environment', category: 'environment', name: 'Regulación ambiental', options: [
      { id: 'none', name: 'Inexistente', desc: '', params: { envProtection: 0 }, dims: { econ: 0.3, social: -0.2 }, groups: { business: 2, youth: -2 } },
      { id: 'basic', name: 'Básica', desc: '', params: { envProtection: 0.35 }, dims: {}, groups: {} },
      { id: 'strict', name: 'Estricta', desc: 'Mejora la salud pública y encarece industria y minería.', params: { envProtection: 0.8 }, dims: { social: 0.4, econ: -0.3 }, groups: { youth: 4, middle: 2, business: -4, workers: -1 } }
    ]
  },
  {
    id: 'extraction', category: 'environment', name: 'Explotación de recursos', options: [
      { id: 'unrestricted', name: 'Sin restricciones', desc: '', params: { extractionLimit: 0 }, dims: { econ: 0.2 }, groups: { business: 2 } },
      { id: 'licensed', name: 'Licencias y regalías', desc: '', params: { extractionLimit: 0.15 }, dims: {}, groups: {} },
      { id: 'protected', name: 'Áreas protegidas extensas', desc: '', params: { extractionLimit: 0.4 }, dims: { social: 0.4 }, groups: { youth: 3, business: -4, workers: -2 } }
    ]
  },
  // ------------------------------------------------------------ libertades
  {
    id: 'speech', category: 'liberties', name: 'Libertad de expresión', options: [
      { id: 'censored', name: 'Censura', desc: '', params: { civilLiberty: 0.1, repression: 0.1 }, dims: { authority: 0.9 }, groups: { middle: -6, youth: -6 } },
      { id: 'restricted', name: 'Restringida', desc: '', params: { civilLiberty: 0.45 }, dims: { authority: 0.3 }, groups: { middle: -2 } },
      { id: 'free', name: 'Libre', desc: '', params: { civilLiberty: 0.9 }, dims: { authority: -0.7 }, groups: { middle: 4, youth: 4 } }
    ]
  },
  {
    id: 'assembly', category: 'liberties', name: 'Derecho de reunión', options: [
      { id: 'banned', name: 'Prohibido', desc: 'Menos protestas visibles, más radicalización.', params: { repression: 0.12 }, dims: { authority: 0.9 }, groups: { workers: -4, youth: -6 } },
      { id: 'permit', name: 'Con autorización previa', desc: '', params: {}, dims: { authority: 0.3 }, groups: {} },
      { id: 'free', name: 'Libre', desc: '', params: {}, dims: { authority: -0.6 }, groups: { youth: 3, workers: 2 } }
    ]
  },
  {
    id: 'minorities', category: 'liberties', name: 'Minorías culturales', options: [
      { id: 'assimilation', name: 'Asimilación forzada', desc: 'Reduce la identidad minoritaria a largo plazo pero aumenta el separatismo.', params: { minorityRights: 0 }, dims: { nation: 1, central: 0.5 }, groups: { minorities: -14 } },
      { id: 'tolerance', name: 'Tolerancia', desc: '', params: { minorityRights: 0.4 }, dims: {}, groups: {} },
      { id: 'autonomy', name: 'Autonomía cultural y regional', desc: 'Reduce el separatismo; descentraliza.', params: { minorityRights: 0.85, centralization: -0.1 }, dims: { nation: -0.6, central: -0.4 }, groups: { minorities: 10, military: -2 } }
    ]
  },
  {
    id: 'socialPolicy', category: 'liberties', name: 'Política social y familiar', options: [
      { id: 'traditional', name: 'Tradicional', desc: '', params: { socialProgress: 0.1, familySupport: 0.5 }, dims: { social: -0.8 }, groups: { religious: 5, youth: -3 } },
      { id: 'neutral', name: 'Neutral', desc: '', params: { socialProgress: 0.45 }, dims: {}, groups: {} },
      { id: 'progressive', name: 'Progresista', desc: '', params: { socialProgress: 0.85, familySupport: 0.4 }, dims: { social: 0.8 }, groups: { religious: -6, youth: 4, middle: 2 } }
    ]
  },
  // ------------------------------------------------------------ defensa
  {
    id: 'conscription', category: 'defense', name: 'Servicio militar', options: [
      { id: 'volunteer', name: 'Ejército profesional', desc: 'Menor reserva de reclutas, tropas más entrenadas.', params: { conscription: 0.012 }, dims: { authority: -0.2 }, groups: { youth: 4, military: -1 } },
      { id: 'selective', name: 'Servicio selectivo', desc: '', params: { conscription: 0.025 }, dims: {}, groups: {} },
      { id: 'universal', name: 'Servicio universal', desc: '', params: { conscription: 0.045 }, dims: { authority: 0.3, nation: 0.3 }, groups: { youth: -5, military: 4 } },
      { id: 'total', name: 'Movilización total', desc: 'Grandes reservas a costa de la economía.', params: { conscription: 0.09, mobilization: 0.08 }, dims: { authority: 0.6, nation: 0.6 }, groups: { youth: -10, workers: -5, business: -5, military: 8 } }
    ]
  },
  {
    id: 'defensePolicy', category: 'defense', name: 'Política de defensa', options: [
      { id: 'neutrality', name: 'Neutralidad', desc: 'Mejora relaciones generales; impide alianzas militares.', params: { militaryPosture: 0.1 }, dims: { nation: -0.2 }, groups: { military: -3 } },
      { id: 'collective', name: 'Defensa colectiva', desc: '', params: { militaryPosture: 0.45 }, dims: {}, groups: {} },
      { id: 'projection', name: 'Proyección de poder', desc: 'Inquieta a los vecinos.', params: { militaryPosture: 0.85 }, dims: { nation: 0.6, authority: 0.2 }, groups: { military: 6 } }
    ]
  },
  // ------------------------------------------------------------ comercio
  {
    id: 'trade', category: 'commerce', name: 'Política comercial', options: [
      { id: 'autarky', name: 'Autarquía', desc: 'Barreras no arancelarias casi totales.', params: { tradeBarriers: 0.85 }, dims: { nation: 0.8, econ: -0.6 }, groups: { business: -6, workers: 2, farmers: 2 } },
      { id: 'protectionist', name: 'Proteccionismo', desc: '', params: { tradeBarriers: 0.5 }, dims: { nation: 0.4, econ: -0.2 }, groups: { workers: 3, farmers: 3, business: -1 } },
      { id: 'moderate', name: 'Apertura moderada', desc: '', params: { tradeBarriers: 0.25 }, dims: {}, groups: {} },
      { id: 'free', name: 'Libre comercio', desc: '', params: { tradeBarriers: 0.05 }, dims: { econ: 0.7, nation: -0.5 }, groups: { business: 5, middle: 2, workers: -3, farmers: -2 } }
    ]
  },
  {
    id: 'capitalControls', category: 'commerce', name: 'Movimientos de capital', options: [
      { id: 'strict', name: 'Control de cambios estricto', desc: '', params: { capitalOpenness: 0.1 }, dims: { econ: -0.5 }, groups: { business: -5, middle: -3 } },
      { id: 'moderate', name: 'Controles moderados', desc: '', params: { capitalOpenness: 0.5 }, dims: {}, groups: {} },
      { id: 'free', name: 'Libre movilidad', desc: 'Atrae capital y lo expone a fugas repentinas.', params: { capitalOpenness: 0.95 }, dims: { econ: 0.6 }, groups: { business: 4 } }
    ]
  },
  // ------------------------------------------------------------ migraciones
  {
    id: 'immigration', category: 'migration', name: 'Inmigración', options: [
      { id: 'closed', name: 'Cerrada', desc: '', params: { immigration: 0 }, dims: { nation: 0.8 }, groups: { workers: 2, minorities: -2, business: -2 } },
      { id: 'restricted', name: 'Restringida', desc: '', params: { immigration: 0.25 }, dims: { nation: 0.3 }, groups: {} },
      { id: 'selective', name: 'Selectiva por calificación', desc: '', params: { immigration: 0.5 }, dims: { econ: 0.2 }, groups: { business: 2 } },
      { id: 'open', name: 'Abierta', desc: '', params: { immigration: 0.9 }, dims: { nation: -0.8 }, groups: { business: 3, workers: -3, minorities: 3 } }
    ]
  },
  {
    id: 'emigration', category: 'migration', name: 'Emigración', options: [
      { id: 'banned', name: 'Prohibida', desc: '', params: { emigration: 0.05, repression: 0.05 }, dims: { authority: 0.8 }, groups: { youth: -6, middle: -5 } },
      { id: 'restricted', name: 'Con permiso de salida', desc: '', params: { emigration: 0.4 }, dims: { authority: 0.3 }, groups: { youth: -2 } },
      { id: 'free', name: 'Libre', desc: '', params: { emigration: 1 }, dims: { authority: -0.3 }, groups: { youth: 2 } }
    ]
  },
  // ------------------------------------------------------------ religión
  {
    id: 'religion', category: 'religion', name: 'Religión y Estado', options: [
      { id: 'theocratic', name: 'Ley religiosa', desc: '', params: { stateReligion: 1, religiousFreedom: 0.2 }, dims: { social: -1, authority: 0.5 }, groups: { religious: 10, youth: -5, minorities: -5, middle: -3 } },
      { id: 'official', name: 'Religión oficial', desc: '', params: { stateReligion: 0.6, religiousFreedom: 0.6 }, dims: { social: -0.4 }, groups: { religious: 4 } },
      { id: 'secular', name: 'Estado laico', desc: '', params: { stateReligion: 0.1, religiousFreedom: 0.95 }, dims: { social: 0.3 }, groups: { religious: -2 } },
      { id: 'atheist', name: 'Ateísmo de Estado', desc: '', params: { stateReligion: 0, religiousFreedom: 0.1, repression: 0.06 }, dims: { social: 0.4, authority: 0.6, econ: -0.2 }, groups: { religious: -14 } }
    ]
  },
  // ------------------------------------------------------------ medios
  {
    id: 'press', category: 'media', name: 'Prensa', options: [
      { id: 'state', name: 'Controlada por el Estado', desc: 'La aprobación medida sube; la corrupción se vuelve invisible.', params: { pressFreedom: 0.05 }, dims: { authority: 0.9 }, groups: { middle: -5, youth: -3 } },
      { id: 'licensed', name: 'Licencias y control', desc: '', params: { pressFreedom: 0.45 }, dims: { authority: 0.3 }, groups: {} },
      { id: 'free', name: 'Libre', desc: '', params: { pressFreedom: 0.95 }, dims: { authority: -0.6 }, groups: { middle: 4, youth: 2 } }
    ]
  },
  {
    id: 'broadcasting', category: 'media', name: 'Radio y televisión', options: [
      { id: 'monopoly', name: 'Monopolio estatal', desc: '', params: { pressFreedom: -0.1 }, dims: { econ: -0.4, authority: 0.4 }, groups: { public: 2 } },
      { id: 'mixed', name: 'Sistema mixto', desc: '', params: {}, dims: {}, groups: {} },
      { id: 'private', name: 'Privado', desc: '', params: { pressFreedom: 0.05 }, dims: { econ: 0.5 }, groups: { business: 3 } }
    ]
  }
];

export const LAW_BY_ID: Record<string, LawDef> = Object.fromEntries(LAWS.map((l) => [l.id, l]));

export function lawOption(lawId: string, optionId: string): LawOption | undefined {
  return LAW_BY_ID[lawId]?.options.find((o) => o.id === optionId);
}

/** Calcula los parámetros institucionales efectivos de un conjunto de leyes. */
export function computeLawParams(laws: Record<string, string>): LawParams {
  const p: LawParams = { ...DEFAULT_PARAMS };
  // represión y movilización se acumulan desde varias leyes; algunas leyes secundarias ajustan parámetros de otras
  const additive = new Set<keyof LawParams>(['repression', 'mobilization']);
  const secondary: Record<string, (keyof LawParams)[]> = { minorities: ['centralization'], broadcasting: ['pressFreedom'], competition: ['regulation'] };
  const deferred: [keyof LawParams, number][] = [];
  for (const law of LAWS) {
    const opt = lawOption(law.id, laws[law.id]);
    if (!opt) continue;
    for (const [k, v] of Object.entries(opt.params) as [keyof LawParams, number][]) {
      if (additive.has(k) || secondary[law.id]?.includes(k)) deferred.push([k, v]);
      else (p[k] as number) = v;
    }
  }
  for (const [k, v] of deferred) (p[k] as number) = (p[k] as number) + v;
  // la democracia efectiva depende de varias leyes, no solo de la forma de gobierno
  const regimeDem = p.democracy;
  p.democracy = Math.max(0, Math.min(1, regimeDem * (0.55 + 0.15 * p.civilLiberty + 0.15 * p.pressFreedom + 0.15 * p.judicialIndependence) * (0.4 + 0.6 * p.partyFreedom)));
  p.repression = Math.max(0, Math.min(1, p.repression));
  p.pressFreedom = Math.max(0, Math.min(1, p.pressFreedom));
  p.centralization = Math.max(0, Math.min(1, p.centralization));
  return p;
}

export function isDemocratic(regime: string): boolean { return DEMOCRATIC.includes(regime as RegimeId); }
export { DEMOCRATIC, AUTOCRATIC };
