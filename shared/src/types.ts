// Tipos centrales de CYO. Todo el estado autoritativo es JSON serializable.

export type Id = string;
export type CountryId = string;
export type ProvinceId = string;
export type SeaZoneId = string;

// ---------------------------------------------------------------------------
// Geografía estática (generada una vez por partida y no modificada)
// ---------------------------------------------------------------------------

export const TERRAIN = {
  OCEAN: 0, SHALLOW: 1, LAKE: 2, PLAINS: 3, GRASSLAND: 4, FOREST: 5, JUNGLE: 6, HILLS: 7,
  MOUNTAINS: 8, DESERT: 9, STEPPE: 10, TUNDRA: 11, ICE: 12, MARSH: 13, SAVANNA: 14
} as const;
export type TerrainCode = (typeof TERRAIN)[keyof typeof TERRAIN];

export const RESOURCE_KEYS = ['oil', 'gas', 'coal', 'minerals', 'fertile', 'timber', 'fish', 'hydro'] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];
export type ResourceDeposits = Record<ResourceKey, number>;

export type CrossingKind = 'land' | 'river' | 'strait';
export interface ProvinceLink { to: ProvinceId; kind: CrossingKind; border: number }

export type Climate = 'polar' | 'cold' | 'temperate' | 'arid' | 'tropical';

export interface ProvinceStatic {
  id: ProvinceId;
  idx: number;
  name: string;
  cityName: string;
  landmass: number;
  cells: number;
  /** centro en coordenadas de celdas hexagonales (col, fila con decimales) */
  cx: number;
  cy: number;
  terrain: TerrainCode;
  /** 0..1, proporción de colinas/montañas/bosque denso: frena el movimiento y ayuda al defensor */
  roughness: number;
  climate: Climate;
  coastal: boolean;
  harbor: boolean;
  seaZones: SeaZoneId[];
  neighbors: ProvinceLink[];
  /** 0 = sin río, 1 = río, 2 = río navegable */
  river: 0 | 1 | 2;
  resources: ResourceDeposits;
  habitability: number;
  culture: string;
  religion: string;
}

export interface SeaZoneStatic {
  id: SeaZoneId;
  idx: number;
  name: string;
  cells: number;
  cx: number;
  cy: number;
  neighbors: SeaZoneId[];
  provinces: ProvinceId[];
  deep: boolean;
}

export interface LandmassStatic {
  id: number;
  name: string;
  kind: 'continent' | 'island' | 'archipelago';
  cells: number;
  provinces: ProvinceId[];
}

export interface MapFeature { kind: 'ocean' | 'sea' | 'mountains' | 'desert' | 'forest' | 'river' | 'lake' | 'plains'; name: string; cx: number; cy: number }

export interface RiverPath { name: string; navigable: boolean; cells: number[] }

export interface CultureDef { id: string; name: string; adjective: string; color: string; language: string }
export interface ReligionDef { id: string; name: string; color: string; traditionalism: number }

export interface WorldMap {
  formatVersion: number;
  generator: { version: string; seed: string; mode: 'official' | 'random'; name: string };
  width: number;
  height: number;
  /** arrays por celda codificados en base64 */
  cells: { terrain: string; elevation: string; province: string; sea: string; river: string };
  provinces: ProvinceStatic[];
  seaZones: SeaZoneStatic[];
  landmasses: LandmassStatic[];
  rivers: RiverPath[];
  features: MapFeature[];
  cultures: CultureDef[];
  religions: ReligionDef[];
}

// ---------------------------------------------------------------------------
// Economía
// ---------------------------------------------------------------------------

export const SECTORS = [
  'agriculture', 'livestock', 'mining', 'oil', 'gas', 'energy', 'industry', 'construction',
  'transport', 'telecom', 'services', 'finance', 'tech', 'tourism', 'defense'
] as const;
export type SectorId = (typeof SECTORS)[number];

export const BUDGET_CATEGORIES = [
  'education', 'health', 'defense', 'security', 'justice', 'infrastructure',
  'administration', 'science', 'intelligence', 'subsidies', 'transfers'
] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export const TAXES = ['vat', 'income', 'corporate', 'wealth', 'import', 'export', 'excise', 'payroll', 'provincial'] as const;
export type TaxId = (typeof TAXES)[number];

