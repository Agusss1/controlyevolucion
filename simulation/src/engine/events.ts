import type { CountryState, Decision, ProvinceState } from '@cyo/shared';
import { clamp } from '../rng.js';
import { Sim, relation } from './context.js';
import { nominalGDP, population } from './economy.js';
import { borrow } from './fiscal.js';
import { enactLaw, applyRegimeChange } from './politics.js';
import { createCountry } from './states.js';
import { createUnit, declareWar } from './military.js';
import { TERRAIN, formatDate } from '@cyo/shared';
import { isDemocratic } from '../data/laws.js';

/**
 * MOTOR DE EVENTOS: cada evento tiene condiciones causales sobre el estado del país y del mundo,
 * una probabilidad calibrable y consecuencias persistentes. Nada ocurre por fecha fija.
 * Los eventos con opciones generan decisiones: el jugador elige; la IA decide con la misma lógica;
 * si el jugador está ausente y lo autorizó, al vencer se aplica la opción por defecto.
 */

interface DecisionOption { id: string; label: string; description: string; apply: (sim: Sim, c: CountryState, data: Decision['data']) => void; ai: (sim: Sim, c: CountryState) => number }
interface DecisionDef { title: string; text: (c: CountryState, data: Decision['data']) => string; options: DecisionOption[]; defaultOption: string }

