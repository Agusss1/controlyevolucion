import type { RegimeId, FlagSpec, DimVector } from '@cyo/shared';
import { Rng } from '../rng.js';
import { NameRegistry, LANGUAGES, adjectiveOf, currencyCode } from '../worldgen/names.js';
import type { WorldDesign, CountryDesign } from './design.js';
import { generateGeography, type ContinentBlob, type Ridge, type ClimateZone, type ResourceHotspot, type GeoParams } from '../worldgen/geography.js';
import { cellCenter } from '@cyo/shared';

/**
 * MUNDO ALEATORIO: genera continentes, culturas, religiones, países, regímenes, economías,
 * historia y relaciones a partir de una semilla. Usa exactamente el mismo motor que el mundo
 * oficial. La misma semilla produce siempre el mismo mundo.
 */

const PALETTE = ['#3f6fb5', '#b5473f', '#4f9a8f', '#d08a3a', '#7d5ba6', '#c23b3b', '#5f8f4f', '#b23a48', '#cf6b4f', '#9b4b6e', '#6b8e4e',
  '#4f8fbf', '#8a2be2', '#2f7fc1', '#d9a23b', '#3fa37a', '#7a6a3a', '#2f9e6a', '#1f7a4a', '#c79a4a', '#bf3f3f', '#1f6f5f', '#b08b5a',
  '#36a3c9', '#2e9e4f', '#c43b3b', '#3b7fc4', '#d14b4b', '#e0b43a', '#5aa0c9', '#4fb0a0', '#2fb3b3', '#3a5f9f', '#9a6a3a', '#e05a6a',
  '#5ca35c', '#4a6fb0', '#8a7a4a', '#ff7a3a', '#3a8fd9', '#2f6fb0', '#d9b43a', '#59b3d9', '#7ac9a8', '#a0522d', '#6a5acd', '#20b2aa',
  '#cd5c5c', '#9acd32', '#ba55d3', '#f08080', '#66cdaa', '#daa520', '#708090', '#bc8f8f', '#4682b4', '#d2691e', '#8fbc8f', '#9370db'];
const FLAG_COLORS = ['#c23b3b', '#f2f2f2', '#1f3d7a', '#2e9e4f', '#e8c547', '#1c1c1c', '#3b7fc4', '#7d5ba6', '#d08a3a', '#2fb3b3', '#a83232', '#1f7a4a'];
const PATTERNS: FlagSpec['pattern'][] = ['tricolor_h', 'tricolor_v', 'bicolor_h', 'bicolor_v', 'cross', 'nordic', 'canton', 'diagonal', 'disc', 'chevron', 'bordered', 'quartered'];
const EMBLEMS: FlagSpec['emblem'][] = ['none', 'none', 'star', 'sun', 'moon', 'circle', 'diamond', 'wheel', 'tower', 'stars3'];

export function randomFlag(rng: Rng): FlagSpec {
  const colors = rng.shuffle([...FLAG_COLORS]).slice(0, 3);
  return { pattern: rng.pick(PATTERNS), colors, emblem: rng.pick(EMBLEMS), emblemColor: rng.pick(FLAG_COLORS.filter((c) => !colors.includes(c))) };
}

const RELIGION_NAMES = ['Iglesia del Alba', 'Credo de las Aguas', 'Fe de los Antiguos', 'Senda del Fuego', 'Orden de la Piedra', 'Culto Estelar', 'Comunión del Árbol', 'Doctrina del Equilibrio'];