export const COMMODITIES = ['food', 'oil', 'gas', 'coal', 'minerals'] as const;
export type CommodityId = (typeof COMMODITIES)[number];

export interface SectorState {
  /** empleo en millones */
  labor: number;
  /** productividad total de factores */
  tfp: number;
  /** participación estatal 0..1 */
  stateShare: number;
  /** producción real anualizada, miles de millones de UMI de 1990 */
  output: number;
  /** subsidio relativo recibido (0..1) */
  subsidy: number;
  /** regulación de precios/servicio tras privatización: 0 = libre, 1 = topes estrictos */
  priceCap: number;
  /** prima salarial relativa del sector (calibrada al inicio) */
  wageIndex: number;
  /** margen sobre costes (poder de mercado) */
  markup: number;
}

export interface CommodityBalance { production: number; consumption: number; imports: number; exports: number; shortage: number }

export interface EconomyState {
  sectors: Record<SectorId, SectorState>;
  realGDP: number;
  potentialGDP: number;
  nominalGDP: number;
  outputGap: number;
  growth: number;
  priceLevel: number;
  inflation: number;
  expectedInflation: number;
  moneySupply: number;
  moneyGrowth: number;
  policyRate: number;
  baseExchangeRate: number;
  exchangeRate: number;
  reserves: number;
  laborForce: number;
  employed: number;
  unemployment: number;
  naturalUnemployment: number;
  participation: number;
  informality: number;
  wage: number;
  consumption: number;
  investment: number;
  government: number;
  exports: number;
  imports: number;
  currentAccount: number;
  fdi: number;
  poverty: number;
  gini: number;
  confidence: number;
  riskPremium: number;
  energyShortage: number;
  foodShortage: number;
  commodities: Record<CommodityId, CommodityBalance>;
  /** proporción de la demanda interna abastecida por importaciones */
  importPropensity: number;
  lastRealGDP: number[];
  bankStress: number;
}

export interface FiscalState {
  /** caja del Tesoro, moneda local nominal, miles de millones */
  treasury: number;
  /** deuda interna en moneda local */
  debtDomestic: number;
  /** deuda externa en UMI */
  debtForeign: number;
  /** tasa media que paga la deuda */
  debtRate: number;
  /** recaudación anualizada por impuesto (moneda local); incluye rentas de recursos y dividendos de empresas públicas */
  revenue: Record<TaxId | 'rents' | 'soe', number>;
  /** gasto anualizado por partida (moneda local) */
  spending: Record<BudgetCategory, number>;
  interest: number;
  balance: number;
  /** fracción del déficit financiada con emisión */
  monetization: number;
  inDefault: boolean;
  defaultSinceDay: number | null;
  defaultsHistory: number;
  arrears: number;
  rating: string;
  /** contabilidad acumulada para auditoría (moneda local) */
  ledger: { revenue: number; spending: number; interest: number; borrowed: number; repaid: number; printed: number; extraordinary: number; aid: number };
}

// ---------------------------------------------------------------------------
// Política y sociedad
// ---------------------------------------------------------------------------

export const POLITICAL_DIMENSIONS = ['econ', 'welfare', 'authority', 'social', 'nation', 'central'] as const;
export type Dimension = (typeof POLITICAL_DIMENSIONS)[number];
export type DimVector = Record<Dimension, number>;

export const SOCIAL_GROUPS = ['workers', 'farmers', 'business', 'middle', 'public', 'pensioners', 'youth', 'military', 'religious', 'minorities'] as const;
export type GroupId = (typeof SOCIAL_GROUPS)[number];

export interface GroupState { size: number; sat: number; radical: number; weight: number; ideal: DimVector }

export type RegimeId =
  | 'parliamentary_democracy' | 'presidential_republic' | 'constitutional_monarchy'
  | 'absolute_monarchy' | 'one_party_state' | 'military_junta' | 'theocracy';

export interface Party {
  id: string;
  name: string;
  short: string;
  family: string;
  color: string;
  pos: DimVector;
  popularity: number;
  vote: number;
  legal: boolean;
}

export interface Bill {
  id: string;
  law: string;
  option: string;
  proposedDay: number;
  voteDay: number;
  status: 'debate' | 'passed' | 'rejected' | 'implementing' | 'enacted' | 'withdrawn';
  support: number;
  required: number;
  effectiveDay: number | null;
  byDecree: boolean;
}

