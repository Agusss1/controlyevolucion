import type { CountryState, CountryId, Proposal, Treaty, TreatyTerms, TreatyType } from '@cyo/shared';
import { clamp, approach } from '../rng.js';
import { Sim, relation, hasTreaty, activeTreaties, sharedOrganizations, warBetween, atWar } from './context.js';
import { nominalGDP } from './economy.js';
import { dimDistance } from '../data/politics.js';
import { endWar, breakTreaty, joinWar } from './military.js';
import { transferProvinces, killCountry } from './states.js';
import { TREATY_NAMES } from '../scenario/initialState.js';
import type { LawParams } from '../data/laws.js';

/**
 * DIPLOMACIA ASÍNCRONA.
 * Las propuestas quedan pendientes hasta que el destinatario (humano o IA) responde, sin
 * necesidad de que ambos estén conectados. Los tratados generan obligaciones reales (aranceles,
 * transferencias, pagos de préstamos, llamadas a las armas, acceso militar, cesiones) y
 * romperlos tiene coste diplomático.
 */

export const PROPOSAL_DAYS = 45;

export function govIdeology(c: CountryState) {
  const p = c.parties.find((x) => x.id === c.politics.governmentParties[0]);
  return p?.pos ?? { econ: 0, welfare: 0, authority: 0, social: 0, nation: 0, central: 0 };
}

export function validateProposal(sim: Sim, from: CountryState, to: CountryState, type: TreatyType, terms: TreatyTerms, excludeProposal: string | null = null): string | null {
  const st = sim.state;
  if (from.id === to.id) return 'No se puede proponer un tratado a sí mismo.';
  if (!to.alive) return 'El destinatario no existe.';
  const pending = Object.values(st.proposals).filter((p) => p.id !== excludeProposal && p.status === 'pending' && p.from === from.id && p.to === to.id && p.type === type);
  if (pending.length) return 'Ya hay una propuesta igual pendiente.';
  const war = warBetween(st, from.id, to.id);
  const peaceTypes: TreatyType[] = ['peace', 'ceasefire', 'mediation'];
  if (war && !peaceTypes.includes(type)) return 'En guerra solo se puede negociar la paz o un alto el fuego.';
  if (peaceTypes.includes(type) && type !== 'mediation' && !war) return 'No hay guerra entre ambos países.';
  const permanent: TreatyType[] = ['trade_agreement', 'non_aggression', 'defensive_alliance', 'military_alliance', 'energy_agreement', 'science_cooperation', 'customs_union', 'migration_cooperation', 'military_access'];
  if (permanent.includes(type) && hasTreaty(st, from.id, to.id, type)) return 'Ese tratado ya está vigente.';
  const lpF = sim.params(from), lpT = sim.params(to);
  if ((type === 'military_alliance' || type === 'defensive_alliance') && (lpF.militaryPosture < 0.2 || lpT.militaryPosture < 0.2)) return 'Un país neutral no puede firmar alianzas militares.';
  if (type === 'economic_aid' || type === 'loan') {
    const amount = (terms.amount ?? 0) + (terms.monthly ?? 0) * (terms.months ?? 12);
    if (amount <= 0) return 'Indique un monto.';
    const cost = amount * from.econ.priceLevel * from.econ.baseExchangeRate;
    if (terms.amount && cost > from.fiscal.treasury) return 'El Tesoro no tiene fondos suficientes para ese desembolso inicial.';
  }
  if (type === 'territorial_cession' || type === 'peace') {
    for (const pid of terms.provinces ?? []) {
      const p = st.provinces[pid];
      if (!p) return 'Provincia inexistente.';
      const giver = terms.provincesTo === from.id ? to.id : from.id;
      if (p.owner !== giver && !(type === 'peace' && war && war.participants.some((x) => x.country === p.owner))) return `La provincia ${pid} no pertenece a la parte que la cede.`;
    }
  }
  if (type === 'peace' && war && !war.participants.some((p) => p.country === to.id && p.leader) && !war.participants.some((p) => p.country === from.id && p.leader)) return 'La paz debe negociarse con un líder de la guerra.';
  if (type === 'unification' && from.culture !== to.culture) return 'Solo pueden unificarse Estados de la misma cultura.';
  if (type === 'join_organization') {
    const org = st.organizations[terms.organization ?? ''];
    if (!org || !org.active) return 'Organización inexistente.';
    if (!org.members.includes(from.id)) return 'Solo un miembro puede invitar.';
    if (org.members.includes(to.id)) return 'Ya es miembro.';
    if (org.mutualDefense && sim.params(to).militaryPosture < 0.2) return 'Un país neutral no puede integrar una alianza militar.';
  }
  if (type === 'recognition' && !terms.recognize) terms.recognize = from.id;
  void lpF; void lpT;
  return null;
}

