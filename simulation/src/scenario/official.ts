import type { WorldDesign, CountryDesign } from './design.js';
import { OFFICIAL_GEO, OFFICIAL_SEED } from './officialGeo.js';

/**
 * MUNDO OFICIAL DE CYO: "Vereth", 1 de enero de 1990.
 *
 * Mundo diseñado a mano: continentes, países, regímenes, economías y antecedentes son fijos y
 * documentados (docs/MUNDO_OFICIAL.md). Los países son deliberadamente desiguales: hay gigantes
 * industriales sin energía, emiratos petroleros diminutos con instituciones frágiles, islas
 * tecnológicas dependientes del comercio y federaciones socialistas en declive.
 */

type C = CountryDesign;
const f = (pattern: C['flag']['pattern'], colors: string[], emblem: C['flag']['emblem'] = 'none', emblemColor = '#ffffff'): C['flag'] => ({ pattern, colors, emblem, emblemColor });

const COUNTRIES: C[] = [
  // ============================================================== AURELIA
  {
    key: 'VAL', name: 'Valdoria', longName: 'República Federal de Valdoria', adjective: 'valdoriano', culture: 'valdoriano', religion: 'reforma',
    anchor: [0.22, 0.18], weight: 2.6, population: 148, gdpPerCapita: 19500, regime: 'parliamentary_democracy', archetype: 'industrial',
    ideology: { econ: 0.3, welfare: 0.4, authority: -0.4, social: 0.1, nation: -0.1, central: -0.4 }, bloc: 'pacto', military: 0.9, techLevel: 0.85, institutions: 0.85,
    gini: 0.29, debt: 0.42, inflation: 0.03, stateShare: 0.12, openness: 0.55, color: '#3f6fb5', flag: f('tricolor_h', ['#1c2b4a', '#c9a227', '#3f6fb5']),
    currency: { name: 'marco valdoriano', code: 'VDM', rate: 1.8 }, capitalName: 'Hesselberg', foundedYear: 1871,
    history: [
      'Unificada en 1871 a partir de once principados del norte de Aurelia, Valdoria se convirtió en la primera potencia industrial del continente.',
      'Derrotada en la Guerra de los Estrechos (1948-1952) frente a la Unión Kharzi, se reconstruyó como federación parlamentaria y fundó el Pacto de Aurelia.',
      'Mantiene una disputa histórica con Morvaine por el valle de Cendria, cedido en el Tratado de Hessel.'
    ],
    strengths: ['Base industrial y tecnológica enorme', 'Instituciones sólidas', 'Mano de obra calificada'],
    weaknesses: ['Casi sin petróleo ni gas propios', 'Población envejecida', 'Dependencia del comercio exterior'],
    aiProfile: 'trader', religiosity: 0.35
  },
  {
    key: 'CAS', name: 'Castrenia', longName: 'Reino de Castrenia', adjective: 'castreno', culture: 'castreno', religion: 'primacia',
    anchor: [0.1, 0.39], weight: 1.5, population: 41, gdpPerCapita: 13800, regime: 'constitutional_monarchy', archetype: 'services_finance',
    ideology: { econ: 0.2, welfare: 0.3, authority: -0.2, social: -0.1, nation: 0.2, central: 0.5 }, bloc: 'pacto', military: 1.1, techLevel: 0.65, institutions: 0.7,
    gini: 0.33, debt: 0.55, inflation: 0.06, stateShare: 0.2, openness: 0.45, color: '#b5473f', flag: f('bicolor_h', ['#b5473f', '#e8c547'], 'tower', '#1c1c1c'),
    currency: { name: 'dobla', code: 'CDB', rate: 95 }, capitalName: 'Valmora', foundedYear: 1492,
    history: [
      'Antiguo imperio marítimo que colonizó Meridia y las islas del oeste; perdió casi todas sus colonias entre 1820 y 1965.',
      'Conserva la Isla de Sarn como territorio dependiente, donde crece un movimiento independentista.',
      'Una dictadura conservadora gobernó entre 1939 y 1976; la monarquía constitucional actual es joven.'
    ],
    strengths: ['Gran sector financiero', 'Lazos culturales con Meridia', 'Armada tradicional'],
    weaknesses: ['Deuda pública elevada', 'Desempleo estructural', 'Separatismo en Sarn'],
    aiProfile: 'balanced', religiosity: 0.6
  },
  {
    key: 'HJE', name: 'Hjelmark', longName: 'Mancomunidad de Hjelmark', adjective: 'hjelmarqués', culture: 'hjelm', religion: 'reforma',
    anchor: [0.17, 0.11], weight: 1.0, population: 7.5, gdpPerCapita: 24500, regime: 'parliamentary_democracy', archetype: 'tech_trader',
    ideology: { econ: 0.1, welfare: 0.8, authority: -0.7, social: 0.6, nation: -0.4, central: 0 }, bloc: null, military: 0.7, techLevel: 0.95, institutions: 0.95,
    gini: 0.23, debt: 0.3, inflation: 0.025, stateShare: 0.18, openness: 0.75, color: '#4f9a8f', flag: f('nordic', ['#2b6f8f', '#f2f2f2', '#d4a72c']),
    currency: { name: 'krona hjelmarquesa', code: 'HJK', rate: 6.2 }, capitalName: 'Eirhavn', foundedYear: 1814,
    history: [
      'Neutral desde 1814, Hjelmark se mantuvo fuera de la Guerra de los Estrechos y de ambos bloques.',
      'Su estado de bienestar y su industria electrónica la convirtieron en la sociedad más rica e igualitaria de Vereth.',
      'Administra las Islas Brumas, ricas en pesca.'
    ],
    strengths: ['Altísimo capital humano', 'Instituciones ejemplares', 'Industria tecnológica'],
    weaknesses: ['Población pequeña', 'Economía muy abierta y expuesta', 'Ejército reducido'],
    aiProfile: 'scientific', religiosity: 0.2
  },
  {
    key: 'STR', name: 'Strandholm', longName: 'Reino de Strandholm', adjective: 'strandholmés', culture: 'strand', religion: 'reforma',
    anchor: [0.07, 0.25], weight: 0.9, population: 9.4, gdpPerCapita: 17800, regime: 'constitutional_monarchy', archetype: 'resource_exporter',
    ideology: { econ: 0.2, welfare: 0.5, authority: -0.5, social: 0.3, nation: 0, central: 0.2 }, bloc: 'pacto', military: 0.9, techLevel: 0.75, institutions: 0.85,
    gini: 0.26, debt: 0.35, inflation: 0.04, stateShare: 0.25, openness: 0.6, color: '#6a8fc9', flag: f('nordic', ['#c23b3b', '#f2f2f2', '#1f3d7a']),
    currency: { name: 'daler', code: 'STD', rate: 7 }, capitalName: 'Strandvik', foundedYear: 1523,
    history: [
      'Monarquía marinera de pescadores y armadores, con yacimientos de gas en su plataforma continental.',
      'Miembro fundador del Pacto de Aurelia por temor a la flota kharzi.'
    ],
    strengths: ['Gas marino', 'Flota pesquera y mercante', 'Estabilidad'],
    weaknesses: ['Mercado interno pequeño', 'Clima duro'],
    aiProfile: 'balanced', religiosity: 0.3
  },
  {
    key: 'LUS', name: 'Lusarra', longName: 'República de Lusarra', adjective: 'lusarro', culture: 'lusarro', religion: 'primacia',
    anchor: [0.28, 0.4], weight: 1.1, population: 23, gdpPerCapita: 9800, regime: 'presidential_republic', archetype: 'tourism_islands',
    ideology: { econ: 0.1, welfare: 0.3, authority: -0.1, social: -0.1, nation: 0.2, central: 0.6 }, bloc: 'pacto', military: 0.8, techLevel: 0.55, institutions: 0.55,
    gini: 0.36, debt: 0.62, inflation: 0.11, stateShare: 0.28, openness: 0.4, color: '#d08a3a', flag: f('tricolor_v', ['#2a7f4f', '#f4e9cf', '#d08a3a'], 'sun', '#c4302b'),
    currency: { name: 'escudo lusarro', code: 'LSE', rate: 150 }, capitalName: 'Portalegre do Sul', foundedYear: 1910,
    history: [
      'República desde 1910; sufrió un régimen militar entre 1967 y 1983 tras una guerra colonial perdida.',
      'Las costas soleadas del sur de Aurelia atraen al turismo de todo el continente.'
    ],
    strengths: ['Turismo', 'Agricultura mediterránea', 'Clima'],
    weaknesses: ['Inflación persistente', 'Deuda alta', 'Industria poco competitiva'],
    aiProfile: 'balanced', religiosity: 0.65
  },
  {
    key: 'MOR', name: 'Morvaine', longName: 'República de Morvaine', adjective: 'morvano', culture: 'morvano', religion: 'primacia',
    anchor: [0.19, 0.31], weight: 1.3, population: 33, gdpPerCapita: 14200, regime: 'presidential_republic', archetype: 'emerging_industrial',
    ideology: { econ: 0, welfare: 0.4, authority: 0, social: -0.2, nation: 0.5, central: 0.6 }, bloc: 'pacto', military: 1.2, techLevel: 0.7, institutions: 0.65,
    gini: 0.31, debt: 0.38, inflation: 0.05, stateShare: 0.3, openness: 0.4, color: '#7d5ba6', flag: f('tricolor_v', ['#1f3d7a', '#f2f2f2', '#7d5ba6']),
    currency: { name: 'florán', code: 'MFL', rate: 5.6 }, capitalName: 'Lirenne', foundedYear: 1789,
    history: [
      'Vieja república revolucionaria con fuerte tradición estatista y orgullo nacional.',
      'Reclama el valle de Cendria, perdido ante Valdoria en el Tratado de Hessel; aun así es aliada de Valdoria frente a Kharzun.'
    ],
    strengths: ['Industria aeronáutica y armamentística', 'Agricultura fértil', 'Ejército moderno'],
    weaknesses: ['Rigidez laboral', 'Rivalidad con Valdoria', 'Dependencia energética'],
    aiProfile: 'nationalist', religiosity: 0.45
  },
  {
    key: 'VEL', name: 'Vellmont', longName: 'Confederación de Vellmont', adjective: 'vellmontés', culture: 'vellmont', religion: 'reforma',
    anchor: [0.15, 0.26], weight: 0.45, population: 6.8, gdpPerCapita: 27500, regime: 'parliamentary_democracy', archetype: 'services_finance',
    ideology: { econ: 0.6, welfare: 0.1, authority: -0.5, social: 0, nation: 0.1, central: -0.9 }, bloc: null, military: 0.8, techLevel: 0.85, institutions: 0.95,
    gini: 0.3, debt: 0.2, inflation: 0.02, stateShare: 0.08, openness: 0.7, color: '#c23b3b', flag: f('cross', ['#c23b3b', '#f2f2f2']),
    currency: { name: 'táler de Vellmont', code: 'VLT', rate: 1.5 }, capitalName: 'Bernhalde', foundedYear: 1648,
    history: [
      'Confederación de cantones montañeses, neutral armada desde 1648.',
      'Su secreto bancario atrajo capitales de todo el mundo; la plaza financiera de Bernhalde es la más importante de Vereth.'
    ],
    strengths: ['Centro financiero mundial', 'Neutralidad respetada', 'Defensas de montaña'],
    weaknesses: ['Sin salida al mar', 'Muy pequeño', 'Sin recursos'],
    aiProfile: 'trader', religiosity: 0.35
  },
  {
    key: 'ARD', name: 'Ardenza', longName: 'República Popular de Ardenza', adjective: 'ardenzano', culture: 'ardenzano', religion: 'primacia',
    anchor: [0.33, 0.28], weight: 1.0, population: 16, gdpPerCapita: 6400, regime: 'one_party_state', archetype: 'socialist_industrial',
    ideology: { econ: -0.8, welfare: 0.6, authority: 0.7, social: 0, nation: 0.1, central: 0.8 }, bloc: 'concordia', military: 1.2, techLevel: 0.5, institutions: 0.45,
    gini: 0.25, debt: 0.45, inflation: 0.09, stateShare: 0.85, openness: 0.25, color: '#a83232', flag: f('bicolor_h', ['#a83232', '#f2f2f2'], 'star', '#e8c547'),
    currency: { name: 'lira popular', code: 'ARL', rate: 22 }, capitalName: 'Castel Varo', foundedYear: 1947,
    history: [
      'Ocupada por la Unión Kharzi al final de la Guerra de los Estrechos, se convirtió en república popular en 1947.',
      'Industria pesada obsoleta y una creciente oposición sindical clandestina.'
    ],
    strengths: ['Industria pesada', 'Carbón propio', 'Población educada'],
    weaknesses: ['Tecnología atrasada', 'Legitimidad baja', 'Escasez de bienes de consumo'],
    aiProfile: 'socialist', religiosity: 0.5,
    laws: { prices: 'planned' }
  },
  {
    key: 'PRA', name: 'Pravetia', longName: 'República Socialista de Pravetia', adjective: 'praveto', culture: 'praveto', religion: 'camino',
    anchor: [0.31, 0.18], weight: 0.9, population: 11, gdpPerCapita: 4800, regime: 'one_party_state', archetype: 'socialist_agrarian',
    ideology: { econ: -0.9, welfare: 0.5, authority: 0.8, social: -0.1, nation: 0.2, central: 0.9 }, bloc: 'concordia', military: 1.0, techLevel: 0.4, institutions: 0.4,
    gini: 0.24, debt: 0.3, inflation: 0.06, stateShare: 0.9, openness: 0.2, color: '#c0603a', flag: f('tricolor_h', ['#f2f2f2', '#2a7f4f', '#c0603a'], 'wheel', '#e8c547'),
    currency: { name: 'kopek praveto', code: 'PRK', rate: 9 }, capitalName: 'Pravsk', foundedYear: 1946,
    history: [
      'Pequeña república agraria del noreste de Aurelia, aliada fiel de la Unión Kharzi.',
      'Su minoría praveta en Kharzun y su lengua emparentada la vinculan cultural y políticamente al este.'
    ],
    strengths: ['Autosuficiencia alimentaria', 'Lealtad del aparato estatal'],
    weaknesses: ['Economía estancada', 'Infraestructura vieja', 'Dependencia de Kharzun'],
    aiProfile: 'socialist', religiosity: 0.4,
    laws: { prices: 'planned' }
  },
  {
    key: 'RHE', name: 'Rheden', longName: 'Gran Ducado de Rheden', adjective: 'redense', culture: 'valdoriano', religion: 'reforma',
    anchor: [0.27, 0.25], weight: 0.4, population: 4.2, gdpPerCapita: 21000, regime: 'constitutional_monarchy', archetype: 'industrial',
    ideology: { econ: 0.4, welfare: 0.3, authority: -0.4, social: 0.1, nation: -0.3, central: 0.3 }, bloc: 'pacto', military: 0.6, techLevel: 0.85, institutions: 0.9,
    gini: 0.27, debt: 0.25, inflation: 0.025, stateShare: 0.1, openness: 0.85, color: '#5f8f4f', flag: f('tricolor_h', ['#5f8f4f', '#f2f2f2', '#1c2b4a']),
    currency: { name: 'florín de Rheden', code: 'RHF', rate: 2 }, capitalName: 'Rhedenburg', foundedYear: 1839,
    history: [
      'Gran ducado industrial de habla valdoriana que se negó a integrarse en la unificación de 1871.',
      'Es la frontera más expuesta del Pacto de Aurelia frente a Ardenza.'
    ],
    strengths: ['Acero y química', 'Economía muy abierta', 'Instituciones sólidas'],
    weaknesses: ['Territorio diminuto', 'Expuesto militarmente'],
    aiProfile: 'trader', religiosity: 0.3
  },
  // ============================================================== KHARZUN
  {
    key: 'KHA', name: 'Unión Kharzi', longName: 'Unión de Repúblicas Kharzi', adjective: 'kharzi', culture: 'kharzi', religion: 'camino',
    anchor: [0.67, 0.21], weight: 4.6, population: 168, gdpPerCapita: 6800, regime: 'one_party_state', archetype: 'military_industrial',
    ideology: { econ: -0.9, welfare: 0.5, authority: 0.8, social: -0.1, nation: 0.4, central: 0.9 }, bloc: 'concordia', military: 1.8, techLevel: 0.65, institutions: 0.4,
    gini: 0.27, debt: 0.3, inflation: 0.08, stateShare: 0.92, openness: 0.15, color: '#b23a48', flag: f('canton', ['#b23a48', '#e8c547'], 'star', '#e8c547'),
    currency: { name: 'rubal', code: 'KHR', rate: 0.9 }, capitalName: 'Zhelgrad', foundedYear: 1921,
    history: [
      'Nacida en 1921 de la revolución que derrocó al Imperio Kharzi; venció en la Guerra de los Estrechos y lidera la Concordia socialista.',
      'En 1990 su economía planificada está estancada; la dirigencia ensaya una apertura parcial mientras crecen los nacionalismos de Velsk y Ulmar.',
      'Disputa con Yarkhan la frontera oriental desde los choques de 1969.'
    ],
    strengths: ['Inmensas reservas de petróleo, gas y minerales', 'Arsenal y fuerzas armadas enormes', 'Industria pesada'],
    weaknesses: ['Economía planificada ineficiente', 'Minorías separatistas', 'Tecnología civil atrasada'],
    aiProfile: 'hegemon', religiosity: 0.3,
    laws: { prices: 'planned', unions: 'state', emigration: 'restricted', religion: 'atheist' }
  },
  {
    key: 'KOS', name: 'Kostrava', longName: 'República Popular de Kostrava', adjective: 'kostravo', culture: 'kostravo', religion: 'camino',
    anchor: [0.47, 0.21], weight: 1.1, population: 26, gdpPerCapita: 5200, regime: 'one_party_state', archetype: 'socialist_industrial',
    ideology: { econ: -0.7, welfare: 0.5, authority: 0.6, social: 0, nation: 0.3, central: 0.8 }, bloc: 'concordia', military: 1.1, techLevel: 0.45, institutions: 0.4,
    gini: 0.25, debt: 0.55, inflation: 0.14, stateShare: 0.85, openness: 0.25, color: '#cf6b4f', flag: f('tricolor_h', ['#cf6b4f', '#f2f2f2', '#2b4f8f']),
    currency: { name: 'zolta', code: 'KZL', rate: 30 }, capitalName: 'Ostrava Nova', foundedYear: 1945,
    history: [
      'Puerta occidental de Kharzun frente al mar de Aurelia; un sindicato independiente desafía al partido desde 1988.',
      'Su deuda externa con bancos aurelianos limita al gobierno.'
    ],
    strengths: ['Puertos', 'Carbón', 'Mano de obra industrial'],
    weaknesses: ['Deuda externa', 'Protestas obreras', 'Inflación'],
    aiProfile: 'socialist', religiosity: 0.6,
    laws: { prices: 'planned' }
  },
  {
    key: 'DRA', name: 'Dravosk', longName: 'República Socialista de Dravosk', adjective: 'dravosko', culture: 'dravo', religion: 'camino',
    anchor: [0.53, 0.27], weight: 1.1, population: 21, gdpPerCapita: 5900, regime: 'one_party_state', archetype: 'socialist_industrial',
    ideology: { econ: -0.8, welfare: 0.5, authority: 0.8, social: -0.2, nation: 0.4, central: 0.9 }, bloc: 'concordia', military: 1.3, techLevel: 0.5, institutions: 0.4,
    gini: 0.24, debt: 0.35, inflation: 0.07, stateShare: 0.9, openness: 0.2, color: '#9b4b6e', flag: f('bicolor_v', ['#9b4b6e', '#e8c547'], 'star', '#f2f2f2'),
    currency: { name: 'dravo', code: 'DRV', rate: 4.5 }, capitalName: 'Dravograd', foundedYear: 1948,
    history: [
      'Estado industrial modelo de la Concordia, con fábricas de maquinaria y blindados.',
      'Alberga una minoría tseremia en sus provincias montañosas.'
    ],
    strengths: ['Industria militar', 'Disciplina estatal'],
    weaknesses: ['Contaminación', 'Minoría descontenta', 'Escasa innovación'],
    aiProfile: 'socialist', religiosity: 0.35,
    laws: { prices: 'planned' }
  },
  {
    key: 'TSE', name: 'Tseremia', longName: 'República de Tseremia', adjective: 'tseremio', culture: 'tseremio', religion: 'camino',
    anchor: [0.59, 0.32], weight: 0.7, population: 8.3, gdpPerCapita: 3900, regime: 'one_party_state', archetype: 'mixed_developing',
    ideology: { econ: -0.4, welfare: 0.3, authority: 0.6, social: -0.3, nation: 0.6, central: 0.7 }, bloc: null, military: 1.0, techLevel: 0.35, institutions: 0.4,
    gini: 0.28, debt: 0.4, inflation: 0.1, stateShare: 0.7, openness: 0.25, color: '#6b8e4e', flag: f('chevron', ['#6b8e4e', '#f2f2f2', '#1c1c1c'], 'circle', '#e8c547'),
    currency: { name: 'leván', code: 'TSL', rate: 12 }, capitalName: 'Tserevan', foundedYear: 1958,
    history: [
      'Pueblo montañés que se separó del bloque kharzi en 1958 sin abandonar el socialismo, manteniendo una línea independiente.',
      'Controla los pasos de montaña entre Kharzun y la península de Solvara.'
    ],
    strengths: ['Geografía defensiva', 'Pasos estratégicos', 'Minerales'],
    weaknesses: ['Pobreza', 'Aislamiento'],
    aiProfile: 'defensive', religiosity: 0.55
  },
  {
    key: 'ULM', name: 'Ulmar', longName: 'Kanato de Ulmar', adjective: 'ulmarí', culture: 'ulmari', religion: 'ancestral',
    anchor: [0.67, 0.34], weight: 0.9, population: 4.1, gdpPerCapita: 2600, regime: 'absolute_monarchy', archetype: 'resource_exporter',
    ideology: { econ: 0, welfare: -0.2, authority: 0.8, social: -0.6, nation: 0.6, central: 0.7 }, bloc: null, military: 0.8, techLevel: 0.25, institutions: 0.3,
    gini: 0.4, debt: 0.2, inflation: 0.08, stateShare: 0.5, openness: 0.3, color: '#4f8fbf', flag: f('disc', ['#4f8fbf', '#e8c547'], 'sun', '#e8c547'),
    currency: { name: 'som ulmarí', code: 'ULS', rate: 18 }, capitalName: 'Ordu Khan', foundedYear: 1611,
    history: [
      'Último kanato de las estepas, Estado tapón aceptado por la Unión Kharzi a cambio de neutralidad.',
      'Hay ulmaríes en las provincias kharzi vecinas que sueñan con la unificación.'
    ],
    strengths: ['Minería y ganadería', 'Neutralidad tolerada'],
    weaknesses: ['Instituciones débiles', 'Sin salida al mar', 'Ejército pequeño'],
    aiProfile: 'defensive', religiosity: 0.7
  },
  {
    key: 'ZEN', name: 'Zemiria del Norte', longName: 'República Democrática Popular de Zemiria', adjective: 'norzemirio', culture: 'zemirio', religion: 'cuatro_lunas',
    anchor: [0.87, 0.2], weight: 0.9, population: 19, gdpPerCapita: 2700, regime: 'one_party_state', archetype: 'military_industrial',
    ideology: { econ: -1, welfare: 0.3, authority: 1, social: -0.3, nation: 0.9, central: 1 }, bloc: 'concordia', military: 2.6, techLevel: 0.35, institutions: 0.3,
    gini: 0.3, debt: 0.4, inflation: 0.05, stateShare: 0.97, openness: 0.05, color: '#8a2be2', flag: f('bordered', ['#c23b3b', '#1f3d7a'], 'star', '#c23b3b'),
    currency: { name: 'won popular', code: 'ZNW', rate: 2.2 }, capitalName: 'Pyeonhan', foundedYear: 1949,
    history: [
      'Surgida de la partición de Zemiria tras la Guerra de los Estrechos; régimen hermético y militarizado.',
      'Reclama la totalidad de la península zemiria y nunca firmó la paz con el sur, solo un armisticio.'
    ],
    strengths: ['Ejército enorme', 'Movilización total', 'Fortificaciones'],
    weaknesses: ['Economía empobrecida', 'Aislamiento', 'Escasez de alimentos'],
    aiProfile: 'aggressive', religiosity: 0.2,
    laws: { prices: 'planned', conscription: 'total', press: 'state', speech: 'censored', assembly: 'banned', police: 'police_state', emigration: 'banned', intelligence: 'political', trade: 'autarky' }
  },
  {
    key: 'ZES', name: 'Zemiria del Sur', longName: 'República de Zemiria', adjective: 'surzemirio', culture: 'zemirio', religion: 'cuatro_lunas',
    anchor: [0.87, 0.32], weight: 0.8, population: 42, gdpPerCapita: 6900, regime: 'presidential_republic', archetype: 'emerging_industrial',
    ideology: { econ: 0.4, welfare: 0, authority: 0.3, social: -0.3, nation: 0.6, central: 0.8 }, bloc: 'pacto', military: 1.5, techLevel: 0.6, institutions: 0.55,
    gini: 0.34, debt: 0.2, inflation: 0.07, stateShare: 0.2, openness: 0.6, color: '#2f7fc1', flag: f('disc', ['#f2f2f2', '#c23b3b'], 'circle', '#1f3d7a'),
    currency: { name: 'won', code: 'ZSW', rate: 700 }, capitalName: 'Hanseong', foundedYear: 1949,
    history: [
      'Tras décadas de gobiernos militares, celebró en 1987 sus primeras elecciones libres.',
      'Su industria exportadora crece a ritmo vertiginoso bajo la protección del Pacto de Aurelia.'
    ],
    strengths: ['Industria exportadora dinámica', 'Alto ahorro', 'Educación'],
    weaknesses: ['Amenaza del norte', 'Sin recursos energéticos', 'Democracia joven'],
    aiProfile: 'trader', religiosity: 0.4
  },
  {
    key: 'YAR', name: 'Yarkhan', longName: 'República de Yarkhan', adjective: 'yarkhaní', culture: 'yarkhani', religion: 'ancestral',
    anchor: [0.77, 0.32], weight: 1.6, population: 138, gdpPerCapita: 950, regime: 'presidential_republic', archetype: 'agrarian',
    ideology: { econ: -0.2, welfare: 0.3, authority: 0.3, social: -0.5, nation: 0.6, central: 0.6 }, bloc: null, military: 1.0, techLevel: 0.3, institutions: 0.35,
    gini: 0.38, debt: 0.45, inflation: 0.12, stateShare: 0.45, openness: 0.15, color: '#d9a23b', flag: f('tricolor_h', ['#d9a23b', '#f2f2f2', '#2a7f4f'], 'wheel', '#1f3d7a'),
    currency: { name: 'rupán', code: 'YKR', rate: 17 }, capitalName: 'Yarkand', foundedYear: 1947,
    history: [
      'Antigua civilización de los valles fluviales del este, independiente en 1947 y líder del movimiento de no alineados.',
      'Población inmensa y joven, mayoritariamente rural y pobre, con un Estado que planifica la industria.',
      'Los choques fronterizos de 1969 con la Unión Kharzi dejaron una frontera disputada.'
    ],
    strengths: ['Población enorme y joven', 'Tierras fértiles', 'Mercado interno'],
    weaknesses: ['Pobreza masiva', 'Burocracia', 'Infraestructura insuficiente'],
    aiProfile: 'developmental', religiosity: 0.8
  },
  {
    key: 'TAV', name: 'Tavrin', longName: 'República de Tavrin', adjective: 'tavrino', culture: 'tavrino', religion: 'camino',
    anchor: [0.5, 0.35], weight: 0.6, population: 9, gdpPerCapita: 4300, regime: 'presidential_republic', archetype: 'mixed_developing',
    ideology: { econ: 0.1, welfare: 0.2, authority: 0.2, social: -0.2, nation: 0.4, central: 0.6 }, bloc: null, military: 0.9, techLevel: 0.4, institutions: 0.45,
    gini: 0.35, debt: 0.5, inflation: 0.18, stateShare: 0.4, openness: 0.45, color: '#3fa37a', flag: f('diagonal', ['#3fa37a', '#f2f2f2', '#c23b3b']),
    currency: { name: 'lev tavrino', code: 'TVL', rate: 40 }, capitalName: 'Tavrinopol', foundedYear: 1918,
    history: [
      'Pequeña república del istmo de Qeddah, bisagra entre Kharzun y Solvara, neutral por necesidad.',
      'Cobra peajes por los oleoductos que cruzan su territorio.'
    ],
    strengths: ['Posición de tránsito', 'Oleoductos'],
    weaknesses: ['Inflación', 'Vecinos poderosos'],
    aiProfile: 'balanced', religiosity: 0.5
  },
  {
    key: 'SAI', name: 'Sairan', longName: 'Estado de Sairan', adjective: 'sairaní', culture: 'sairani', religion: 'cuatro_lunas',
    anchor: [0.83, 0.13], weight: 0.5, population: 5.5, gdpPerCapita: 3600, regime: 'military_junta', archetype: 'resource_exporter',
    ideology: { econ: 0.3, welfare: -0.2, authority: 0.9, social: -0.4, nation: 0.7, central: 0.9 }, bloc: null, military: 1.3, techLevel: 0.3, institutions: 0.3,
    gini: 0.45, debt: 0.6, inflation: 0.2, stateShare: 0.4, openness: 0.4, color: '#7a6a3a', flag: f('bicolor_h', ['#1f3d7a', '#7a6a3a'], 'stars3', '#f2f2f2'),
    currency: { name: 'sen sairaní', code: 'SRS', rate: 26 }, capitalName: 'Kaimon', foundedYear: 1952,
    history: [
      'Península boscosa del noreste, gobernada por una junta militar desde el golpe de 1978.',
      'Exporta madera, pescado y minerales a Ostria.'
    ],
    strengths: ['Madera y pesca', 'Minerales'],
    weaknesses: ['Régimen ilegítimo', 'Deuda', 'Corrupción'],
    aiProfile: 'nationalist', religiosity: 0.45,
    laws: { press: 'licensed', speech: 'restricted', police: 'extensive' }
  },
  // ============================================================== SOLVARA
  {
    key: 'ZAH', name: 'Zahrabad', longName: 'Emirato de Zahrabad', adjective: 'zahrabadí', culture: 'solvari', religion: 'fe_solar',
    anchor: [0.52, 0.42], weight: 0.35, population: 3.1, gdpPerCapita: 15500, regime: 'absolute_monarchy', archetype: 'petrostate',
    ideology: { econ: 0.2, welfare: 0.4, authority: 0.9, social: -0.8, nation: 0.4, central: 1 }, bloc: null, military: 0.5, techLevel: 0.3, institutions: 0.25,
    gini: 0.48, debt: 0.05, inflation: 0.03, stateShare: 0.7, openness: 0.7, color: '#2f9e6a', flag: f('canton', ['#2f9e6a', '#f2f2f2'], 'moon', '#f2f2f2'),
    currency: { name: 'dirán', code: 'ZHD', rate: 3.7 }, capitalName: 'Qasr Zahra', foundedYear: 1961,
    history: [
      'Protectorado castreno hasta 1961, el emirato descubrió en 1957 uno de los mayores campos petroleros de Vereth.',
      'Su población es pequeña; gran parte de la mano de obra es extranjera y no tiene derechos políticos.'
    ],
    strengths: ['Enormes reservas de petróleo', 'Fondo soberano', 'Sin deuda'],
    weaknesses: ['Instituciones débiles', 'Fuerzas armadas pequeñas', 'Economía no diversificada', 'Vecinos codiciosos'],
    aiProfile: 'rentier', religiosity: 0.8,
    laws: { religion: 'official', press: 'state', speech: 'restricted', immigration: 'selective' }
  },
  {
    key: 'TAZ', name: 'Tazir', longName: 'Sultanato de Tazir', adjective: 'tazirí', culture: 'solvari', religion: 'fe_solar',
    anchor: [0.47, 0.46], weight: 1.1, population: 15, gdpPerCapita: 7400, regime: 'absolute_monarchy', archetype: 'petrostate',
    ideology: { econ: 0.1, welfare: 0.3, authority: 0.9, social: -0.9, nation: 0.5, central: 1 }, bloc: null, military: 1.3, techLevel: 0.35, institutions: 0.35,
    gini: 0.44, debt: 0.15, inflation: 0.04, stateShare: 0.65, openness: 0.5, color: '#1f7a4a', flag: f('bicolor_v', ['#f2f2f2', '#1f7a4a'], 'sun', '#e8c547'),
    currency: { name: 'qasri', code: 'TZQ', rate: 3.75 }, capitalName: 'Mar Tazir', foundedYear: 1744,
    history: [
      'Dinastía solar que gobierna el corazón del desierto desde 1744, custodia de los santuarios de la Fe Solar.',
      'El petróleo financia un enorme gasto social y militar; el sultán compra armamento valdoriano.',
      'Disputa con Nemur el reparto de las aguas del río Nemur.'
    ],
    strengths: ['Petróleo', 'Autoridad religiosa', 'Gasto militar elevado'],
    weaknesses: ['Dependencia del crudo', 'Sociedad cerrada', 'Desempleo juvenil'],
    aiProfile: 'rentier', religiosity: 0.9,
    laws: { religion: 'theocratic', press: 'state', speech: 'censored', assembly: 'banned', socialPolicy: 'traditional' }
  },
  {
    key: 'NEM', name: 'Nemur', longName: 'República Árida de Nemur', adjective: 'nemurí', culture: 'nemuri', religion: 'fe_solar',
    anchor: [0.42, 0.54], weight: 1.0, population: 52, gdpPerCapita: 1700, regime: 'military_junta', archetype: 'mixed_developing',
    ideology: { econ: -0.2, welfare: 0.2, authority: 0.8, social: -0.4, nation: 0.6, central: 0.9 }, bloc: null, military: 1.4, techLevel: 0.3, institutions: 0.35,
    gini: 0.33, debt: 0.9, inflation: 0.21, stateShare: 0.55, openness: 0.3, color: '#c79a4a', flag: f('tricolor_h', ['#c23b3b', '#f2f2f2', '#1c1c1c'], 'tower', '#c79a4a'),
    currency: { name: 'libra nemurí', code: 'NML', rate: 3.1 }, capitalName: 'Nemur al-Kubra', foundedYear: 1952,
    history: [
      'Civilización milenaria a orillas del gran río navegable Nemur; un golpe de oficiales nacionalistas derrocó a la monarquía en 1952.',
      'Su población crece rápido y la deuda externa ahoga al presupuesto.'
    ],
    strengths: ['Río navegable y tierras fértiles', 'Ejército numeroso', 'Canal comercial'],
    weaknesses: ['Deuda externa enorme', 'Pobreza', 'Dependencia de ayuda exterior'],
    aiProfile: 'nationalist', religiosity: 0.85
  },
  {
    key: 'KES', name: 'Kesh', longName: 'República Democrática de Kesh', adjective: 'keshí', culture: 'solvari', religion: 'fe_solar',
    anchor: [0.48, 0.52], weight: 0.6, population: 11, gdpPerCapita: 3900, regime: 'one_party_state', archetype: 'petrostate',
    ideology: { econ: -0.7, welfare: 0.4, authority: 0.8, social: 0.2, nation: 0.6, central: 0.9 }, bloc: 'concordia', military: 1.5, techLevel: 0.3, institutions: 0.3,
    gini: 0.35, debt: 0.5, inflation: 0.15, stateShare: 0.85, openness: 0.3, color: '#bf3f3f', flag: f('tricolor_h', ['#bf3f3f', '#f2f2f2', '#1c1c1c'], 'star', '#2f9e6a'),
    currency: { name: 'dinar keshí', code: 'KSD', rate: 0.3 }, capitalName: 'Kesh-Ammar', foundedYear: 1958,
    history: [
      'Revolución socialista y laica de 1958 que nacionalizó el petróleo y se alineó con la Unión Kharzi.',
      'Rival ideológico de Ourabad y de las monarquías del desierto; reclama campos petroleros fronterizos de Zahrabad.'
    ],
    strengths: ['Petróleo nacionalizado', 'Ejército entrenado por Kharzun'],
    weaknesses: ['Aislamiento', 'Represión', 'Mala gestión'],
    aiProfile: 'aggressive', religiosity: 0.5,
    laws: { religion: 'secular', press: 'state', police: 'police_state', intelligence: 'political' }
  },
  {
    key: 'OUR', name: 'Ourabad', longName: 'Dominio Sacerdotal de Ourabad', adjective: 'ourabadí', culture: 'ourabadi', religion: 'fe_solar',
    anchor: [0.41, 0.45], weight: 0.9, population: 34, gdpPerCapita: 2600, regime: 'theocracy', archetype: 'mixed_developing',
    ideology: { econ: -0.1, welfare: 0.4, authority: 0.9, social: -1, nation: 0.7, central: 0.9 }, bloc: null, military: 1.4, techLevel: 0.35, institutions: 0.4,
    gini: 0.4, debt: 0.3, inflation: 0.25, stateShare: 0.6, openness: 0.2, color: '#1f6f5f', flag: f('bordered', ['#1f6f5f', '#f2f2f2'], 'sun', '#c23b3b'),
    currency: { name: 'tumán', code: 'OTM', rate: 70 }, capitalName: 'Ourabad', foundedYear: 1979,
    history: [
      'La revolución sacerdotal de 1979 derrocó al rey y estableció un gobierno de clérigos de la Fe Solar.',
      'Exporta su revolución y choca con Kesh, laico y socialista.'
    ],
    strengths: ['Movilización ideológica', 'Población grande', 'Algo de petróleo'],
    weaknesses: ['Sanciones de facto', 'Inflación', 'Aislamiento tecnológico'],
    aiProfile: 'ideological', religiosity: 0.95,
    laws: { religion: 'theocratic', press: 'state', speech: 'censored', socialPolicy: 'traditional', police: 'extensive' }
  },
  {
    key: 'SAH', name: 'Sahrin', longName: 'República de Sahrin', adjective: 'sahriní', culture: 'nemuri', religion: 'fe_solar',
    anchor: [0.43, 0.62], weight: 0.7, population: 10, gdpPerCapita: 2100, regime: 'presidential_republic', archetype: 'resource_exporter',
    ideology: { econ: 0, welfare: 0.2, authority: 0.5, social: -0.4, nation: 0.4, central: 0.8 }, bloc: null, military: 0.8, techLevel: 0.3, institutions: 0.4,
    gini: 0.38, debt: 0.55, inflation: 0.09, stateShare: 0.5, openness: 0.4, color: '#b08b5a', flag: f('chevron', ['#2f9e6a', '#f2f2f2', '#c23b3b'], 'moon', '#f2f2f2'),
    currency: { name: 'sahel', code: 'SHS', rate: 9 }, capitalName: 'Sahrun', foundedYear: 1960,
    history: [
      'Antigua colonia castrena del sur de Solvara, vive de la minería de fosfatos y del comercio caravanero.',
      'Un presidente vitalicio gobierna con elecciones poco competitivas.'
    ],
    strengths: ['Minería', 'Relaciones con Aurelia'],
    weaknesses: ['Desierto', 'Corrupción', 'Dependencia de un solo producto'],
    aiProfile: 'balanced', religiosity: 0.8
  },
  {
    key: 'ILH', name: 'Port Ilhan', longName: 'Ciudad-Estado de Port Ilhan', adjective: 'ilhaní', culture: 'solvari', religion: 'fe_solar',
    anchor: [0.495, 0.585], weight: 0.15, population: 1.6, gdpPerCapita: 16500, regime: 'constitutional_monarchy', archetype: 'services_finance',
    ideology: { econ: 0.8, welfare: -0.2, authority: 0.4, social: -0.2, nation: 0, central: 1 }, bloc: null, military: 0.5, techLevel: 0.55, institutions: 0.7,
    gini: 0.42, debt: 0.1, inflation: 0.03, stateShare: 0.2, openness: 0.95, color: '#36a3c9', flag: f('bicolor_h', ['#36a3c9', '#f2f2f2'], 'diamond', '#e8c547'),
    currency: { name: 'riyal ilhaní', code: 'PIR', rate: 3.67 }, capitalName: 'Port Ilhan', foundedYear: 1971,
    history: [
      'Puerto franco y plaza financiera del mar central, independiente de Castrenia en 1971.',
      'Su prosperidad depende del comercio marítimo y de la estabilidad de sus vecinos.'
    ],
    strengths: ['Puerto franco', 'Finanzas', 'Economía abierta'],
    weaknesses: ['Indefendible', 'Sin recursos', 'Dependencia total del comercio'],
    aiProfile: 'trader', religiosity: 0.6
  },
  // ============================================================== MERIDIA
  {
    key: 'TEC', name: 'Tecualpa', longName: 'Estados Unidos de Tecualpa', adjective: 'tecualpense', culture: 'meridiano', religion: 'primacia',
    anchor: [0.21, 0.66], weight: 2.8, population: 96, gdpPerCapita: 4400, regime: 'presidential_republic', archetype: 'emerging_industrial',
    ideology: { econ: -0.1, welfare: 0.4, authority: 0.1, social: -0.2, nation: 0.4, central: -0.3 }, bloc: null, military: 0.8, techLevel: 0.45, institutions: 0.45,
    gini: 0.55, debt: 0.65, inflation: 0.85, stateShare: 0.4, openness: 0.25, color: '#2e9e4f', flag: f('disc', ['#2e9e4f', '#e8c547'], 'stars3', '#1f3d7a'),
    currency: { name: 'cruzeiro tecualpense', code: 'TCZ', rate: 25 }, capitalName: 'Ciudad de Tecualpa', foundedYear: 1822,
    history: [
      'La mayor de las antiguas colonias castrenas, federación independiente desde 1822.',
      'Tras dos décadas de régimen militar volvió a la democracia en 1985, pero arrastra hiperinflación, deuda externa y una desigualdad extrema.',
      'Disputa con Yaruvia el desierto de Atamar desde la guerra de 1879.'
    ],
    strengths: ['Recursos agrícolas y mineros enormes', 'Industria diversificada', 'Mercado interno grande'],
    weaknesses: ['Inflación muy alta', 'Deuda externa', 'Desigualdad extrema'],
    aiProfile: 'developmental', religiosity: 0.7
  },
  {
    key: 'YRV', name: 'Yaruvia', longName: 'República de Yaruvia', adjective: 'yaruviano', culture: 'andino', religion: 'primacia',
    anchor: [0.15, 0.76], weight: 1.1, population: 13, gdpPerCapita: 3300, regime: 'military_junta', archetype: 'resource_exporter',
    ideology: { econ: 0.8, welfare: -0.5, authority: 0.9, social: -0.6, nation: 0.6, central: 0.9 }, bloc: null, military: 1.3, techLevel: 0.4, institutions: 0.5,
    gini: 0.5, debt: 0.45, inflation: 0.2, stateShare: 0.3, openness: 0.6, color: '#c43b3b', flag: f('canton', ['#f2f2f2', '#c43b3b'], 'star', '#f2f2f2'),
    currency: { name: 'cóndor', code: 'YRC', rate: 300 }, capitalName: 'San Ildefonso', foundedYear: 1818,
    history: [
      'Gobernada por una junta militar desde 1973 que aplicó reformas de libre mercado radicales.',
      'Un plebiscito en 1988 obligó a la junta a prometer una transición; el cobre de la cordillera es su gran riqueza.'
    ],
    strengths: ['Cobre y minerales', 'Economía abierta', 'Ejército profesional'],
    weaknesses: ['Régimen en transición', 'Desigualdad', 'Rivalidad con Tecualpa'],
    aiProfile: 'nationalist', religiosity: 0.6,
    laws: { regulation: 'minimal', trade: 'free', capitalControls: 'free', unions: 'restricted', press: 'licensed', minimumWage: 'low', healthcare: 'insurance', centralBank: 'independent' }
  },
  {
    key: 'CUA', name: 'Cuantel', longName: 'República de Cuantel', adjective: 'cuantelense', culture: 'meridiano', religion: 'primacia',
    anchor: [0.27, 0.58], weight: 0.8, population: 14, gdpPerCapita: 2300, regime: 'presidential_republic', archetype: 'agrarian',
    ideology: { econ: 0.2, welfare: 0, authority: 0.3, social: -0.4, nation: 0.3, central: 0.7 }, bloc: null, military: 0.8, techLevel: 0.3, institutions: 0.35,
    gini: 0.52, debt: 0.7, inflation: 0.3, stateShare: 0.3, openness: 0.45, color: '#3b7fc4', flag: f('tricolor_h', ['#3b7fc4', '#f2f2f2', '#3b7fc4'], 'circle', '#2e9e4f'),
    currency: { name: 'colón', code: 'CUC', rate: 5 }, capitalName: 'San Benito', foundedYear: 1823,
    history: [
      'República cacaotera de la costa norte de Meridia; una guerrilla rural opera en sus selvas desde 1980.',
      'Las grandes plantaciones concentran la tierra y el poder político.'
    ],
    strengths: ['Exportaciones agrícolas', 'Puertos'],
    weaknesses: ['Insurgencia', 'Desigualdad', 'Deuda'],
    aiProfile: 'balanced', religiosity: 0.8
  },
  {
    key: 'TAM', name: 'Tamarú', longName: 'República Revolucionaria de Tamarú', adjective: 'tamaruano', culture: 'andino', religion: 'ancestral',
    anchor: [0.19, 0.555], weight: 0.6, population: 7, gdpPerCapita: 1900, regime: 'one_party_state', archetype: 'socialist_agrarian',
    ideology: { econ: -0.9, welfare: 0.7, authority: 0.7, social: 0.2, nation: 0.6, central: 0.8 }, bloc: 'concordia', military: 1.5, techLevel: 0.3, institutions: 0.35,
    gini: 0.3, debt: 0.6, inflation: 0.1, stateShare: 0.9, openness: 0.2, color: '#d14b4b', flag: f('diagonal', ['#d14b4b', '#1c1c1c', '#e8c547'], 'star', '#f2f2f2'),
    currency: { name: 'sol revolucionario', code: 'TMS', rate: 1 }, capitalName: 'Villa Libertad', foundedYear: 1825,
    history: [
      'Una revolución campesina en 1979 llevó al poder a un frente socialista apoyado por la Unión Kharzi.',
      'Alfabetización y salud gratuitas conviven con escasez y una economía dependiente de los subsidios kharzi.'
    ],
    strengths: ['Educación y salud públicas', 'Milicias movilizadas'],
    weaknesses: ['Dependencia de Kharzun', 'Bloqueo de sus vecinos', 'Economía frágil'],
    aiProfile: 'socialist', religiosity: 0.5,
    laws: { prices: 'planned', healthcare: 'universal', education: 'universal', university: 'free' }
  },
  {
    key: 'ORU', name: 'Oruaque', longName: 'República de Oruaque', adjective: 'oruaqueño', culture: 'oruaqueno', religion: 'primacia',
    anchor: [0.29, 0.645], weight: 1.0, population: 19, gdpPerCapita: 3800, regime: 'presidential_republic', archetype: 'petrostate',
    ideology: { econ: -0.2, welfare: 0.5, authority: 0.2, social: -0.2, nation: 0.5, central: 0.7 }, bloc: null, military: 0.8, techLevel: 0.35, institutions: 0.35,
    gini: 0.47, debt: 0.55, inflation: 0.35, stateShare: 0.55, openness: 0.4, color: '#e0b43a', flag: f('tricolor_h', ['#e0b43a', '#1f3d7a', '#c23b3b'], 'stars3', '#f2f2f2'),
    currency: { name: 'bolívar oruaqueño', code: 'ORB', rate: 40 }, capitalName: 'Santa Ana del Oruaque', foundedYear: 1830,
    history: [
      'Democracia petrolera que nacionalizó el crudo de su selva oriental en 1976.',
      'La caída de los precios del petróleo en los ochenta provocó un estallido social en 1989.'
    ],
    strengths: ['Petróleo', 'Democracia estable hasta ahora'],
    weaknesses: ['Dependencia del crudo', 'Corrupción', 'Malestar social'],
    aiProfile: 'rentier', religiosity: 0.7
  },
  {
    key: 'PEL', name: 'Pelagua', longName: 'República de Pelagua', adjective: 'pelagüense', culture: 'meridiano', religion: 'primacia',
    anchor: [0.12, 0.6], weight: 0.45, population: 4.4, gdpPerCapita: 1600, regime: 'presidential_republic', archetype: 'agrarian',
    ideology: { econ: 0.2, welfare: 0, authority: 0.4, social: -0.5, nation: 0.3, central: 0.8 }, bloc: null, military: 0.7, techLevel: 0.25, institutions: 0.3,
    gini: 0.5, debt: 0.5, inflation: 0.25, stateShare: 0.3, openness: 0.4, color: '#5aa0c9', flag: f('bicolor_h', ['#5aa0c9', '#f2f2f2'], 'sun', '#e8c547'),
    currency: { name: 'guaraní pelagüense', code: 'PLG', rate: 1200 }, capitalName: 'Asunción del Mar', foundedYear: 1811,
    history: ['Pequeña república ganadera de la costa occidental, gobernada por el mismo partido conservador desde 1954.'],
    strengths: ['Ganadería', 'Hidroelectricidad'],
    weaknesses: ['Pobreza', 'Clientelismo'],
    aiProfile: 'balanced', religiosity: 0.85
  },
  {
    key: 'IRI', name: 'Iriquá', longName: 'República Federativa de Iriquá', adjective: 'iriquaense', culture: 'meridiano', religion: 'primacia',
    anchor: [0.25, 0.75], weight: 1.1, population: 31, gdpPerCapita: 3500, regime: 'presidential_republic', archetype: 'mixed_developing',
    ideology: { econ: 0.2, welfare: 0.3, authority: -0.1, social: 0, nation: 0.2, central: 0 }, bloc: null, military: 0.7, techLevel: 0.4, institutions: 0.5,
    gini: 0.48, debt: 0.6, inflation: 0.6, stateShare: 0.35, openness: 0.35, color: '#4fb0a0', flag: f('quartered', ['#4fb0a0', '#f2f2f2'], 'none'),
    currency: { name: 'austral', code: 'IRA', rate: 600 }, capitalName: 'Puerto Iriquá', foundedYear: 1816,
    history: [
      'Federación de pampas y ríos navegables, gran exportadora de granos y carne.',
      'Recuperó la democracia en 1983 tras una dictadura; la hiperinflación de 1989 hundió al gobierno anterior.'
    ],
    strengths: ['Tierras fértiles', 'Ríos navegables', 'Población educada'],
    weaknesses: ['Hiperinflación reciente', 'Deuda', 'Inestabilidad cambiaria'],
    aiProfile: 'developmental', religiosity: 0.6
  },
  {
    key: 'VEN', name: 'Ventaria', longName: 'República de Ventaria', adjective: 'ventariano', culture: 'meridiano', religion: 'primacia',
    anchor: [0.34, 0.7], weight: 0.5, population: 5.2, gdpPerCapita: 5200, regime: 'parliamentary_democracy', archetype: 'tourism_islands',
    ideology: { econ: 0.3, welfare: 0.4, authority: -0.4, social: 0.2, nation: -0.1, central: 0.4 }, bloc: null, military: 0.3, techLevel: 0.45, institutions: 0.65,
    gini: 0.4, debt: 0.4, inflation: 0.08, stateShare: 0.25, openness: 0.65, color: '#2fb3b3', flag: f('bordered', ['#2fb3b3', '#f2f2f2'], 'sun', '#e0b43a'),
    currency: { name: 'colón ventariano', code: 'VNC', rate: 80 }, capitalName: 'Coralia', foundedYear: 1838,
    history: ['Democracia estable de la costa oriental de Meridia que abolió su ejército en 1949 y vive del turismo y el comercio.'],
    strengths: ['Estabilidad democrática', 'Turismo', 'Educación'],
    weaknesses: ['Sin ejército significativo', 'Economía pequeña'],
    aiProfile: 'pacifist', religiosity: 0.6
  },
  {
    key: 'AUS', name: 'Austrinia', longName: 'Mancomunidad de Austrinia', adjective: 'austrino', culture: 'austrino', religion: 'reforma',
    anchor: [0.28, 0.85], weight: 1.2, population: 12, gdpPerCapita: 15800, regime: 'constitutional_monarchy', archetype: 'resource_exporter',
    ideology: { econ: 0.5, welfare: 0.3, authority: -0.4, social: 0.2, nation: 0, central: -0.3 }, bloc: 'pacto', military: 0.8, techLevel: 0.75, institutions: 0.85,
    gini: 0.32, debt: 0.3, inflation: 0.06, stateShare: 0.15, openness: 0.55, color: '#3a5f9f', flag: f('canton', ['#3a5f9f', '#c23b3b'], 'stars3', '#f2f2f2'),
    currency: { name: 'libra austrina', code: 'AUL', rate: 1.3 }, capitalName: 'Port Halden', foundedYear: 1901,
    history: [
      'Colonia de poblamiento valdoriana y strandholmesa en el frío sur de Meridia; dominio autónomo desde 1901.',
      'Ganadería ovina, minería y cereales le dan un nivel de vida aureliano lejos de Aurelia.'
    ],
    strengths: ['Recursos abundantes', 'Instituciones sólidas', 'Aislamiento seguro'],
    weaknesses: ['Lejanía de mercados', 'Población pequeña'],
    aiProfile: 'trader', religiosity: 0.4
  },
  {
    key: 'QUI', name: 'Quitzal', longName: 'Estado Plurinacional de Quitzal', adjective: 'quitzalteco', culture: 'andino', religion: 'ancestral',
    anchor: [0.15, 0.67], weight: 0.8, population: 8.5, gdpPerCapita: 1300, regime: 'presidential_republic', archetype: 'resource_exporter',
    ideology: { econ: -0.3, welfare: 0.4, authority: 0.2, social: -0.2, nation: 0.5, central: 0.3 }, bloc: null, military: 0.7, techLevel: 0.25, institutions: 0.3,
    gini: 0.52, debt: 0.75, inflation: 0.4, stateShare: 0.5, openness: 0.35, color: '#9a6a3a', flag: f('tricolor_h', ['#c23b3b', '#e8c547', '#2e9e4f']),
    currency: { name: 'boliviano', code: 'QZB', rate: 2.8 }, capitalName: 'Altamarca', foundedYear: 1825,
    history: ['Altiplano andino sin salida al mar desde que perdió su costa ante Yaruvia en 1879; minería de estaño y plata, mayoría indígena empobrecida.'],
    strengths: ['Minerales', 'Gas en las tierras bajas'],
    weaknesses: ['Sin salida al mar', 'Pobreza', 'Inestabilidad crónica'],
    aiProfile: 'nationalist', religiosity: 0.8
  },
  // ============================================================== OSTRIA
  {
    key: 'TEN', name: 'Tenmura', longName: 'Estado de Tenmura', adjective: 'tenmurano', culture: 'ostrio', religion: 'cuatro_lunas',
    anchor: [0.79, 0.66], weight: 1.6, population: 84, gdpPerCapita: 18500, regime: 'parliamentary_democracy', archetype: 'industrial',
    ideology: { econ: 0.4, welfare: 0.1, authority: 0, social: -0.4, nation: 0.4, central: 0.7 }, bloc: 'pacto', military: 0.6, techLevel: 0.95, institutions: 0.8,
    gini: 0.28, debt: 0.65, inflation: 0.02, stateShare: 0.1, openness: 0.5, color: '#e05a6a', flag: f('disc', ['#f2f2f2', '#e05a6a'], 'none'),
    currency: { name: 'ryo', code: 'TNR', rate: 140 }, capitalName: 'Kaimura', foundedYear: 660,
    history: [
      'Antiguo imperio insular que se industrializó a marchas forzadas en el siglo XIX.',
      'Tras su derrota en la Guerra de los Estrechos renunció a la guerra ofensiva y se convirtió en la segunda economía del mundo exportando electrónica y automóviles.',
      'Una burbuja inmobiliaria y bursátil alcanza su punto máximo en 1989.'
    ],
    strengths: ['Tecnología puntera', 'Industria exportadora', 'Alto ahorro'],
    weaknesses: ['Sin recursos naturales', 'Burbuja de activos', 'Población que envejece'],
    aiProfile: 'trader', religiosity: 0.3,
    laws: { defensePolicy: 'neutrality', conscription: 'volunteer' }
  },
  {
    key: 'KOV', name: 'Kovalla', longName: 'República de Kovalla', adjective: 'kovallano', culture: 'kovallano', religion: 'cuatro_lunas',
    anchor: [0.73, 0.72], weight: 0.9, population: 24, gdpPerCapita: 2400, regime: 'presidential_republic', archetype: 'agrarian',
    ideology: { econ: 0.1, welfare: 0.1, authority: 0.5, social: -0.4, nation: 0.6, central: 0.8 }, bloc: null, military: 1.1, techLevel: 0.35, institutions: 0.35,
    gini: 0.42, debt: 0.55, inflation: 0.12, stateShare: 0.35, openness: 0.45, color: '#5ca35c', flag: f('chevron', ['#c23b3b', '#f2f2f2', '#1f3d7a'], 'sun', '#e8c547'),
    currency: { name: 'peso kovallano', code: 'KVP', rate: 22 }, capitalName: 'Lunaria', foundedYear: 1946,
    history: [
      'Ex colonia tenmurana que se independizó en 1946; arroz, azúcar y una élite terrateniente dominan el país.',
      'Reclama las islas del estrecho que Tenmura conservó tras la descolonización.'
    ],
    strengths: ['Agricultura tropical', 'Mano de obra barata'],
    weaknesses: ['Corrupción', 'Insurgencia comunista', 'Infraestructura pobre'],
    aiProfile: 'nationalist', religiosity: 0.75
  },
  {
    key: 'RYS', name: 'Ryssa', longName: 'Reino de Ryssa', adjective: 'ryssano', culture: 'ryssano', religion: 'cuatro_lunas',
    anchor: [0.87, 0.6], weight: 0.6, population: 9, gdpPerCapita: 3800, regime: 'constitutional_monarchy', archetype: 'resource_exporter',
    ideology: { econ: 0.3, welfare: 0, authority: 0.4, social: -0.5, nation: 0.4, central: 0.7 }, bloc: null, military: 0.9, techLevel: 0.4, institutions: 0.5,
    gini: 0.43, debt: 0.35, inflation: 0.06, stateShare: 0.3, openness: 0.55, color: '#4a6fb0', flag: f('tricolor_h', ['#c23b3b', '#f2f2f2', '#4a6fb0'], 'none'),
    currency: { name: 'baht ryssano', code: 'RYB', rate: 25 }, capitalName: 'Ryssaburi', foundedYear: 1350,
    history: ['Reino que nunca fue colonizado, con un monarca venerado y frecuentes golpes militares; estaño, caucho y arroz.'],
    strengths: ['Estabilidad monárquica', 'Recursos naturales'],
    weaknesses: ['Golpismo militar', 'Desigualdad regional'],
    aiProfile: 'balanced', religiosity: 0.8
  },
  {
    key: 'TAI', name: 'Taikora', longName: 'República de Taikora', adjective: 'taikorano', culture: 'kovallano', religion: 'cuatro_lunas',
    anchor: [0.82, 0.73], weight: 0.55, population: 6.5, gdpPerCapita: 2900, regime: 'military_junta', archetype: 'resource_exporter',
    ideology: { econ: 0.2, welfare: -0.2, authority: 0.9, social: -0.3, nation: 0.6, central: 0.9 }, bloc: null, military: 1.2, techLevel: 0.3, institutions: 0.25,
    gini: 0.46, debt: 0.6, inflation: 0.18, stateShare: 0.45, openness: 0.4, color: '#8a7a4a', flag: f('bicolor_v', ['#8a7a4a', '#2e9e4f'], 'star', '#e8c547'),
    currency: { name: 'tala', code: 'TKT', rate: 5 }, capitalName: 'Moanara', foundedYear: 1962,
    history: ['Ex colonia minera de Tenmura; una junta militar gobierna desde 1985 con el apoyo de las compañías mineras.'],
    strengths: ['Níquel y madera'],
    weaknesses: ['Régimen inestable', 'Pobreza'],
    aiProfile: 'nationalist', religiosity: 0.7
  },
  {
    key: 'HAL', name: 'Halenui', longName: 'República Insular de Halenui', adjective: 'halenuense', culture: 'halenui', religion: 'cuatro_lunas',
    anchor: [0.94, 0.75], weight: 0.3, population: 3.2, gdpPerCapita: 14500, regime: 'parliamentary_democracy', archetype: 'tech_trader',
    ideology: { econ: 0.7, welfare: 0.1, authority: 0.3, social: -0.1, nation: 0.1, central: 0.9 }, bloc: null, military: 0.9, techLevel: 0.9, institutions: 0.9,
    gini: 0.38, debt: 0.1, inflation: 0.025, stateShare: 0.2, openness: 0.98, color: '#ff7a3a', flag: f('bicolor_h', ['#e05a3a', '#f2f2f2'], 'moon', '#f2f2f2'),
    currency: { name: 'dólar halenuense', code: 'HLD', rate: 1.9 }, capitalName: 'Port Leilani', foundedYear: 1965,
    history: [
      'Isla sin recursos que se separó de una federación en 1965 y apostó por la educación, el puerto y la electrónica.',
      'Hoy es uno de los centros tecnológicos y logísticos más avanzados del mundo.'
    ],
    strengths: ['Alta tecnología', 'Puerto de clase mundial', 'Gobierno eficiente'],
    weaknesses: ['Población mínima', 'Sin recursos naturales ni agua', 'Dependencia comercial total'],
    aiProfile: 'scientific', religiosity: 0.4
  },
  // ============================================================== VELMAR
  {
    key: 'MYR', name: 'Myrene', longName: 'República Marítima de Myrene', adjective: 'myreneo', culture: 'velmari', religion: 'cuatro_lunas',
    anchor: [0.58, 0.6], weight: 1, population: 3.4, gdpPerCapita: 9500, regime: 'parliamentary_democracy', archetype: 'services_finance',
    ideology: { econ: 0.5, welfare: 0.2, authority: -0.4, social: 0.1, nation: 0.1, central: 0.6 }, bloc: 'pacto', military: 0.7, techLevel: 0.6, institutions: 0.7,
    gini: 0.33, debt: 0.45, inflation: 0.05, stateShare: 0.2, openness: 0.8, color: '#3a8fd9', flag: f('cross', ['#3a8fd9', '#f2f2f2']),
    currency: { name: 'drakma', code: 'MYD', rate: 160 }, capitalName: 'Thalassa', foundedYear: 1830,
    history: ['República de armadores que controla gran parte del transporte marítimo de Vereth; disputa aguas pesqueras con Ardossa.'],
    strengths: ['Flota mercante', 'Comercio', 'Turismo'],
    weaknesses: ['Territorio pequeño', 'Rivalidad con Ardossa'],
    aiProfile: 'trader', religiosity: 0.6
  },
  {
    key: 'ARS', name: 'Ardossa', longName: 'República de Ardossa', adjective: 'ardossano', culture: 'velmari', religion: 'cuatro_lunas',
    anchor: [0.62, 0.67], weight: 1, population: 11, gdpPerCapita: 5800, regime: 'presidential_republic', archetype: 'tourism_islands',
    ideology: { econ: -0.1, welfare: 0.5, authority: 0, social: -0.2, nation: 0.5, central: 0.7 }, bloc: null, military: 1.0, techLevel: 0.45, institutions: 0.45,
    gini: 0.37, debt: 0.85, inflation: 0.15, stateShare: 0.4, openness: 0.5, color: '#2f6fb0', flag: f('tricolor_v', ['#2f6fb0', '#f2f2f2', '#2f6fb0'], 'circle', '#e8c547'),
    currency: { name: 'fénix', code: 'ADF', rate: 120 }, capitalName: 'Kalamos', foundedYear: 1832,
    history: ['La mayor de las islas de Velmar; un populismo clientelar sostiene un gasto público que la deuda ya no puede financiar.'],
    strengths: ['Turismo', 'Posición central en el mar de Velmar'],
    weaknesses: ['Deuda muy alta', 'Administración ineficiente'],
    aiProfile: 'balanced', religiosity: 0.7
  },
  {
    key: 'KAL', name: 'Kalythea', longName: 'Principado de Kalythea', adjective: 'kalytheo', culture: 'velmari', religion: 'cuatro_lunas',
    anchor: [0.55, 0.71], weight: 1, population: 1.1, gdpPerCapita: 11500, regime: 'constitutional_monarchy', archetype: 'services_finance',
    ideology: { econ: 0.8, welfare: -0.2, authority: 0, social: 0, nation: 0, central: 1 }, bloc: null, military: 0.3, techLevel: 0.55, institutions: 0.75,
    gini: 0.4, debt: 0.15, inflation: 0.03, stateShare: 0.1, openness: 0.9, color: '#d9b43a', flag: f('bicolor_h', ['#c23b3b', '#f2f2f2'], 'diamond', '#d9b43a'),
    currency: { name: 'óbolo', code: 'KLO', rate: 7 }, capitalName: 'Lysandra', foundedYear: 1297,
    history: ['Principado neutral, paraíso fiscal y registro de buques de conveniencia.'],
    strengths: ['Finanzas offshore', 'Neutralidad'],
    weaknesses: ['Sin defensa propia', 'Dependencia del capital extranjero'],
    aiProfile: 'pacifist', religiosity: 0.5
  },
  {
    key: 'ORI', name: 'Orisia', longName: 'República de Orisia', adjective: 'orisio', culture: 'velmari', religion: 'cuatro_lunas',
    anchor: [0.66, 0.58], weight: 1, population: 2.1, gdpPerCapita: 4200, regime: 'presidential_republic', archetype: 'tourism_islands',
    ideology: { econ: 0.1, welfare: 0.3, authority: 0.2, social: -0.2, nation: 0.3, central: 0.8 }, bloc: null, military: 0.6, techLevel: 0.4, institutions: 0.5,
    gini: 0.39, debt: 0.5, inflation: 0.09, stateShare: 0.3, openness: 0.6, color: '#59b3d9', flag: f('diagonal', ['#59b3d9', '#f2f2f2', '#e8c547']),
    currency: { name: 'estáter', code: 'ORS', rate: 4 }, capitalName: 'Phaistra', foundedYear: 1964,
    history: ['Isla oriental de Velmar, independiente en 1964; pesca, turismo y una base naval alquilada a Tenmura.'],
    strengths: ['Pesca', 'Turismo', 'Ubicación naval'],
    weaknesses: ['Economía pequeña'],
    aiProfile: 'balanced', religiosity: 0.6
  },
  {
    key: 'EUN', name: 'Eunomia', longName: 'Mancomunidad de Eunomia', adjective: 'eunomio', culture: 'velmari', religion: 'cuatro_lunas',
    anchor: [0.6, 0.76], weight: 1, population: 1.4, gdpPerCapita: 3900, regime: 'parliamentary_democracy', archetype: 'tourism_islands',
    ideology: { econ: 0.2, welfare: 0.4, authority: -0.3, social: 0.2, nation: 0, central: 0.5 }, bloc: null, military: 0.3, techLevel: 0.4, institutions: 0.6,
    gini: 0.36, debt: 0.4, inflation: 0.06, stateShare: 0.3, openness: 0.7, color: '#7ac9a8', flag: f('canton', ['#7ac9a8', '#1f3d7a'], 'stars3', '#f2f2f2'),
    currency: { name: 'nomo', code: 'EUN', rate: 2 }, capitalName: 'Eunopolis', foundedYear: 1970,
    history: ['Pequeño archipiélago democrático del sur de Velmar que vive del turismo y la pesca.'],
    strengths: ['Turismo', 'Democracia estable'],
    weaknesses: ['Muy pequeño', 'Vulnerable al clima'],
    aiProfile: 'pacifist', religiosity: 0.5
  }
];