export interface PoliticsState {
  approval: number;
  legitimacy: number;
  adminCapacity: number;
  stability: number;
  politicalCapital: number;
  corruption: number;
  ruleOfLaw: number;
  coupRisk: number;
  protest: number;
  strikes: number;
  crime: number;
  separatism: number;
  lastElectionDay: number;
  nextElectionDay: number | null;
  governmentParties: string[];
  headOfGovernment: string;
  headOfState: string;
  decreesThisYear: number;
}

export interface DemographyState {
  young: number;
  adult: number;
  old: number;
  urban: number;
  education: [number, number, number, number];
  fertility: number;
  lifeExpectancy: number;
  births: number;
  deaths: number;
  netMigration: number;
  religiosity: number;
}

export interface Stocks {
  humanCapital: number;
  health: number;
  infrastructure: number;
  science: number;
  security: number;
  justice: number;
  administration: number;
  intelligence: number;
}

export interface Project {
  id: string;
  kind: ProjectKind;
  province: ProvinceId | null;
  startDay: number;
  endDay: number;
  totalCost: number;
  paid: number;
  progress: number;
  status: 'active' | 'done' | 'cancelled' | 'stalled';
  params?: Record<string, string | number>;
}

export type ProjectKind =
  | 'road' | 'port' | 'airport' | 'power_plant' | 'industrial_zone' | 'military_base' | 'fortification' | 'refinery' | 'university'
  | 'privatization' | 'nationalization';

export interface Buildings { port: number; airport: number; power_plant: number; industrial_zone: number; military_base: number; fortification: number; refinery: number; university: number }

export interface TechState { known: string[]; progress: Record<string, number>; queue: string[]; points: number; discoveredDay: Record<string, number> }

export interface MilitaryState {
  manpower: number;
  equipment: { arms: number; vehicles: number; aircraft: number; ships: number };
  production: { arms: number; vehicles: number; aircraft: number; ships: number };
  commandQuality: number;
  warExhaustion: number;
  doctrine: 'defensive' | 'balanced' | 'offensive';
  personnel: number;
}

export interface Decision {
  id: string;
  event: string;
  title: string;
  text: string;
  options: { id: string; label: string; description: string }[];
  createdDay: number;
  expiresDay: number;
  defaultOption: string;
  data?: Record<string, string | number>;
}

export interface AbsenceDirectives {
  /** mantener el presupuesto equilibrado ajustando gastos discrecionales */
  balanceBudget: boolean;
  /** continuar la cola de investigación automáticamente */
  continueResearch: boolean;
  /** reponer pérdidas de guarnición dentro del presupuesto */
  maintainGarrison: boolean;
  /** responder automáticamente decisiones vencidas con la opción por defecto */
  autoDecisions: boolean;
  /** aceptar tratados comerciales de países con relación > 50 */
  acceptFriendlyTrade: boolean;
}

export interface FlagSpec {
  pattern: 'tricolor_h' | 'tricolor_v' | 'bicolor_h' | 'bicolor_v' | 'cross' | 'nordic' | 'canton' | 'diagonal' | 'disc' | 'chevron' | 'bordered' | 'quartered';
  colors: string[];
  emblem: 'none' | 'star' | 'sun' | 'moon' | 'circle' | 'diamond' | 'wheel' | 'tower' | 'stars3';
  emblemColor: string;
}

export interface CountryState {
  id: CountryId;
  name: string;
  longName: string;
  adjective: string;
  color: string;
  flag: FlagSpec;
  currency: { name: string; code: string };
  capital: ProvinceId;
  culture: string;
  religion: string;
  archetype: string;
  bloc: string | null;
  history: string[];
  foundedYear: number;
  createdDay: number;
  alive: boolean;
  successorOf: CountryId | null;
  regime: RegimeId;
  laws: Record<string, string>;
  bills: Bill[];
  parties: Party[];
  parliament: Record<string, number>;
  seats: number;
  politics: PoliticsState;
  groups: Record<GroupId, GroupState>;
  demography: DemographyState;
  econ: EconomyState;
  fiscal: FiscalState;
  budget: Record<BudgetCategory, number>;
  taxes: Record<TaxId, number>;
  stocks: Stocks;
  tech: TechState;
  military: MilitaryState;
  projects: Project[];
  decisions: Decision[];
  directives: AbsenceDirectives;
  ai: { profile: string; nextReview: number; memory: Record<CountryId, number>; targetArmy: number; lastWarCheck: number };
  strengths: string[];
  weaknesses: string[];
  claims: ProvinceId[];
  cooldowns: Record<string, number>;
  series: Record<string, number[]>;
}