export function createProposal(sim: Sim, from: CountryState, to: CountryState, type: TreatyType, terms: TreatyTerms, message: string, counterOf: string | null = null): { ok: boolean; error?: string; proposal?: Proposal } {
  const err = validateProposal(sim, from, to, type, terms);
  if (err) return { ok: false, error: err };
  const p: Proposal = { id: sim.nextId('PR'), from: from.id, to: to.id, type, terms: { ...terms, warId: terms.warId ?? warBetween(sim.state, from.id, to.id)?.id }, message, createdDay: sim.day, expiresDay: sim.day + PROPOSAL_DAYS, status: 'pending', counterOf, resolvedDay: null };
  sim.state.proposals[p.id] = p;
  sim.emit('proposal', 'private', 'info', [from.id, to.id], `Propuesta diplomática de ${from.name}`, `${from.name} propone a ${to.name}: ${TREATY_NAMES[type] ?? type}.`, { data: { proposal: p.id } });
  return { ok: true, proposal: p };
}

export function respondProposal(sim: Sim, responder: CountryState, proposalId: string, response: 'accept' | 'reject', counter?: TreatyTerms): { ok: boolean; error?: string } {
  const p = sim.state.proposals[proposalId];
  if (!p || p.to !== responder.id) return { ok: false, error: 'Propuesta inexistente.' };
  if (p.status !== 'pending') return { ok: false, error: 'La propuesta ya fue resuelta.' };
  const from = sim.state.countries[p.from];
  if (!from?.alive) { p.status = 'withdrawn'; return { ok: false, error: 'El proponente ya no existe.' }; }
  p.resolvedDay = sim.day;
  if (response === 'reject') {
    if (counter) {
      p.status = 'countered';
      const res = createProposal(sim, responder, from, p.type, { ...p.terms, ...counter }, 'Contrapropuesta', p.id);
      if (!res.ok) { p.status = 'pending'; p.resolvedDay = null; return { ok: false, error: res.error }; }
      return { ok: true };
    }
    p.status = 'rejected';
    relation(sim.state, p.from, p.to).opinion -= 2;
    sim.emit('proposal_rejected', 'private', 'info', [p.from, p.to], `${responder.name} rechaza la propuesta`, `${TREATY_NAMES[p.type] ?? p.type} rechazado.`);
    return { ok: true };
  }
  const err = validateProposal(sim, from, responder, p.type, p.terms, p.id);
  if (err && !(p.type === 'peace' || p.type === 'ceasefire')) { p.status = 'expired'; return { ok: false, error: `La propuesta ya no es válida: ${err}` }; }
  p.status = 'accepted';
  applyAgreement(sim, from, responder, p.type, p.terms);
  return { ok: true };
}

function makeTreaty(sim: Sim, type: TreatyType, parties: CountryId[], terms: TreatyTerms, expiresDay: number | null = null, name?: string): Treaty {
  const t: Treaty = {
    id: sim.nextId('T'), type, name: name ?? `${TREATY_NAMES[type] ?? type} ${parties.map((p) => sim.state.countries[p]?.name).join('-')}`,
    parties, terms, signedDay: sim.day, expiresDay, status: 'active', endedDay: null, brokenBy: null
  };
  sim.state.treaties[t.id] = t;
  return t;
}