export const OFFICIAL_DESIGN: WorldDesign = {
  name: 'Vereth (mundo oficial de CYO)',
  mode: 'official',
  seed: OFFICIAL_SEED,
  geo: OFFICIAL_GEO,
  cultures: [
    { id: 'valdoriano', name: 'Valdoriana', adjective: 'valdoriano', color: '#3f6fb5', language: 'nordh', anchors: [[0.22, 0.18]] },
    { id: 'castreno', name: 'Castrena', adjective: 'castreno', color: '#b5473f', language: 'aurel', anchors: [[0.1, 0.39]] },
    { id: 'hjelm', name: 'Hjelmarquesa', adjective: 'hjelmarqués', color: '#4f9a8f', language: 'nordh', anchors: [[0.17, 0.11], [0.45, 0.08]] },
    { id: 'strand', name: 'Strandholmesa', adjective: 'strandholmés', color: '#6a8fc9', language: 'nordh', anchors: [[0.07, 0.25]] },
    { id: 'lusarro', name: 'Lusarra', adjective: 'lusarro', color: '#d08a3a', language: 'aurel', anchors: [[0.28, 0.4]] },
    { id: 'morvano', name: 'Morvana', adjective: 'morvano', color: '#7d5ba6', language: 'aurel', anchors: [[0.19, 0.31], [0.2, 0.25]] },
    { id: 'vellmont', name: 'Vellmontesa', adjective: 'vellmontés', color: '#c23b3b', language: 'nordh', anchors: [[0.15, 0.26]] },
    { id: 'ardenzano', name: 'Ardenzana', adjective: 'ardenzano', color: '#a83232', language: 'aurel', anchors: [[0.33, 0.28]] },
    { id: 'praveto', name: 'Praveta', adjective: 'praveto', color: '#c0603a', language: 'kharz', anchors: [[0.31, 0.18]] },
    { id: 'kharzi', name: 'Kharzi', adjective: 'kharzi', color: '#b23a48', language: 'kharz', anchors: [[0.67, 0.21]] },
    { id: 'velskiano', name: 'Velskiana', adjective: 'velskiano', color: '#8f5a7a', language: 'kharz', anchors: [[0.6, 0.12], [0.63, 0.15]] },
    { id: 'kostravo', name: 'Kostrava', adjective: 'kostravo', color: '#cf6b4f', language: 'kharz', anchors: [[0.47, 0.21]] },
    { id: 'dravo', name: 'Dravoska', adjective: 'dravosko', color: '#9b4b6e', language: 'kharz', anchors: [[0.53, 0.27]] },
    { id: 'tseremio', name: 'Tseremia', adjective: 'tseremio', color: '#6b8e4e', language: 'kharz', anchors: [[0.59, 0.32], [0.56, 0.3]] },
    { id: 'ulmari', name: 'Ulmarí', adjective: 'ulmarí', color: '#4f8fbf', language: 'solv', anchors: [[0.67, 0.34], [0.7, 0.29]] },
    { id: 'zemirio', name: 'Zemiria', adjective: 'zemirio', color: '#2f7fc1', language: 'ostr', anchors: [[0.87, 0.26]] },
    { id: 'yarkhani', name: 'Yarkhaní', adjective: 'yarkhaní', color: '#d9a23b', language: 'solv', anchors: [[0.77, 0.32], [0.75, 0.27]] },
    { id: 'tavrino', name: 'Tavrina', adjective: 'tavrino', color: '#3fa37a', language: 'kharz', anchors: [[0.5, 0.35]] },
    { id: 'sairani', name: 'Sairaní', adjective: 'sairaní', color: '#7a6a3a', language: 'ostr', anchors: [[0.83, 0.13]] },
    { id: 'solvari', name: 'Solvarí', adjective: 'solvarí', color: '#2f9e6a', language: 'solv', anchors: [[0.48, 0.48]] },
    { id: 'nemuri', name: 'Nemurí', adjective: 'nemurí', color: '#c79a4a', language: 'solv', anchors: [[0.42, 0.56]] },
    { id: 'ourabadi', name: 'Ourabadí', adjective: 'ourabadí', color: '#1f6f5f', language: 'solv', anchors: [[0.41, 0.45]] },
    { id: 'meridiano', name: 'Meridiana', adjective: 'meridiano', color: '#2e9e4f', language: 'merid', anchors: [[0.22, 0.68]] },
    { id: 'andino', name: 'Andina', adjective: 'andino', color: '#9a6a3a', language: 'merid', anchors: [[0.15, 0.72], [0.17, 0.62]] },
    { id: 'oruaqueno', name: 'Oruaqueña', adjective: 'oruaqueño', color: '#e0b43a', language: 'merid', anchors: [[0.29, 0.64], [0.24, 0.6]] },
    { id: 'austrino', name: 'Austrina', adjective: 'austrino', color: '#3a5f9f', language: 'aurel', anchors: [[0.28, 0.85]] },
    { id: 'ostrio', name: 'Tenmurana', adjective: 'tenmurano', color: '#e05a6a', language: 'ostr', anchors: [[0.79, 0.66]] },
    { id: 'kovallano', name: 'Kovallana', adjective: 'kovallano', color: '#5ca35c', language: 'ostr', anchors: [[0.74, 0.72], [0.82, 0.73]] },
    { id: 'ryssano', name: 'Ryssana', adjective: 'ryssano', color: '#4a6fb0', language: 'ostr', anchors: [[0.87, 0.6]] },
    { id: 'halenui', name: 'Halenuense', adjective: 'halenuense', color: '#ff7a3a', language: 'ostr', anchors: [[0.94, 0.75]] },
    { id: 'velmari', name: 'Velmari', adjective: 'velmari', color: '#3a8fd9', language: 'velm', anchors: [[0.6, 0.66]] },
    { id: 'sarnes', name: 'Sarnesa', adjective: 'sarnés', color: '#7a9f3a', language: 'velm', anchors: [[0.05, 0.62]] }
  ],
  religions: [
    { id: 'primacia', name: 'Iglesia de la Primacía', color: '#d9b43a', traditionalism: 0.55, anchors: [[0.15, 0.38], [0.22, 0.7], [0.32, 0.3]] },
    { id: 'reforma', name: 'Comunión Reformada', color: '#5a7fd9', traditionalism: 0.3, anchors: [[0.18, 0.15], [0.07, 0.22], [0.28, 0.86]] },
    { id: 'camino', name: 'Camino de Kharz', color: '#b23a48', traditionalism: 0.45, anchors: [[0.62, 0.22], [0.48, 0.25]] },
    { id: 'fe_solar', name: 'Fe Solar', color: '#e0a03a', traditionalism: 0.8, anchors: [[0.45, 0.5]] },
    { id: 'cuatro_lunas', name: 'Las Cuatro Lunas', color: '#8f6fd9', traditionalism: 0.4, anchors: [[0.8, 0.65], [0.6, 0.66], [0.86, 0.2]] },
    { id: 'ancestral', name: 'Ancestralismo', color: '#5aa05a', traditionalism: 0.6, anchors: [[0.77, 0.33], [0.15, 0.6], [0.68, 0.34]] }
  ],
  countries: COUNTRIES,
  territories: [
    { x: 0.05, y: 0.62, owner: 'CAS' },
    { x: 0.42, y: 0.09, owner: 'HJE' },
    { x: 0.49, y: 0.08, owner: 'HJE' }
  ],
  oceans: [
    { name: 'Océano Boreal', x: 0.5, y: 0.03 },
    { name: 'Océano Occidental', x: 0.03, y: 0.45 },
    { name: 'Mar de Aurelia', x: 0.4, y: 0.25 },
    { name: 'Mar de Velmar', x: 0.62, y: 0.52 },
    { name: 'Océano Austral', x: 0.55, y: 0.92 },
    { name: 'Océano Oriental', x: 0.96, y: 0.45 },
    { name: 'Golfo de Meridia', x: 0.3, y: 0.5 },
    { name: 'Mar de Ostria', x: 0.7, y: 0.82 }
  ],
  organizations: [
    { name: 'Pacto de Aurelia', kind: 'military', members: ['VAL', 'CAS', 'STR', 'LUS', 'MOR', 'RHE', 'ZES', 'TEN', 'AUS', 'MYR'], tariffCut: 0, mutualDefense: true, scienceShare: 0.05 },
    { name: 'Concordia de Kharzun', kind: 'military', members: ['KHA', 'KOS', 'DRA', 'ARD', 'PRA', 'KES', 'ZEN', 'TAM'], tariffCut: 0, mutualDefense: true, scienceShare: 0.05 },
    { name: 'Consejo de Ayuda Mutua', kind: 'economic', members: ['KHA', 'KOS', 'DRA', 'ARD', 'PRA', 'KES', 'TAM', 'ZEN'], tariffCut: 0.6, mutualDefense: false, scienceShare: 0.1 },
    { name: 'Comunidad Económica Aureliana', kind: 'economic', members: ['VAL', 'CAS', 'LUS', 'MOR', 'RHE', 'STR'], tariffCut: 0.9, mutualDefense: false, scienceShare: 0.1 },
    { name: 'Liga de Solvara', kind: 'political', members: ['TAZ', 'ZAH', 'NEM', 'SAH', 'ILH', 'KES', 'OUR', 'TAV'], tariffCut: 0.2, mutualDefense: false, scienceShare: 0 },
    { name: 'Mercado Común Meridiano', kind: 'economic', members: ['TEC', 'IRI', 'CUA', 'PEL', 'VEN'], tariffCut: 0.5, mutualDefense: false, scienceShare: 0.05 },
    { name: 'Foro del Mar de Velmar', kind: 'economic', members: ['MYR', 'ARS', 'KAL', 'ORI', 'EUN', 'HAL'], tariffCut: 0.4, mutualDefense: false, scienceShare: 0.05 },
    { name: 'Movimiento de No Alineados', kind: 'political', members: ['YAR', 'NEM', 'TSE', 'TAV', 'CUA', 'KOV', 'ULM', 'QUI', 'ORU', 'SAH'], tariffCut: 0, mutualDefense: false, scienceShare: 0 }
  ],
  treaties: [
    { type: 'trade_agreement', parties: ['VAL', 'TEN'] },
    { type: 'trade_agreement', parties: ['VAL', 'TAZ'] },
    { type: 'energy_agreement', parties: ['TAZ', 'VAL'] },
    { type: 'energy_agreement', parties: ['KHA', 'ARD'] },
    { type: 'energy_agreement', parties: ['ZAH', 'TEN'] },
    { type: 'trade_agreement', parties: ['TEN', 'HAL'] },
    { type: 'trade_agreement', parties: ['TEN', 'RYS'] },
    { type: 'science_cooperation', parties: ['HJE', 'HAL'] },
    { type: 'science_cooperation', parties: ['VAL', 'RHE'] },
    { type: 'non_aggression', parties: ['KHA', 'TAV'] },
    { type: 'non_aggression', parties: ['KHA', 'ULM'] },
    { type: 'non_aggression', parties: ['KHA', 'TSE'] },
    { type: 'defensive_alliance', parties: ['TAZ', 'ZAH'] },
    { type: 'defensive_alliance', parties: ['YRV', 'PEL'] },
    { type: 'military_access', parties: ['TEN', 'ORI'] },
    { type: 'trade_agreement', parties: ['AUS', 'VAL'] },
    { type: 'trade_agreement', parties: ['YRV', 'TEN'] },
    { type: 'economic_aid', parties: ['KHA', 'TAM'] },
    { type: 'trade_agreement', parties: ['STR', 'HJE'] },
    { type: 'trade_agreement', parties: ['VEL', 'VAL'] },
    { type: 'ceasefire', parties: ['ZEN', 'ZES'], name: 'Armisticio de Pyeonhan (1953)' }
  ],
  relations: [
    { a: 'VAL', b: 'MOR', rivalry: 35, opinion: 10 },
    { a: 'KHA', b: 'VAL', rivalry: 60, opinion: -45 },
    { a: 'KHA', b: 'TEN', rivalry: 40, opinion: -30 },
    { a: 'ZEN', b: 'ZES', rivalry: 85, opinion: -80 },
    { a: 'TEC', b: 'YRV', rivalry: 55, opinion: -35 },
    { a: 'QUI', b: 'YRV', rivalry: 50, opinion: -40 },
    { a: 'TAZ', b: 'NEM', rivalry: 45, opinion: -30 },
    { a: 'OUR', b: 'KES', rivalry: 60, opinion: -60 },
    { a: 'OUR', b: 'TAZ', rivalry: 40, opinion: -35 },
    { a: 'KES', b: 'ZAH', rivalry: 50, opinion: -45 },
    { a: 'TEN', b: 'KOV', rivalry: 40, opinion: -25 },
    { a: 'KHA', b: 'YAR', rivalry: 45, opinion: -35 },
    { a: 'CAS', b: 'LUS', rivalry: 20, opinion: 20 },
    { a: 'MYR', b: 'ARS', rivalry: 30, opinion: -10 },
    { a: 'TAM', b: 'CUA', rivalry: 45, opinion: -40 },
    { a: 'DRA', b: 'TSE', rivalry: 35, opinion: -20 },
    { a: 'KHA', b: 'ULM', rivalry: 25, opinion: -5 },
    { a: 'VAL', b: 'RHE', opinion: 70 },
    { a: 'VAL', b: 'TEN', opinion: 55 },
    { a: 'HJE', b: 'STR', opinion: 70 },
    { a: 'KHA', b: 'ARD', opinion: 50 },
    { a: 'KHA', b: 'ZEN', opinion: 45 },
    { a: 'TAZ', b: 'ZAH', opinion: 65 },
    { a: 'CAS', b: 'TEC', opinion: 40 },
    { a: 'CAS', b: 'AUS', opinion: 45 },
    { a: 'VAL', b: 'AUS', opinion: 60 },
    { a: 'TEN', b: 'HAL', opinion: 60 },
    { a: 'TEN', b: 'ZES', opinion: 35 },
    { a: 'KHA', b: 'TAM', opinion: 55 },
    { a: 'KHA', b: 'KES', opinion: 50 }
  ],
  claims: [
    { claimant: 'MOR', x: 0.2, y: 0.25, r: 0.045, reason: 'Valle de Cendria' },
    { claimant: 'YRV', x: 0.18, y: 0.72, r: 0.04, reason: 'Desierto de Atamar' },
    { claimant: 'QUI', x: 0.12, y: 0.73, r: 0.035, reason: 'Salida al mar perdida en 1879' },
    { claimant: 'TAZ', x: 0.44, y: 0.52, r: 0.035, reason: 'Aguas del río Nemur' },
    { claimant: 'ZEN', x: 0.87, y: 0.32, r: 0.08, reason: 'Reunificación de Zemiria' },
    { claimant: 'ZES', x: 0.87, y: 0.2, r: 0.07, reason: 'Reunificación de Zemiria' },
    { claimant: 'YAR', x: 0.73, y: 0.27, r: 0.04, reason: 'Frontera de 1969' },
    { claimant: 'KOV', x: 0.78, y: 0.7, r: 0.03, reason: 'Islas del estrecho' },
    { claimant: 'KES', x: 0.51, y: 0.45, r: 0.03, reason: 'Campos petroleros fronterizos' },
    { claimant: 'OUR', x: 0.46, y: 0.5, r: 0.03, reason: 'Santuarios de la Fe Solar' },
    { claimant: 'ULM', x: 0.69, y: 0.29, r: 0.035, reason: 'Estepas ulmaríes' },
    { claimant: 'TEC', x: 0.15, y: 0.75, r: 0.03, reason: 'Desierto de Atamar' }
  ],
  landmassNames: [
    { x: 0.21, y: 0.27, name: 'Aurelia' }, { x: 0.64, y: 0.24, name: 'Kharzun y Solvara' }, { x: 0.21, y: 0.68, name: 'Meridia' },
    { x: 0.79, y: 0.69, name: 'Ostria' }, { x: 0.45, y: 0.085, name: 'Islas Brumas' },
    { x: 0.05, y: 0.62, name: 'Isla de Sarn' }, { x: 0.94, y: 0.75, name: 'Isla de Halenui' }, { x: 0.58, y: 0.6, name: 'Isla de Myrene' },
    { x: 0.62, y: 0.67, name: 'Isla de Ardossa' }, { x: 0.55, y: 0.71, name: 'Isla de Kalythea' }, { x: 0.66, y: 0.58, name: 'Isla de Orisia' },
    { x: 0.6, y: 0.76, name: 'Islas Eunomias' }
  ],
  featureNames: [
    { x: 0.2, y: 0.28, name: 'Montes Cendrios', kind: 'mountains' }, { x: 0.58, y: 0.28, name: 'Cordillera Kharz', kind: 'mountains' },
    { x: 0.81, y: 0.28, name: 'Cordillera de Zemiria', kind: 'mountains' }, { x: 0.15, y: 0.7, name: 'Sierra Mayor', kind: 'mountains' },
    { x: 0.78, y: 0.7, name: 'Altos de Ostria', kind: 'mountains' }, { x: 0.45, y: 0.5, name: 'Gran Desierto de Solvara', kind: 'desert' },
    { x: 0.66, y: 0.34, name: 'Estepas de Ulmar', kind: 'plains' }, { x: 0.22, y: 0.62, name: 'Selva Meridiana', kind: 'forest' }
  ],
  worldHistory: [
    'Vereth es un mundo de seis grandes masas de tierra: Aurelia, Kharzun, Solvara, Meridia, Ostria y el archipiélago de Velmar.',
    'Entre los siglos XVI y XIX el imperio marítimo castreno colonizó Meridia; las guerras de emancipación (1810-1830) crearon las repúblicas meridianas.',
    'En 1921 la revolución kharzi derrocó al Imperio Kharzi y fundó la Unión de Repúblicas Kharzi.',
    'La Guerra de los Estrechos (1948-1952) enfrentó a Valdoria y Tenmura con la Unión Kharzi; terminó con la partición de Zemiria, la pérdida del valle de Cendria por Valdoria y el nacimiento de dos bloques: el Pacto de Aurelia y la Concordia de Kharzun.',
    'La descolonización (1946-1971) creó los Estados de Velmar, Solvara y Ostria.',
    'En 1990 la Concordia atraviesa una crisis económica, Meridia sufre inflación y deuda, Solvara vive del petróleo y Ostria crece a gran velocidad. Nada de lo que venga está escrito.'
  ]
};