export interface ProvinceState {
  id: ProvinceId;
  owner: CountryId;
  controller: CountryId;
  occupiedSince: number | null;
  pop: number;
  urban: number;
  capital: number[];
  infra: number;
  buildings: Buildings;
  reserves: { oil: number; gas: number; coal: number; minerals: number };
  unrest: number;
  devastation: number;
  supply: number;
  /** cultura mayoritaria actual (puede cambiar lentamente con migración/asimilación) */
  culture: string;
  autonomy: number;
}

// ---------------------------------------------------------------------------
// Diplomacia
// ---------------------------------------------------------------------------

export interface Relation {
  a: CountryId;
  b: CountryId;
  opinion: number;
  trust: number;
  rivalry: number;
  embassies: boolean;
  sanctions: CountryId[];
  recognized: boolean;
  border: boolean;
}

export type TreatyType =
  | 'trade_agreement' | 'non_aggression' | 'defensive_alliance' | 'military_alliance' | 'energy_agreement'
  | 'science_cooperation' | 'customs_union' | 'migration_cooperation' | 'economic_aid' | 'loan'
  | 'military_access' | 'peace' | 'ceasefire' | 'territorial_cession' | 'unification' | 'recognition'
  | 'debt_relief' | 'mediation' | 'join_organization';

export interface TreatyTerms {
  amount?: number;
  monthly?: number;
  months?: number;
  rate?: number;
  years?: number;
  provinces?: ProvinceId[];
  provincesTo?: CountryId;
  reparations?: number;
  demilitarized?: ProvinceId[];
  recognize?: CountryId;
  organization?: string;
  warId?: string;
  truceYears?: number;
  share?: number;
  outstanding?: number;
  lender?: CountryId;
  mediator?: CountryId;
}

export interface Treaty {
  id: string;
  type: TreatyType;
  name: string;
  parties: CountryId[];
  terms: TreatyTerms;
  signedDay: number;
  expiresDay: number | null;
  status: 'active' | 'cancelled' | 'broken' | 'expired' | 'fulfilled';
  endedDay: number | null;
  brokenBy: CountryId | null;
}

export interface Proposal {
  id: string;
  from: CountryId;
  to: CountryId;
  type: TreatyType;
  terms: TreatyTerms;
  message: string;
  createdDay: number;
  expiresDay: number;
  status: 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired' | 'withdrawn';
  counterOf: string | null;
  resolvedDay: number | null;
}