export function applyAgreement(sim: Sim, a: CountryState, b: CountryState, type: TreatyType, terms: TreatyTerms): void {
  const st = sim.state;
  const r = relation(st, a.id, b.id);
  r.opinion = clamp(r.opinion + 8, -100, 100);
  r.trust = clamp(r.trust + 4, 0, 100);
  switch (type) {
    case 'economic_aid': {
      const t = makeTreaty(sim, type, [a.id, b.id], { ...terms, lender: a.id }, terms.months ? sim.day + terms.months * 30 : null);
      if (terms.amount) transfer(sim, a, b, terms.amount, 'aid');
      r.opinion = clamp(r.opinion + 10, -100, 100);
      void t;
      break;
    }
    case 'loan': {
      const amount = terms.amount ?? 0;
      makeTreaty(sim, type, [a.id, b.id], { ...terms, lender: a.id, outstanding: amount, rate: terms.rate ?? 0.05, years: terms.years ?? 10 }, sim.day + (terms.years ?? 10) * 360);
      transfer(sim, a, b, amount, 'loan');
      // el préstamo es deuda externa del receptor (UMI)
      b.fiscal.debtForeign += amount;
      break;
    }
    case 'peace': applyPeace(sim, a, b, terms); break;
    case 'ceasefire': {
      const war = warBetween(st, a.id, b.id);
      if (war) { war.status = 'ceasefire'; for (const btl of Object.values(st.battles)) if (btl.warId === war.id && btl.status !== 'ended') btl.status = 'ended'; }
      makeTreaty(sim, 'ceasefire', [a.id, b.id], terms, sim.day + (terms.months ?? 6) * 30);
      sim.emit('ceasefire', 'world', 'major', [a.id, b.id], `Alto el fuego entre ${a.name} y ${b.name}`, 'Las operaciones militares se suspenden mientras se negocia la paz.');
      break;
    }
    case 'territorial_cession': {
      const to = terms.provincesTo === a.id ? a : b;
      transferProvinces(sim, terms.provinces ?? [], to.id, 'Cesión territorial pactada');
      makeTreaty(sim, type, [a.id, b.id], terms);
      break;
    }
    case 'unification': unify(sim, a, b); break;
    case 'recognition': {
      r.recognized = true;
      r.embassies = true;
      makeTreaty(sim, type, [a.id, b.id], terms);
      sim.emit('recognition', 'world', 'minor', [a.id, b.id], `${b.name} y ${a.name} se reconocen mutuamente`, 'Se establecen relaciones diplomáticas plenas.');
      break;
    }
    case 'debt_relief': {
      const share = clamp(terms.share ?? 0.3, 0, 1);
      const debtor = b;
      // condona la deuda bilateral pendiente con el acreedor
      for (const t of activeTreaties(st, a.id, b.id, 'loan')) {
        const forgiven = (t.terms.outstanding ?? 0) * share;
        t.terms.outstanding = (t.terms.outstanding ?? 0) - forgiven;
        debtor.fiscal.debtForeign = Math.max(0, debtor.fiscal.debtForeign - forgiven);
      }
      makeTreaty(sim, type, [a.id, b.id], terms);
      break;
    }
    case 'mediation': {
      // el mediador acerca a las partes: crea una propuesta de alto el fuego con mejor disposición
      const war = Object.values(st.wars).find((w) => w.status !== 'ended' && w.participants.some((p) => p.country === b.id && p.leader));
      if (war) {
        const enemy = war.participants.find((p) => p.leader && p.country !== b.id)!.country;
        relation(st, b.id, enemy).opinion += 15;
        createProposal(sim, b, st.countries[enemy], 'ceasefire', { months: 6, mediator: a.id, warId: war.id }, `Propuesta mediada por ${a.name}`);
      }
      break;
    }
    case 'join_organization': {
      const org = st.organizations[terms.organization ?? ''];
      if (org && !org.members.includes(b.id)) {
        org.members.push(b.id);
        sim.emit('org_join', 'world', 'minor', [b.id], `${b.name} ingresa en ${org.name}`, `${org.members.length} miembros.`);
      }
      break;
    }
    default: {
      makeTreaty(sim, type, [a.id, b.id], terms, terms.years ? sim.day + terms.years * 360 : null);
      sim.emit('treaty', 'world', type.includes('alliance') ? 'major' : 'minor', [a.id, b.id], `${a.name} y ${b.name} firman: ${TREATY_NAMES[type] ?? type}`, '');
    }
  }
}