export const DECISIONS: Record<string, DecisionDef> = {
  mass_protests: {
    title: 'Protestas masivas',
    text: (c) => `Multitudes ocupan las calles de ${c.name} exigiendo cambios. La estabilidad está en riesgo.`,
    defaultOption: 'concede',
    options: [
      { id: 'concede', label: 'Hacer concesiones', description: 'Aumenta transferencias sociales (+0,8 % del PIB) y gasta capital político. Mejora la aprobación.',
        apply: (_s, c) => { c.budget.transfers += 0.8; c.politics.politicalCapital = Math.max(0, c.politics.politicalCapital - 15); for (const g of ['workers', 'youth', 'middle'] as const) c.groups[g].sat += 6; c.politics.protest *= 0.7; },
        ai: (_s, c) => 1 - c.politics.politicalCapital / 200 + (c.fiscal.balance > 0 ? 0.3 : 0) },
      { id: 'repress', label: 'Reprimir', description: 'Las fuerzas de seguridad disuelven las protestas: estabilidad a corto plazo, legitimidad y radicalización en contra.',
        apply: (s, c) => { const lp = s.params(c); c.politics.protest *= 0.4 - 0.2 * lp.policePower; c.politics.legitimacy -= 8 + 10 * lp.democracy; for (const g of ['youth', 'middle', 'workers'] as const) c.groups[g].radical = Math.min(1, c.groups[g].radical + 0.12); },
        ai: (s, c) => (1 - s.params(c).democracy) * 1.4 + s.params(c).policePower },
      { id: 'ignore', label: 'Esperar', description: 'No hacer nada: las protestas pueden crecer.',
        apply: (_s, c) => { c.politics.protest = Math.min(1, c.politics.protest + 0.1); }, ai: () => 0.2 }
    ]
  },
  separatist_crisis: {
    title: 'Crisis separatista',
    text: (c, d) => `En ${d?.region ?? 'una región'} crece el movimiento por la independencia. Los líderes locales exigen respuestas al gobierno de ${c.name}.`,
    defaultOption: 'autonomy',
    options: [
      { id: 'autonomy', label: 'Conceder autonomía', description: 'Autonomía cultural y regional: reduce el separatismo, descentraliza el Estado y molesta a los nacionalistas.',
        apply: (s, c, d) => { enactLaw(s, c, 'minorities', 'autonomy', true); for (const p of regionProvinces(s, c, String(d?.culture))) { p.autonomy = Math.min(1, p.autonomy + 0.5); p.unrest *= 0.6; } c.groups.military.sat -= 5; },
        ai: (s, c) => 0.8 - s.params(c).centralization * 0.5 },
      { id: 'referendum', label: 'Pactar un referéndum', description: 'Si gana el sí, la región se independiza pacíficamente y mantiene buenas relaciones.',
        apply: (s, c, d) => { const provs = regionProvinces(s, c, String(d?.culture)).filter((p) => p.unrest > 0.4); if (provs.length && s.rng.chance(0.3 + 0.5 * avg(provs.map((p) => p.unrest)))) independence(s, c, provs.map((p) => p.id), false); else { for (const p of provs) p.unrest *= 0.4; s.emit('referendum_no', 'world', 'major', [c.id], `Gana el «no» en el referéndum de ${d?.region}`, 'La región continuará dentro del Estado.'); } },
        ai: (s, c) => s.params(c).democracy * 0.6 },
      { id: 'suppress', label: 'Reprimir el separatismo', description: 'Despliegue policial y militar: reduce el malestar visible pero aumenta la radicalización y el riesgo de insurrección.',
        apply: (s, c, d) => { for (const p of regionProvinces(s, c, String(d?.culture))) p.unrest = Math.max(0, p.unrest - 0.25); c.groups.minorities.radical = Math.min(1, c.groups.minorities.radical + 0.25); c.politics.legitimacy -= 5; c.cooldowns.suppressed = s.day; },
        ai: (s, c) => (1 - s.params(c).democracy) + s.params(c).centralization * 0.4 }
    ]
  },
  banking_crisis: {
    title: 'Crisis bancaria',
    text: (c) => `Varios bancos de ${c.name} enfrentan corridas de depósitos. El sistema financiero puede colapsar.`,
    defaultOption: 'bailout',
    options: [
      { id: 'bailout', label: 'Rescatar a los bancos', description: 'El Tesoro inyecta capital (≈4 % del PIB, con deuda si es necesario). Contiene la crisis.',
        apply: (s, c) => { const cost = 0.04 * nominalGDP(c); if (c.fiscal.treasury < cost) borrow(s, c, cost - c.fiscal.treasury); c.fiscal.treasury -= cost; c.fiscal.ledger.extraordinary -= cost; c.econ.bankStress *= 0.35; c.groups.middle.sat -= 4; },
        ai: (_s, c) => 1 - (c.fiscal.debtDomestic / Math.max(1e-6, nominalGDP(c)) > 1 ? 0.8 : 0) },
      { id: 'let_fail', label: 'Dejar caer a los bancos', description: 'Sin coste fiscal, pero recesión profunda y pérdida de ahorros.',
        apply: (_s, c) => { c.econ.outputGap -= 0.07; c.cooldowns.confidenceShock = (c.cooldowns.confidenceShock ?? 0) - 15; c.groups.middle.sat -= 12; c.groups.pensioners.sat -= 10; },
        ai: (_s, c) => (c.fiscal.inDefault ? 1.5 : 0.3) }
    ]
  },
  stabilization: {
    title: 'Hiperinflación',
    text: (c) => `La inflación en ${c.name} supera el ${(c.econ.inflation * 100).toFixed(0)} % anual. Los precios cambian a diario.`,
    defaultOption: 'plan',
    options: [
      { id: 'plan', label: 'Plan de estabilización', description: 'Banco central independiente, fin de la emisión para financiar el déficit y recorte de subsidios. Duro a corto plazo.',
        apply: (s, c) => { enactLaw(s, c, 'centralBank', 'independent', true); c.fiscal.monetization = 0; c.budget.subsidies = Math.max(0, c.budget.subsidies * 0.6); c.econ.expectedInflation *= 0.5; c.groups.workers.sat -= 6; c.politics.politicalCapital = Math.max(0, c.politics.politicalCapital - 20); },
        ai: () => 1 },
      { id: 'controls', label: 'Congelamiento de precios', description: 'Controles de precios generalizados: alivio aparente, escasez después.',
        apply: (s, c) => { enactLaw(s, c, 'prices', 'partial', true); }, ai: (s, c) => (1 - s.params(c).cbIndependence) * 0.6 },
      { id: 'continue', label: 'Seguir emitiendo', description: 'Mantener el financiamiento monetario.', apply: () => undefined, ai: () => 0.1 }
    ]
  },
  corruption_scandal: {
    title: 'Escándalo de corrupción',
    text: (c) => `La prensa de ${c.name} revela una red de sobornos que alcanza a ministros del gobierno.`,
    defaultOption: 'investigate',
    options: [
      { id: 'investigate', label: 'Investigar a fondo', description: 'Cuesta capital político ahora; reduce la corrupción y mejora la legitimidad.',
        apply: (_s, c) => { c.politics.politicalCapital = Math.max(0, c.politics.politicalCapital - 20); c.politics.corruption *= 0.85; c.politics.legitimacy += 4; c.politics.approval -= 3; },
        ai: (_s, c) => c.politics.politicalCapital / 50 },
      { id: 'cover', label: 'Encubrir', description: 'Evita el daño inmediato, pero si se descubre el golpe será mayor.',
        apply: (s, c) => { if (s.rng.chance(s.params(c).pressFreedom * 0.6)) { c.politics.approval -= 12; c.politics.legitimacy -= 10; s.emit('coverup', 'national', 'major', [c.id], `Se descubre el encubrimiento en ${c.name}`, 'La crisis política se agrava.'); } else c.politics.corruption += 4; },
        ai: (s, c) => 1 - s.params(c).pressFreedom }
    ]
  },
  junta_transition: {
    title: 'Presión por la transición',
    text: (c) => `La junta militar de ${c.name} enfrenta protestas y aislamiento. Sectores moderados proponen convocar elecciones.`,
    defaultOption: 'elections',
    options: [
      { id: 'elections', label: 'Convocar elecciones', description: 'Transición a república presidencial con elecciones en seis meses.',
        apply: (s, c) => { const prev = c.regime; c.laws.regime = 'presidential_republic'; c.laws.speech = 'free'; c.laws.press = 'free'; c.laws.assembly = 'free'; applyRegimeChange(s, c, prev, 'presidential_republic'); c.politics.legitimacy += 15; },
        ai: (_s, c) => (50 - c.politics.legitimacy) / 30 },
      { id: 'stay', label: 'Mantener el poder', description: 'La junta continúa; aumenta la represión.', apply: (_s, c) => { c.politics.legitimacy -= 5; c.groups.military.sat += 5; }, ai: (_s, c) => c.groups.military.sat / 60 }
    ]
  }
};