export interface Organization {
  id: string;
  name: string;
  kind: 'economic' | 'military' | 'political' | 'scientific';
  founder: CountryId;
  members: CountryId[];
  foundedDay: number;
  tariffCut: number;
  mutualDefense: boolean;
  scienceShare: number;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Militar
// ---------------------------------------------------------------------------

export const UNIT_TYPES = [
  'infantry', 'mechanized', 'armored', 'artillery', 'special_forces',
  'fighter', 'strike', 'surface_fleet', 'submarine_fleet', 'amphibious_fleet', 'carrier_group'
] as const;
export type UnitType = (typeof UNIT_TYPES)[number];
export type UnitDomain = 'land' | 'air' | 'sea';

export type OrderKind = 'move' | 'attack' | 'defend' | 'hold' | 'retreat' | 'blockade' | 'patrol' | 'embark' | 'disembark' | 'air_superiority' | 'ground_support' | 'interdiction' | 'bombing' | 'recon' | 'rebase' | 'sabotage';

export interface UnitOrder { kind: OrderKind; target: string | null; issuedDay: number; planId?: string | null }

export interface Unit {
  id: string;
  owner: CountryId;
  type: UnitType;
  domain: UnitDomain;
  name: string;
  location: string;
  strength: number;
  equipment: number;
  training: number;
  experience: number;
  morale: number;
  organization: number;
  supply: number;
  fuel: number;
  entrenchment: number;
  status: 'training' | 'ready' | 'moving' | 'combat' | 'retreating' | 'embarked' | 'frozen';
  readyDay: number;
  order: UnitOrder | null;
  path: string[];
  progress: number;
  battleId: string | null;
  carrier: string | null;
  createdDay: number;
  tech: number;
  fatigue: number;
}

export interface BattleLogEntry { day: number; attackerLoss: number; defenderLoss: number; ratio: number }

export interface Battle {
  id: string;
  warId: string;
  province: ProvinceId;
  attacker: CountryId;
  defender: CountryId;
  attackers: string[];
  defenders: string[];
  startDay: number;
  lastDay: number;
  casualtiesAttacker: number;
  casualtiesDefender: number;
  log: BattleLogEntry[];
  status: 'active' | 'attacker_won' | 'defender_won' | 'frozen' | 'ended';
  amphibious: boolean;
}

export interface WarParticipant { country: CountryId; side: 'attacker' | 'defender'; joinedDay: number; leader: boolean }

export interface CallToArms { country: CountryId; side: 'attacker' | 'defender'; status: 'pending' | 'accepted' | 'declined'; day: number; treaty: string | null }

export interface War {
  id: string;
  name: string;
  attacker: CountryId;
  defender: CountryId;
  participants: WarParticipant[];
  goal: { kind: 'conquest' | 'claims' | 'independence' | 'regime_change' | 'punitive' | 'unification'; provinces: ProvinceId[] };
  declaredDay: number;
  status: 'pending' | 'preparing' | 'active' | 'frozen' | 'ceasefire' | 'ended';
  preparingUntil: number | null;
  startedDay: number | null;
  endedDay: number | null;
  frozenReason: string | null;
  /** países humanos cuya conexión es obligatoria para que avance la guerra (lo mantiene el servidor) */
  mandatoryHumans: CountryId[];
  ready: CountryId[];
  callsToArms: CallToArms[];
  casualties: Record<CountryId, number>;
  battlesWon: Record<CountryId, number>;
  warscore: number;
  result: string | null;
  activeDays: number;
}

export interface BattlePlan {
  id: string;
  owner: CountryId;
  kind: 'front_defense' | 'offensive';
  units: string[];
  targets: ProvinceId[];
  enemy: CountryId | null;
  createdDay: number;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Eventos / noticias
// ---------------------------------------------------------------------------

export type EventScope = 'world' | 'national' | 'private';
export type Severity = 'info' | 'minor' | 'major' | 'critical';

export interface GameEvent {
  id: string;
  day: number;
  type: string;
  scope: EventScope;
  severity: Severity;
  countries: CountryId[];
  title: string;
  text: string;
  province?: ProvinceId;
  data?: Record<string, string | number | boolean>;
}

export interface MarketState { price: number; basePrice: number; supply: number; demand: number }

export interface TradeFlow { from: CountryId; to: CountryId; value: number }

export interface WorldState {
  formatVersion: number;
  seed: string;
  day: number;
  rng: [number, number, number, number];
  nextId: number;
  countries: Record<CountryId, CountryState>;
  provinces: Record<ProvinceId, ProvinceState>;
  relations: Record<string, Relation>;
  treaties: Record<string, Treaty>;
  proposals: Record<string, Proposal>;
  organizations: Record<string, Organization>;
  wars: Record<string, War>;
  battles: Record<string, Battle>;
  units: Record<string, Unit>;
  plans: Record<string, BattlePlan>;
  markets: Record<CommodityId, MarketState>;
  trade: TradeFlow[];
  worldInterestRate: number;
  worldInflation: number;
  worldPriceLevel: number;
  recentEvents: GameEvent[];
  /** control de qué países tienen jugador humano (lo actualiza el servidor, afecta IA y guerras) */
  humanCountries: CountryId[];
  /** países humanos actualmente conectados (para la regla de guerras sincronizadas) */
  onlineCountries: CountryId[];
  settings: { advancedAI: boolean; warPrepDays: number };
  /** parámetros de calibración global fijados al crear el mundo */
  calib: { tradeScale: number; foodPerCapita: number; energyScale: Record<'oil' | 'gas' | 'coal', number>; mineralScale: number; worldGDP0: number };
  scenario: { mode: 'official' | 'random'; name: string; seed: string };
}