export function randomDesign(seed: string, countryCount = 52): WorldDesign {
  const rng = new Rng('random-world:' + seed);
  const names = new NameRegistry(rng.fork('names'));
  const n = Math.max(40, Math.min(70, Math.round(countryCount)));

  // --------------------------------------------------- continentes
  const blobs: ContinentBlob[] = [];
  const ridges: Ridge[] = [];
  const continents = rng.int(4, 6);
  const centers: [number, number, number][] = [];
  for (let i = 0; i < continents; i++) {
    let x = 0, y = 0;
    for (let tries = 0; tries < 50; tries++) {
      x = rng.range(0.14, 0.86); y = rng.range(0.18, 0.82);
      if (centers.every(([cx, cy]) => Math.hypot(cx - x, cy - y) > 0.27)) break;
    }
    const size = rng.range(0.07, 0.14);
    centers.push([x, y, size]);
    const parts = rng.int(2, 4);
    for (let k = 0; k < parts; k++) {
      blobs.push({ x: x + rng.range(-size, size) * 0.8, y: y + rng.range(-size, size) * 0.7, rx: size * rng.range(0.55, 1), ry: size * rng.range(0.5, 0.9), rot: rng.range(-1, 1) });
    }
    const a = rng.range(0, Math.PI);
    ridges.push({ x1: x - Math.cos(a) * size * 0.8, y1: y - Math.sin(a) * size * 0.8, x2: x + Math.cos(a) * size * 0.8, y2: y + Math.sin(a) * size * 0.8, width: rng.range(0.01, 0.018), height: rng.range(0.6, 1) });
  }
  const islands = rng.int(6, 12);
  for (let i = 0; i < islands; i++) {
    blobs.push({ x: rng.range(0.08, 0.92), y: rng.range(0.1, 0.9), rx: rng.range(0.015, 0.035), ry: rng.range(0.015, 0.03), weight: 0.85 });
  }
  const climateZones: ClimateZone[] = [];
  for (let i = 0; i < 4; i++) climateZones.push({ x: rng.range(0.1, 0.9), y: rng.range(0.25, 0.75), r: rng.range(0.06, 0.12), moisture: rng.range(-0.45, 0.25) });
  const hotspots: ResourceHotspot[] = [];
  const res: ResourceHotspot['resource'][] = ['oil', 'oil', 'oil', 'gas', 'gas', 'coal', 'minerals', 'minerals'];
  for (const r of res) {
    const [x, y, s] = rng.pick(centers);
    hotspots.push({ x: x + rng.range(-s, s), y: y + rng.range(-s, s), r: rng.range(0.03, 0.07), resource: r, amount: rng.range(1.5, 3.5) });
  }

  const geoParams: GeoParams = { seed: 'random:' + seed, width: 180, height: 112, landFraction: rng.range(0.32, 0.4), equator: rng.range(0.48, 0.58), provinceCells: 17, seaZoneCells: 150, blobs, ridges, climateZones, hotspots };
  // Se genera la geografía de antemano para elegir capitales sobre tierra firme, bien espaciadas.
  const geo = generateGeography(geoParams);
  const provNorm = geo.provinces.map((p) => {
    const [x, y] = cellCenter(p.anchor, geo.width);
    return { x: x / (Math.sqrt(3) * geo.width), y: y / (1.5 * geo.height), size: geo.landmasses[p.landmass].provinces.length };
  });
  const anchorsPicked: [number, number][] = [];
  for (let minD = 0.11; anchorsPicked.length < n && minD > 0.01; minD *= 0.85) {
    for (const k of rng.shuffle(provNorm.map((_, i) => i))) {
      if (anchorsPicked.length >= n) break;
      const q = provNorm[k];
      if (q.size < 2 && rng.chance(0.6)) continue;
      if (anchorsPicked.every(([x, y]) => Math.hypot(x - q.x, y - q.y) >= minD)) anchorsPicked.push([q.x, q.y]);
    }
  }

  // --------------------------------------------------- culturas y religiones
  const langs = Object.keys(LANGUAGES);
  const cultures: WorldDesign['cultures'] = [];
  const cultureCount = rng.int(9, 14);
  for (let i = 0; i < cultureCount; i++) {
    const [x, y, s] = centers[i % centers.length];
    const lang = langs[(i + rng.int(0, 2)) % langs.length];
    const nm = names.feature(lang);
    cultures.push({ id: 'cul' + i, name: nm, adjective: adjectiveOf(nm), color: PALETTE[(i * 7) % PALETTE.length], language: lang, anchors: [[x + rng.range(-s, s), y + rng.range(-s, s)]] });
  }
  const religions: WorldDesign['religions'] = [];
  const relCount = rng.int(4, 6);
  for (let i = 0; i < relCount; i++) {
    const [x, y, s] = rng.pick(centers);
    religions.push({ id: 'rel' + i, name: RELIGION_NAMES[i % RELIGION_NAMES.length], color: PALETTE[(i * 11 + 3) % PALETTE.length], traditionalism: rng.range(0.2, 0.85), anchors: [[x + rng.range(-s, s), y + rng.range(-s, s)], [rng.range(0.1, 0.9), rng.range(0.2, 0.8)]] });
  }

  // --------------------------------------------------- países
  const countries: CountryDesign[] = [];
  const blocs = ['bloque_a', 'bloque_b', null, null];
  for (let i = 0; i < n; i++) {
    const anchor: [number, number] = anchorsPicked[i % anchorsPicked.length];
    let ci = 0, cd = Infinity;
    cultures.forEach((c, k) => { const d = Math.hypot(c.anchors[0][0] - anchor[0], c.anchors[0][1] - anchor[1]); if (d < cd) { cd = d; ci = k; } });
    let ri = 0, rd = Infinity;
    religions.forEach((r, k) => { for (const a of r.anchors) { const d = Math.hypot(a[0] - anchor[0], a[1] - anchor[1]); if (d < rd) { rd = d; ri = k; } } });
    const culture = cultures[ci];
    // algunas culturas reciben un ancla extra para generar minorías y Estados divididos
    if (rng.chance(0.2)) culture.anchors.push(anchor);
    const name = names.country(culture.language);
    const gdppc = Math.round(Math.exp(rng.normal(Math.log(4500), 0.95)));
    const population = Math.round(Math.exp(rng.normal(Math.log(14), 1.1)) * 10) / 10;
    const rich = gdppc > 9000;
    const regime: RegimeId = rich ? rng.weighted(['parliamentary_democracy', 'presidential_republic', 'constitutional_monarchy', 'one_party_state'], [5, 3, 3, 1]) :
      rng.weighted(['parliamentary_democracy', 'presidential_republic', 'constitutional_monarchy', 'absolute_monarchy', 'one_party_state', 'military_junta', 'theocracy'], [1.5, 3, 1, 1, 2, 2, 0.6]);
    const socialist = regime === 'one_party_state' && rng.chance(0.75);
    const bloc = socialist ? 'bloque_b' : rich && rng.chance(0.5) ? 'bloque_a' : rng.pick(blocs);
    const lang = LANGUAGES[culture.language];
    const curName = rng.pick(lang.currencies);
    const ideology: Partial<DimVector> = {
      econ: socialist ? rng.range(-1, -0.5) : rng.range(-0.4, 0.8), welfare: rng.range(-0.4, 0.8),
      authority: regime.includes('democracy') || regime === 'presidential_republic' || regime === 'constitutional_monarchy' ? rng.range(-0.7, 0.2) : rng.range(0.5, 1),
      social: rng.range(-0.8, 0.5), nation: rng.range(-0.4, 0.8), central: rng.range(-0.6, 1)
    };
    countries.push({
      key: 'R' + String(i).padStart(2, '0'), name, longName: longNameFor(name, regime, rng), adjective: adjectiveOf(name),
      culture: culture.id, religion: religions[ri].id, anchor, weight: Math.max(0.45, Math.exp(rng.normal(0, 0.45)) * Math.pow(population / 14, 0.3)),
      population, gdpPerCapita: gdppc, regime, archetype: 'auto', ideology, bloc,
      military: rng.range(0.5, 1.8), techLevel: Math.min(0.95, Math.max(0.15, Math.log(gdppc / 500) / 4 + rng.range(-0.1, 0.1))),
      institutions: Math.min(0.95, Math.max(0.15, (rich ? 0.6 : 0.35) + rng.range(-0.2, 0.25))), gini: rng.range(0.24, 0.55),
      debt: rng.range(0.1, 0.9), inflation: Math.abs(rng.normal(0.08, 0.1)), stateShare: socialist ? rng.range(0.7, 0.95) : rng.range(0.08, 0.5),
      openness: rng.range(0.15, 0.85), color: PALETTE[i % PALETTE.length], flag: randomFlag(rng),
      currency: { name: curName, code: currencyCode(curName + name, rng), rate: Math.round(Math.exp(rng.normal(1.5, 2)) * 100) / 100 },
      capitalName: names.place(culture.language), foundedYear: rng.int(1300, 1975),
      history: [], strengths: [], weaknesses: [],
      aiProfile: rng.pick(['balanced', 'trader', 'nationalist', 'defensive', 'developmental', 'aggressive', 'scientific', 'pacifist']),
      religiosity: rng.range(0.2, 0.9),
      laws: socialist ? { prices: 'planned' } : undefined
    });
  }

  // --------------------------------------------------- historia, rivalidades y bloques
  const relations: WorldDesign['relations'] = [];
  const claims: WorldDesign['claims'] = [];
  const treaties: WorldDesign['treaties'] = [];
  const orgMembers: Record<string, string[]> = { bloque_a: [], bloque_b: [] };
  for (const c of countries) if (c.bloc) orgMembers[c.bloc].push(c.key);
  const oldEmpire = rng.pick(cultures);
  const empireName = `Imperio ${oldEmpire.adjective}`;
  const empireFall = rng.int(1880, 1960);
  for (const c of countries) {
    const near = countries.filter((o) => o !== c).sort((a, b) => dist(a.anchor, c.anchor) - dist(b.anchor, c.anchor)).slice(0, 3);
    const events: string[] = [];
    if (c.culture === oldEmpire.id) events.push(`Heredero del antiguo ${empireName}, desmembrado en ${empireFall}.`);
    if (c.foundedYear < 1800) events.push(`Estado de larga tradición, con raíces en ${c.foundedYear}.`);
    else events.push(`Independiente desde ${c.foundedYear}.`);
    const regDesc: Record<RegimeId, string> = {
      parliamentary_democracy: 'una democracia parlamentaria consolidada', presidential_republic: 'una república presidencialista',
      constitutional_monarchy: 'una monarquía constitucional', absolute_monarchy: 'una monarquía absoluta',
      one_party_state: 'un Estado de partido único', military_junta: 'una junta militar', theocracy: 'una teocracia'
    };
    events.push(`En 1990 es ${regDesc[c.regime]} con un PIB per cápita de ${c.gdpPerCapita.toLocaleString('es')} UMI.`);
    for (const o of near) {
      if (rng.chance(0.35) && !relations.some((r) => (r.a === c.key && r.b === o.key) || (r.a === o.key && r.b === c.key))) {
        const riv = rng.int(20, 70);
        relations.push({ a: c.key, b: o.key, rivalry: riv, opinion: -riv * 0.7 });
        if (riv > 45) {
          claims.push({ claimant: c.key, x: (c.anchor[0] + o.anchor[0]) / 2, y: (c.anchor[1] + o.anchor[1]) / 2, r: 0.03, reason: `Frontera disputada con ${o.name}` });
          events.push(`Mantiene una disputa territorial con ${o.name}.`);
        } else events.push(`Rivalidad histórica con ${o.name}.`);
      } else if (rng.chance(0.25)) {
        relations.push({ a: c.key, b: o.key, opinion: rng.int(30, 70) });
        treaties.push({ type: 'trade_agreement', parties: [c.key, o.key] });
        events.push(`Socio comercial tradicional de ${o.name}.`);
      }
    }
    c.history = events;
    c.strengths = [];
    c.weaknesses = [];
    if (c.gdpPerCapita > 12000) c.strengths.push('Economía desarrollada'); else if (c.gdpPerCapita < 2000) c.weaknesses.push('Pobreza extendida');
    if (c.population > 50) c.strengths.push('Gran población'); else if (c.population < 5) c.weaknesses.push('Población reducida');
    if (c.institutions > 0.7) c.strengths.push('Instituciones sólidas'); else if (c.institutions < 0.35) c.weaknesses.push('Instituciones débiles');
    if (c.debt > 0.7) c.weaknesses.push('Deuda elevada');
    if (c.inflation > 0.2) c.weaknesses.push('Inflación alta');
  }
  const organizations: WorldDesign['organizations'] = [];
  if (orgMembers.bloque_a.length >= 2) organizations.push({ name: `Alianza ${names.feature('aurel')}`, kind: 'military', members: orgMembers.bloque_a, tariffCut: 0.3, mutualDefense: true, scienceShare: 0.05 });
  if (orgMembers.bloque_b.length >= 2) organizations.push({ name: `Pacto ${names.feature('kharz')}`, kind: 'military', members: orgMembers.bloque_b, tariffCut: 0.5, mutualDefense: true, scienceShare: 0.05 });

  return {
    name: `Mundo aleatorio ${seed}`, mode: 'random', seed: 'random:' + seed,
    geo: geoParams,
    cultures, religions, countries, territories: [], oceans: [
      { name: `Océano ${names.feature('velm')}`, x: 0.5, y: 0.04 }, { name: `Océano ${names.feature('aurel')}`, x: 0.04, y: 0.5 },
      { name: `Océano ${names.feature('ostr')}`, x: 0.96, y: 0.5 }, { name: `Mar ${names.feature('solv')}`, x: 0.5, y: 0.95 }
    ],
    organizations, treaties, relations, claims,
    worldHistory: [
      `Mundo generado con la semilla «${seed}».`,
      `El ${empireName} dominó buena parte del mundo hasta ${empireFall}; sus herederos aún disputan fronteras.`,
      orgMembers.bloque_a.length && orgMembers.bloque_b.length ? 'Dos bloques rivales se reparten la influencia mundial en 1990.' : 'En 1990 no existe un orden de bloques consolidado.'
    ]
  };
}

function dist(a: [number, number], b: [number, number]): number { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

function longNameFor(name: string, regime: RegimeId, rng: Rng): string {
  switch (regime) {
    case 'absolute_monarchy': return rng.pick([`Reino de ${name}`, `Sultanato de ${name}`, `Emirato de ${name}`, `Kanato de ${name}`]);
    case 'constitutional_monarchy': return rng.pick([`Reino de ${name}`, `Principado de ${name}`, `Gran Ducado de ${name}`]);
    case 'one_party_state': return rng.pick([`República Popular de ${name}`, `República Socialista de ${name}`, `República Democrática de ${name}`]);
    case 'military_junta': return rng.pick([`Estado de ${name}`, `República de ${name}`]);
    case 'theocracy': return rng.pick([`Dominio Sagrado de ${name}`, `República Sagrada de ${name}`]);
    case 'parliamentary_democracy': return rng.pick([`República de ${name}`, `Mancomunidad de ${name}`, `República Federal de ${name}`]);
    default: return rng.pick([`República de ${name}`, `Estados Unidos de ${name}`, `República Federativa de ${name}`]);
  }
}