function avg(a: number[]): number { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

function regionProvinces(sim: Sim, c: CountryState, culture: string): ProvinceState[] {
  return Object.values(sim.state.provinces).filter((p) => p.owner === c.id && p.culture === culture);
}

export function addDecision(sim: Sim, c: CountryState, event: string, data: Decision['data'] = {}): void {
  const def = DECISIONS[event];
  if (!def || c.decisions.some((d) => d.event === event)) return;
  const d: Decision = {
    id: sim.nextId('D'), event, title: def.title, text: def.text(c, data), options: def.options.map((o) => ({ id: o.id, label: o.label, description: o.description })),
    createdDay: sim.day, expiresDay: sim.day + 30, defaultOption: def.defaultOption, data
  };
  c.decisions.push(d);
  sim.emit('decision', 'private', 'major', [c.id], def.title, d.text, { data: { decision: d.id } });
}

export function resolveDecision(sim: Sim, c: CountryState, decisionId: string, optionId: string): { ok: boolean; error?: string } {
  const d = c.decisions.find((x) => x.id === decisionId);
  if (!d) return { ok: false, error: 'Decisión inexistente.' };
  const def = DECISIONS[d.event];
  const opt = def?.options.find((o) => o.id === optionId);
  if (!opt) return { ok: false, error: 'Opción inválida.' };
  c.decisions = c.decisions.filter((x) => x.id !== decisionId);
  opt.apply(sim, c, d.data);
  sim.emit('decision_made', 'national', 'info', [c.id], `${def.title}: ${opt.label}`, opt.description);
  return { ok: true };
}

export function aiChooseDecision(sim: Sim, c: CountryState, d: Decision): string {
  const def = DECISIONS[d.event];
  if (!def) return d.defaultOption;
  let best = def.defaultOption, score = -Infinity;
  for (const o of def.options) { const s = o.ai(sim, c) + sim.rng.next() * 0.2; if (s > score) { score = s; best = o.id; } }
  return best;
}

/** Independencia: crea el nuevo Estado y, si es hostil, una guerra de independencia. */
export function independence(sim: Sim, parent: CountryState, provinceIds: string[], hostile: boolean): CountryState | null {
  const n = createCountry(sim, parent, provinceIds, { reason: hostile ? 'Declaración unilateral de independencia tras años de agravios.' : 'Independencia pactada mediante referéndum.', hostile });
  if (!n) return null;
  sim.emit('independence', 'world', 'critical', [n.id, parent.id], `Nace un nuevo Estado: ${n.name}`, `${n.longName} proclama su independencia de ${parent.name}.`);
  // milicias
  const militia = Math.max(1, Math.min(6, Math.round(provinceIds.length * 0.8)));
  for (let i = 0; i < militia; i++) {
    const u = createUnit(sim, n, 'infantry', provinceIds[i % provinceIds.length], true, `${i + 1}.ª Milicia de ${n.name}`);
    u.training = 0.45; u.equipment = 0.6; u.experience = 0;
  }
  if (hostile) {
    n.politics.politicalCapital = 100;
    const w = declareWar(sim, parent, n, 'conquest', provinceIds);
    if (w.war) { w.war.name = `Guerra de independencia de ${n.name}`; w.war.goal.kind = 'independence'; }
  } else {
    relation(sim.state, n.id, parent.id).recognized = true;
  }
  return n;
}

/** Meses consecutivos (netos) de Estado fallido que desencadenan el colapso. */
export const COLLAPSE_MONTHS = 6;

/**
 * Colapso estatal: el Estado se fragmenta. Cada región de minoría con malestar forma un Estado propio;
 * si no hay minorías, se separa el bloque contiguo de provincias más alejado de la capital. El resto
 * del país sufre un cambio de régimen. Los sucesores son Estados completos (createCountry).
 */
export function stateCollapse(sim: Sim, c: CountryState): CountryState[] {
  const st = sim.state;
  const owned = Object.values(st.provinces).filter((p) => p.owner === c.id && p.controller === c.id);
  const all = Object.values(st.provinces).filter((p) => p.owner === c.id);
  c.cooldowns.failingMonths = 0;
  if (all.length < 3) return [];
  const groups: string[][] = [];
  const byCulture = new Map<string, string[]>();
  for (const p of owned) if (p.culture !== c.culture && p.id !== c.capital) { const l = byCulture.get(p.culture) ?? []; l.push(p.id); byCulture.set(p.culture, l); }
  // solo se separan las regiones inquietas (malestar medio > 0,35); si ninguna lo está, la más inquieta
  const unrestOf = (ids: string[]) => { let u = 0, w = 0; for (const id of ids) { const p = st.provinces[id]; u += p.unrest * p.pop; w += p.pop; } return w > 0 ? u / w : 0; };
  const minorities = [...byCulture.entries()].map(([k, ids]) => ({ k, ids, u: unrestOf(ids) })).sort((a, b) => b.u - a.u || (a.k < b.k ? -1 : 1));
  const restless = minorities.filter((m) => m.u > 0.35);
  for (const m of restless.length ? restless : minorities.slice(0, 1)) groups.push(m.ids);
  if (!groups.length) {
    // bloque periférico: búsqueda en anchura desde la capital; se separa la región más lejana y contigua
    const dist = new Map<string, number>([[c.capital, 0]]);
    const queue = [c.capital];
    const mine = new Set(owned.map((p) => p.id));
    while (queue.length) {
      const id = queue.shift()!;
      for (const l of sim.idx.provinces.get(id)!.neighbors) if (mine.has(l.to) && !dist.has(l.to)) { dist.set(l.to, dist.get(id)! + 1); queue.push(l.to); }
    }
    const far = [...dist.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    if (far && far[1] > 0) {
      const target = Math.max(1, Math.floor(all.length / 3));
      const block = [far[0]];
      const inBlock = new Set(block);
      for (let i = 0; i < block.length && block.length < target; i++) {
        for (const l of sim.idx.provinces.get(block[i])!.neighbors) {
          if (block.length >= target) break;
          if (mine.has(l.to) && !inBlock.has(l.to) && l.to !== c.capital && (dist.get(l.to) ?? 0) >= far[1] / 2) { block.push(l.to); inBlock.add(l.to); }
        }
      }
      groups.push(block);
    }
  }
  const created: CountryState[] = [];
  let remaining = all.length;
  for (const g of groups) {
    const ids = g.filter((id) => st.provinces[id].owner === c.id);
    if (!ids.length || ids.length >= remaining) continue;
    const n = createCountry(sim, c, ids, { reason: `Surgió del colapso del Estado ${c.adjective}.`, hostile: false, regime: sim.rng.chance(0.5) ? 'presidential_republic' : 'military_junta' });
    if (!n) continue;
    remaining -= ids.length;
    relation(st, n.id, c.id).recognized = true;
    n.history[0] = `Se separó de ${c.name} durante su colapso, el ${formatDate(sim.day)}.`;
    for (let i = 0; i < Math.min(3, ids.length); i++) { const u = createUnit(sim, n, 'infantry', ids[i], true, `${i + 1}.ª Guardia de ${n.name}`); u.training = 0.4; u.equipment = 0.5; }
    created.push(n);
  }
  if (!created.length) return created;
  // el Estado remanente: cambio de régimen y reconstrucción
  const prev = c.regime;
  const next = isDemocratic(prev) ? 'military_junta' : 'presidential_republic';
  c.laws.regime = next;
  applyRegimeChange(sim, c, prev, next, true);
  sim.invalidateParams(c.id);
  for (const g of Object.values(c.groups)) g.radical *= 0.5;
  c.politics.legitimacy = 35; c.politics.stability = 30; c.politics.protest *= 0.5;
  c.history.push(`Colapso estatal el ${formatDate(sim.day)}: se separaron ${created.map((n) => n.name).join(', ')}.`);
  sim.emit('state_collapse', 'world', 'critical', [c.id, ...created.map((n) => n.id)], `Colapso de ${c.longName}`,
    `El Estado ${c.adjective} se fragmenta: nacen ${created.map((n) => n.name).join(', ')}. Lo que queda de ${c.name} pasa a ser ${next === 'military_junta' ? 'una junta militar' : 'una república presidencial'}.`);
  return created;
}

/** Comprobaciones mensuales por país (escalonadas para repartir la carga). */
export function countryEventsStep(sim: Sim, c: CountryState): void {
  const pol = c.politics, lp = sim.params(c), e = c.econ;
  const r = sim.rng;
  const cd = c.cooldowns;
  const ready = (key: string, days: number) => (cd[`ev_${key}`] ?? -99999) < sim.day - days;
  const mark = (key: string) => { cd[`ev_${key}`] = sim.day; };

  // protestas masivas
  if (pol.protest > 0.45 && ready('protests', 180) && r.chance(0.5)) { mark('protests'); addDecision(sim, c, 'mass_protests'); sim.emit('protests', 'world', 'major', [c.id], `Protestas masivas en ${c.name}`, 'Decenas de miles de personas se manifiestan contra el gobierno.'); }
  if (pol.strikes > 0.5 && ready('strike', 150) && r.chance(0.5)) { mark('strike'); sim.emit('general_strike', 'world', 'major', [c.id], `Huelga general en ${c.name}`, 'Los sindicatos paralizan la industria y el transporte.'); }
  // crisis bancaria
  if (e.bankStress > 0.5 && ready('bank', 360) && r.chance(0.4 * e.bankStress)) { mark('bank'); e.outputGap -= 0.03; addDecision(sim, c, 'banking_crisis'); sim.emit('banking_crisis', 'world', 'critical', [c.id], `Crisis bancaria en ${c.name}`, 'Corridas bancarias y colapso del crédito.'); }
  // hiperinflación
  if (e.inflation > 1 && ready('hyper', 360)) { mark('hyper'); addDecision(sim, c, 'stabilization'); sim.emit('hyperinflation', 'world', 'critical', [c.id], `Hiperinflación en ${c.name}`, `La inflación anual supera el ${(e.inflation * 100).toFixed(0)} %.`); }
  // escándalos
  if (pol.corruption > 45 && lp.pressFreedom > 0.4 && ready('scandal', 540) && r.chance(0.08 * pol.corruption / 50)) { mark('scandal'); addDecision(sim, c, 'corruption_scandal'); }
  // default forzoso
  const ngdp = nominalGDP(c);
  if (!c.fiscal.inDefault && c.fiscal.arrears > 0.06 * ngdp && ready('default', 720)) { mark('default'); declareDefault(sim, c, 'Incapaz de pagar, el gobierno suspende el pago de su deuda.'); }
  // golpe de Estado
  if (pol.coupRisk > 0.55 && ready('coup', 720) && r.chance(0.05 * pol.coupRisk * pol.coupRisk)) {
    mark('coup');
    const success = r.chance(clamp(0.3 + (40 - c.groups.military.sat) / 60 + (40 - pol.legitimacy) / 80, 0.05, 0.9));
    if (success && c.regime !== 'military_junta') {
      const prev = c.regime;
      c.laws.regime = 'military_junta';
      applyRegimeChange(sim, c, prev, 'military_junta', true);
      c.laws.press = 'licensed'; c.laws.assembly = 'permit'; c.laws.police = 'extensive';
      sim.invalidateParams(c.id);
      pol.legitimacy = 30; c.groups.military.sat = 75;
      sim.emit('coup', 'world', 'critical', [c.id], `Golpe de Estado en ${c.name}`, 'Las fuerzas armadas toman el poder y suspenden la constitución.');
    } else {
      pol.legitimacy += 5; c.groups.military.sat -= 10;
      sim.emit('coup_failed', 'world', 'major', [c.id], `Fracasa un intento de golpe en ${c.name}`, 'Los conspiradores son arrestados.');
    }
  }
  // revolución
  const avgRad = Object.values(c.groups).reduce((a, g) => a + g.radical * g.size, 0) / Math.max(0.01, Object.values(c.groups).reduce((a, g) => a + g.size, 0));
  if (pol.stability < 18 && avgRad > 0.45 && pol.approval < 30 && ready('revolution', 1080) && r.chance(0.06)) {
    mark('revolution');
    const prev = c.regime;
    const workers = c.groups.workers.radical * c.groups.workers.size, religious = c.groups.religious.radical * c.groups.religious.size;
    const next = isDemocratic(prev) ? (workers > religious ? 'one_party_state' : 'theocracy') : 'presidential_republic';
    c.laws.regime = next;
    applyRegimeChange(sim, c, prev, next, true);
    for (const g of Object.values(c.groups)) g.radical *= 0.4;
    pol.legitimacy = 50; pol.stability = 35;
    sim.emit('revolution', 'world', 'critical', [c.id], `Revolución en ${c.name}`, `Cae el régimen. ${c.name} es ahora: ${next.replace(/_/g, ' ')}.`);
  }
  // transición de juntas
  if (c.regime === 'military_junta' && pol.legitimacy < 30 && pol.protest > 0.3 && ready('transition', 720) && r.chance(0.3)) { mark('transition'); addDecision(sim, c, 'junta_transition'); }
  // separatismo
  const minorityCultures = new Map<string, { unrest: number; pop: number; provs: string[] }>();
  for (const p of Object.values(sim.state.provinces)) {
    if (p.owner !== c.id || p.culture === c.culture) continue;
    const m = minorityCultures.get(p.culture) ?? { unrest: 0, pop: 0, provs: [] };
    m.unrest += p.unrest * p.pop; m.pop += p.pop; m.provs.push(p.id);
    minorityCultures.set(p.culture, m);
  }
  for (const [culture, m] of minorityCultures) {
    const u = m.pop > 0 ? m.unrest / m.pop : 0;
    const region = sim.map.cultures.find((x) => x.id === culture)?.name ?? culture;
    if (u > 0.55 && ready(`sep_${culture}`, 360) && r.chance(0.4)) { mark(`sep_${culture}`); addDecision(sim, c, 'separatist_crisis', { culture, region }); }
    const ownerProvinces = Object.values(sim.state.provinces).filter((p) => p.owner === c.id).length;
    if (u > 0.72 && c.groups.minorities.radical > 0.45 && m.provs.length < ownerProvinces && ready(`indep_${culture}`, 1080) && r.chance(0.12)) {
      mark(`indep_${culture}`);
      const provs = m.provs.filter((id) => sim.state.provinces[id].unrest > 0.5 && sim.state.provinces[id].controller === c.id);
      if (provs.length) independence(sim, c, provs, true);
    }
  }
  // Estado fallido: meses sostenidos de ingobernabilidad terminan en fragmentación
  const failing = pol.stability < 12 && pol.legitimacy < 22 && (c.fiscal.inDefault || avgRad > 0.5 || c.military.warExhaustion > 0.6 || e.foodShortage > 0.25);
  cd.failingMonths = failing ? (cd.failingMonths ?? 0) + 1 : Math.max(0, (cd.failingMonths ?? 0) - 1);
  if (cd.failingMonths === 3 && ready('failing', 360)) { mark('failing'); sim.emit('state_failing', 'world', 'critical', [c.id], `${c.name} al borde del colapso`, 'El gobierno central pierde el control de varias regiones; las autoridades locales actúan por su cuenta.'); }
  if (cd.failingMonths >= COLLAPSE_MONTHS && (!sim.isHuman(c.id) || sim.isOnline(c.id))) stateCollapse(sim, c);
  // hambruna
  if (e.foodShortage > 0.2 && ready('famine', 360)) { mark('famine'); sim.emit('famine', 'world', 'critical', [c.id], `Hambruna en ${c.name}`, 'La escasez de alimentos provoca muertes y desplazamientos.'); }
  // catástrofes naturales (por provincia, raras)
  if (ready('disaster', 200) && r.chance(0.05)) {
    const provs = Object.values(sim.state.provinces).filter((p) => p.owner === c.id);
    const p = r.pick(provs);
    const ps = sim.idx.provinces.get(p.id)!;
    let kind: string | null = null;
    if ((ps.terrain === TERRAIN.MOUNTAINS || ps.terrain === TERRAIN.HILLS) && r.chance(0.5)) kind = 'Terremoto';
    else if (ps.river && r.chance(0.5)) kind = 'Inundaciones';
    else if (ps.climate === 'tropical' && ps.coastal && r.chance(0.5)) kind = 'Huracán';
    else if (ps.climate === 'arid' || ps.terrain === TERRAIN.STEPPE) kind = 'Sequía';
    if (kind) {
      mark('disaster');
      const sev = r.range(0.05, 0.2);
      p.devastation = Math.min(1, p.devastation + sev);
      for (let i = 0; i < p.capital.length; i++) p.capital[i] *= 1 - sev * 0.4;
      const deaths = p.pop * sev * 0.004;
      p.pop -= deaths;
      c.demography.adult = Math.max(0.001, c.demography.adult - deaths * 0.7);
      c.demography.young = Math.max(0.001, c.demography.young - deaths * 0.3);
      if (kind === 'Sequía') c.econ.sectors.agriculture.output *= 0.9;
      sim.emit('disaster', 'world', 'major', [c.id], `${kind} en ${ps.name} (${c.name})`, `Daños estimados: ${(sev * 100).toFixed(0)} % de la infraestructura local. Víctimas: ${Math.round(deaths * 1e6).toLocaleString('es')}.`, { province: p.id });
    }
  }
  // la devastación se repara lentamente
  for (const p of Object.values(sim.state.provinces)) if (p.owner === c.id && p.devastation > 0) p.devastation = Math.max(0, p.devastation - 0.01 * (0.5 + c.stocks.infrastructure));
  void population;
}

export function declareDefault(sim: Sim, c: CountryState, text: string): void {
  if (c.fiscal.inDefault) return;
  c.fiscal.inDefault = true;
  c.fiscal.defaultSinceDay = sim.day;
  c.fiscal.defaultsHistory += 1;
  c.fiscal.arrears = 0;
  c.cooldowns.confidenceShock = (c.cooldowns.confidenceShock ?? 0) - 25;
  c.econ.bankStress = Math.min(1, c.econ.bankStress + 0.3);
  // los acreedores bilaterales se resienten
  for (const t of Object.values(sim.state.treaties)) {
    if (t.status === 'active' && t.type === 'loan' && t.parties.includes(c.id) && t.terms.lender && t.terms.lender !== c.id) relation(sim.state, c.id, t.terms.lender).opinion -= 25;
  }
  sim.emit('default', 'world', 'critical', [c.id], `${c.name} declara el default de su deuda`, text);
}

/** Restructuración: quita sobre la deuda a cambio de reputación. */
export function restructureDebt(sim: Sim, c: CountryState, haircut: number): { ok: boolean; error?: string } {
  if (!c.fiscal.inDefault && haircut > 0.1) return { ok: false, error: 'Solo un país en default puede imponer una quita mayor al 10 %.' };
  const h = clamp(haircut, 0, 0.8);
  c.fiscal.debtDomestic *= 1 - h * 0.6;
  c.fiscal.debtForeign *= 1 - h;
  c.fiscal.inDefault = false;
  c.fiscal.defaultSinceDay = null;
  c.econ.riskPremium = Math.max(c.econ.riskPremium, 0.04 + h * 0.15);
  c.groups.pensioners.sat -= 10 * h;
  c.groups.middle.sat -= 8 * h;
  sim.emit('restructuring', 'world', 'major', [c.id], `${c.name} reestructura su deuda`, `Quita del ${(h * 100).toFixed(0)} % sobre la deuda externa. Los mercados reabren con una prima de riesgo elevada.`);
  return { ok: true };
}

/** Eventos mundiales: precios de materias primas extremos. */
export function worldEventsStep(sim: Sim): void {
  const oil = sim.state.markets.oil;
  const cd = (sim.state as unknown as { _oilNews?: number });
  void cd;
  if (oil.price > 1.8 && !sim.state.recentEvents.some((e) => e.type === 'oil_shock' && sim.day - e.day < 360)) {
    sim.emit('oil_shock', 'world', 'critical', [], 'Crisis del petróleo', `El precio del crudo alcanza ${(oil.price * 100).toFixed(0)} % de su nivel de 1990. Los importadores sufren; los exportadores se enriquecen.`);
  }
  if (oil.price < 0.55 && !sim.state.recentEvents.some((e) => e.type === 'oil_glut' && sim.day - e.day < 360)) {
    sim.emit('oil_glut', 'world', 'major', [], 'Desplome del petróleo', `El exceso de oferta hunde el precio del crudo a ${(oil.price * 100).toFixed(0)} % de su nivel de 1990.`);
  }
  const food = sim.state.markets.food;
  if (food.price > 1.6 && !sim.state.recentEvents.some((e) => e.type === 'food_crisis' && sim.day - e.day < 360)) {
    sim.emit('food_crisis', 'world', 'critical', [], 'Crisis alimentaria mundial', 'Los precios de los alimentos se disparan.');
  }
}