/** Transferencia de fondos entre tesoros (monto en UMI de 1990). */
export function transfer(sim: Sim, from: CountryState, to: CountryState, umi: number, kind: 'aid' | 'loan' | 'reparations' | 'repayment'): number {
  const costFrom = umi * from.econ.priceLevel * from.econ.baseExchangeRate;
  const pay = Math.min(costFrom, Math.max(0, from.fiscal.treasury));
  const paidUMI = pay / (from.econ.priceLevel * from.econ.baseExchangeRate);
  from.fiscal.treasury -= pay;
  from.fiscal.ledger.aid -= pay;
  const gain = paidUMI * to.econ.priceLevel * to.econ.baseExchangeRate;
  to.fiscal.treasury += gain;
  to.fiscal.ledger.aid += gain;
  // flujo de divisas en balanza de pagos
  to.cooldowns.aidFlow = (to.cooldowns.aidFlow ?? 0) + paidUMI;
  from.cooldowns.aidFlow = (from.cooldowns.aidFlow ?? 0) - paidUMI;
  void kind;
  return paidUMI;
}

export function applyPeace(sim: Sim, a: CountryState, b: CountryState, terms: TreatyTerms): void {
  const st = sim.state;
  const war = (terms.warId && st.wars[terms.warId]) || warBetween(st, a.id, b.id);
  if (!war) return;
  const leaders = war.participants.filter((p) => p.leader).map((p) => p.country);
  const separate = !(leaders.includes(a.id) && leaders.includes(b.id));
  if (terms.provinces?.length) {
    const to = terms.provincesTo ?? a.id;
    transferProvinces(sim, terms.provinces, to, 'Tratado de paz');
  }
  if (terms.reparations && terms.reparations > 0) {
    const payer = terms.provincesTo === b.id ? a : b;
    const receiver = payer.id === a.id ? b : a;
    makeTreaty(sim, 'economic_aid', [payer.id, receiver.id], { monthly: terms.reparations / 120, months: 120, lender: payer.id }, sim.day + 3600, `Reparaciones de guerra de ${payer.name} a ${receiver.name}`);
  }
  if (terms.demilitarized?.length) {
    for (const pid of terms.demilitarized) for (const u of Object.values(st.units)) if (u.location === pid && u.domain === 'land') { const owner = st.countries[u.owner]; if (owner) { u.location = owner.capital; u.path = []; } }
    makeTreaty(sim, 'peace', [a.id, b.id], { demilitarized: terms.demilitarized }, null, `Zona desmilitarizada ${a.name}-${b.name}`);
  }
  if (terms.recognize) {
    const r = relation(st, a.id, b.id);
    r.recognized = true;
  }
  const truce = terms.truceYears ?? 5;
  if (truce > 0) makeTreaty(sim, 'non_aggression', [a.id, b.id], { years: truce }, sim.day + truce * 360, `Tregua ${a.name}-${b.name}`);
  makeTreaty(sim, 'peace', [a.id, b.id], terms, null, `Paz de ${sim.idx.provinces.get(a.capital)?.cityName ?? a.name}`);
  const r = relation(st, a.id, b.id);
  r.opinion = Math.max(r.opinion, -30);
  r.embassies = true;
  if (separate) {
    const leaving = leaders.includes(a.id) ? b : a;
    war.participants = war.participants.filter((p) => p.country !== leaving.id);
    sim.emit('separate_peace', 'world', 'major', [a.id, b.id], `${leaving.name} firma una paz separada`, `${leaving.name} abandona la ${war.name}.`);
    for (const p of Object.values(st.provinces)) if (p.owner === leaving.id && p.controller !== leaving.id && war.participants.some((x) => x.country === p.controller)) p.controller = leaving.id;
  } else {
    const loser = war.warscore >= 0 ? war.defender : war.attacker;
    endWar(sim, war, `Tratado de paz firmado. ${terms.provinces?.length ? `Se transfieren ${terms.provinces.length} provincias.` : 'Sin cambios territoriales.'}`);
    const lc = st.countries[loser];
    if (lc && (terms.provinces?.length ?? 0) > 0) lc.cooldowns.lostWar = 1;
  }
}

export function unify(sim: Sim, a: CountryState, b: CountryState): void {
  const st = sim.state;
  // el Estado mayor absorbe al menor; el resultado conserva el identificador del mayor
  const [big, small] = a.econ.realGDP >= b.econ.realGDP ? [a, b] : [b, a];
  const provs = Object.values(st.provinces).filter((p) => p.owner === small.id).map((p) => p.id);
  for (const u of Object.values(st.units)) if (u.owner === small.id) u.owner = big.id;
  for (const k of ['arms', 'vehicles', 'aircraft', 'ships'] as const) big.military.equipment[k] += small.military.equipment[k];
  const treasuryReal = small.fiscal.treasury / (small.econ.priceLevel * small.econ.baseExchangeRate);
  big.fiscal.treasury += treasuryReal * big.econ.priceLevel * big.econ.baseExchangeRate;
  small.fiscal.treasury = 0;
  big.fiscal.debtForeign += small.fiscal.debtForeign;
  big.fiscal.debtDomestic += small.fiscal.debtDomestic / (small.econ.priceLevel * small.econ.baseExchangeRate) * big.econ.priceLevel * big.econ.baseExchangeRate;
  small.fiscal.debtForeign = 0; small.fiscal.debtDomestic = 0;
  // la unificación cierra cualquier conflicto pendiente entre ambos
  const war = warBetween(st, a.id, b.id);
  if (war) endWar(sim, war, 'Unificación nacional.');
  transferProvinces(sim, provs, big.id, 'Unificación');
  if (small.alive) killCountry(sim, small, big.id, `${small.longName} se integra en ${big.longName}.`);
  big.history.push(`Unificado con ${small.name} el día ${sim.day}.`);
  sim.emit('unification', 'world', 'critical', [big.id, small.id], `Unificación: ${small.name} se integra en ${big.name}`, `Nace un Estado ampliado con ${provs.length} provincias adicionales.`);
}

// ---------------------------------------------------------------------------
// Acciones unilaterales
// ---------------------------------------------------------------------------

export function diploAction(sim: Sim, c: CountryState, target: CountryState, action: string): { ok: boolean; error?: string } {
  const st = sim.state;
  if (c.id === target.id) return { ok: false, error: 'Acción inválida.' };
  const r = relation(st, c.id, target.id);
  switch (action) {
    case 'sanction':
      if (r.sanctions.includes(c.id)) return { ok: false, error: 'Ya hay sanciones vigentes.' };
      r.sanctions.push(c.id);
      r.opinion = clamp(r.opinion - 25, -100, 100);
      for (const t of activeTreaties(st, c.id, target.id)) if (t.type === 'trade_agreement' || t.type === 'customs_union') breakTreaty(sim, t.id, c.id);
      sim.emit('sanctions', 'world', 'major', [c.id, target.id], `${c.name} sanciona a ${target.name}`, 'Se restringe el comercio bilateral.');
      return { ok: true };
    case 'lift_sanctions':
      r.sanctions = r.sanctions.filter((s) => s !== c.id);
      r.opinion = clamp(r.opinion + 10, -100, 100);
      sim.emit('sanctions_lifted', 'world', 'minor', [c.id, target.id], `${c.name} levanta sanciones a ${target.name}`, '');
      return { ok: true };
    case 'recall_ambassador':
      if (!r.embassies) return { ok: false, error: 'No hay relaciones diplomáticas.' };
      r.embassies = false;
      r.opinion = clamp(r.opinion - 15, -100, 100);
      sim.emit('ambassador_recalled', 'world', 'minor', [c.id, target.id], `${c.name} retira su embajador de ${target.name}`, '');
      return { ok: true };
    case 'restore_embassy':
      if (r.embassies) return { ok: false, error: 'Ya hay embajadas.' };
      if (atWar(st, c.id, target.id)) return { ok: false, error: 'En guerra no hay embajadas.' };
      r.embassies = true;
      r.opinion = clamp(r.opinion + 5, -100, 100);
      return { ok: true };
    case 'recognize':
      if (r.recognized) return { ok: false, error: 'Ya reconocido.' };
      r.recognized = true;
      r.opinion = clamp(r.opinion + 15, -100, 100);
      sim.emit('recognition', 'world', 'minor', [c.id, target.id], `${c.name} reconoce a ${target.name}`, '');
      return { ok: true };
    case 'withdraw_recognition':
      r.recognized = false;
      r.embassies = false;
      r.opinion = clamp(r.opinion - 30, -100, 100);
      return { ok: true };
    case 'improve_relations': {
      const cost = 0.002 * nominalGDP(c);
      if (c.politics.politicalCapital < 5 || c.fiscal.treasury < cost) return { ok: false, error: 'Faltan capital político o fondos.' };
      if ((c.cooldowns[`improve_${target.id}`] ?? -999) > sim.day - 30) return { ok: false, error: 'Ya hay una campaña diplomática en curso (espere 30 días).' };
      c.cooldowns[`improve_${target.id}`] = sim.day;
      c.politics.politicalCapital -= 5;
      c.fiscal.treasury -= cost;
      c.fiscal.ledger.extraordinary -= cost;
      r.opinion = clamp(r.opinion + 6 + 6 * (c.stocks.intelligence), -100, 100);
      r.trust = clamp(r.trust + 2, 0, 100);
      return { ok: true };
    }
    case 'denounce':
      r.opinion = clamp(r.opinion - 15, -100, 100);
      c.groups.military.sat += 2;
      sim.emit('denounce', 'world', 'minor', [c.id, target.id], `${c.name} denuncia públicamente a ${target.name}`, '');
      return { ok: true };
  }
  return { ok: false, error: 'Acción desconocida.' };
}

export function cancelTreaty(sim: Sim, c: CountryState, treatyId: string): { ok: boolean; error?: string } {
  const t = sim.state.treaties[treatyId];
  if (!t || !t.parties.includes(c.id) || t.status !== 'active') return { ok: false, error: 'Tratado inexistente.' };
  // denuncia formal: menor coste que la ruptura, pero coste al fin
  const breaking = ['ceasefire', 'peace', 'non_aggression'].includes(t.type) && t.expiresDay !== null && t.expiresDay > sim.day;
  if (breaking) { breakTreaty(sim, t.id, c.id); return { ok: true }; }
  t.status = 'cancelled';
  t.endedDay = sim.day;
  for (const p of t.parties) if (p !== c.id) { const r = relation(sim.state, c.id, p); r.opinion -= 12; r.trust -= 6; }
  sim.emit('treaty_cancelled', 'world', 'minor', t.parties, `${c.name} denuncia el tratado «${t.name}»`, 'El tratado deja de estar vigente.');
  return { ok: true };
}

export function createOrganization(sim: Sim, c: CountryState, name: string, kind: 'economic' | 'military' | 'political' | 'scientific'): { ok: boolean; error?: string } {
  if (c.politics.politicalCapital < 15) return { ok: false, error: 'Se necesitan 15 de capital político.' };
  if (kind === 'military' && sim.params(c).militaryPosture < 0.2) return { ok: false, error: 'Un país neutral no puede fundar una alianza militar.' };
  c.politics.politicalCapital -= 15;
  const id = sim.nextId('O');
  sim.state.organizations[id] = {
    id, name, kind, founder: c.id, members: [c.id], foundedDay: sim.day,
    tariffCut: kind === 'economic' ? 0.6 : 0, mutualDefense: kind === 'military', scienceShare: kind === 'scientific' ? 0.15 : 0.03, active: true
  };
  sim.emit('org_created', 'world', 'minor', [c.id], `${c.name} funda «${name}»`, 'Otros países pueden ser invitados a integrarla.');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Paso mensual/diario
// ---------------------------------------------------------------------------

export function diplomacyDailyStep(sim: Sim): void {
  const st = sim.state;
  for (const p of Object.values(st.proposals)) {
    if (p.status === 'pending' && sim.day >= p.expiresDay) {
      p.status = 'expired';
      p.resolvedDay = sim.day;
    }
  }
  // limpiar propuestas viejas
  for (const [id, p] of Object.entries(st.proposals)) if (p.status !== 'pending' && p.resolvedDay !== null && sim.day - p.resolvedDay > 720) delete st.proposals[id];
  for (const t of Object.values(st.treaties)) {
    if (t.status === 'active' && t.expiresDay !== null && sim.day >= t.expiresDay) {
      t.status = t.type === 'loan' ? 'fulfilled' : 'expired';
      t.endedDay = sim.day;
      if (t.type === 'ceasefire') {
        const war = warBetween(st, t.parties[0], t.parties[1]);
        if (war && war.status === 'ceasefire') { war.status = 'active'; sim.emit('ceasefire_over', 'world', 'major', t.parties, 'Expira el alto el fuego', `Se reanuda la ${war.name}.`); }
      }
    }
  }
}

export function diplomacyMonthlyStep(sim: Sim): void {
  const st = sim.state;
  // obligaciones de pago
  for (const t of Object.values(st.treaties)) {
    if (t.status !== 'active') continue;
    if (t.type === 'economic_aid' && t.terms.monthly) {
      const giver = st.countries[t.terms.lender ?? t.parties[0]], recv = st.countries[t.parties.find((p) => p !== giver?.id) ?? ''];
      if (giver?.alive && recv?.alive) {
        const paid = transfer(sim, giver, recv, t.terms.monthly, 'aid');
        if (paid < t.terms.monthly * 0.5) { breakTreaty(sim, t.id, giver.id); }
      }
    }
    if (t.type === 'loan') {
      const lender = st.countries[t.terms.lender ?? t.parties[0]], borrower = st.countries[t.parties.find((p) => p !== lender?.id) ?? ''];
      if (!lender?.alive || !borrower?.alive || (t.terms.outstanding ?? 0) <= 0.0001) { t.status = 'fulfilled'; t.endedDay = sim.day; continue; }
      const months = Math.max(1, (t.expiresDay ?? sim.day + 30) - sim.day) / 30;
      const principal = (t.terms.outstanding ?? 0) / months;
      const interest = (t.terms.outstanding ?? 0) * (t.terms.rate ?? 0.05) / 12;
      if (borrower.fiscal.inDefault) { relation(st, lender.id, borrower.id).opinion -= 2; continue; }
      const paid = transfer(sim, borrower, lender, principal + interest, 'repayment');
      const principalPaid = Math.max(0, paid - interest);
      t.terms.outstanding = Math.max(0, (t.terms.outstanding ?? 0) - principalPaid);
      borrower.fiscal.debtForeign = Math.max(0, borrower.fiscal.debtForeign - principalPaid);
    }
  }
  // deriva de las relaciones hacia una línea de base estructural
  const countries = sim.aliveCountries();
  const tradeWith = new Map<string, number>();
  for (const f of st.trade) tradeWith.set(f.from < f.to ? `${f.from}|${f.to}` : `${f.to}|${f.from}`, f.value);
  for (let i = 0; i < countries.length; i++) {
    for (let j = i + 1; j < countries.length; j++) {
      const a = countries[i], b = countries[j];
      const r = relation(st, a.id, b.id);
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      const trade = tradeWith.get(key) ?? 0;
      const tradeDep = trade / Math.max(1, Math.min(a.econ.realGDP, b.econ.realGDP));
      let base = -r.rivalry * 0.6 - 30 * dimDistance(govIdeology(a), govIdeology(b)) + 10 + 60 * Math.min(0.4, tradeDep);
      if (a.culture === b.culture) base += 8;
      if (a.religion === b.religion) base += 5;
      base += sharedOrganizations(st, a.id, b.id).length * 6;
      if (hasTreaty(st, a.id, b.id, 'defensive_alliance') || hasTreaty(st, a.id, b.id, 'military_alliance')) base += 15;
      if (r.sanctions.length) base -= 25;
      if (atWar(st, a.id, b.id)) base = -100;
      // claims territoriales generan tensión
      if (a.claims.some((p) => st.provinces[p]?.owner === b.id) || b.claims.some((p) => st.provinces[p]?.owner === a.id)) base -= 15;
      // postura militar agresiva inquieta a los vecinos
      const lpA: LawParams = sim.params(a), lpB: LawParams = sim.params(b);
      if (r.border) base -= 10 * (lpA.militaryPosture + lpB.militaryPosture - 0.8);
      r.opinion = clamp(approach(r.opinion, clamp(base, -100, 100), 1 / 12, 4), -100, 100);
      r.trust = clamp(approach(r.trust, 50 + r.opinion / 3, 1 / 12, 6), 0, 100);
      r.rivalry = Math.max(0, r.rivalry - 0.05);
    }
  }
  for (const c of countries) c.cooldowns.aidFlow = (c.cooldowns.aidFlow ?? 0) * 0.5;
  void joinWar; void killCountry;
}
