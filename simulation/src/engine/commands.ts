import { BUDGET_CATEGORIES, TAXES, type Command, type CommandResult, type CountryState, type SectorId, type WorldState, type WorldMap } from '@cyo/shared';
import { clamp } from '../rng.js';
import { Sim } from './context.js';
import { borrow, repay, canBorrow } from './fiscal.js';
import { proposeLaw } from './politics.js';
import { TECH_BY_ID } from '../data/techs.js';
import { canResearch } from './tech.js';
import { recruit, issueOrder, declareWar } from './military.js';
import { createProposal, respondProposal, diploAction, cancelTreaty, createOrganization } from './diplomacy.js';
import { resolveDecision, declareDefault, restructureDebt } from './events.js';
import { respondCallToArms } from './ai.js';
import { startBuild, startPrivatization, startNationalization } from './projects.js';
import { UNIT_INFO } from '../data/units.js';

/**
 * Aplicador único de comandos. Valida permisos y reglas del juego y modifica el estado.
 * Tanto los jugadores como la IA pasan por aquí. Los comandos se registran con el día en
 * que se aplicaron para permitir la reproducción determinista de la partida.
 */

export function applyCommand(state: WorldState, map: WorldMap, countryId: string, cmd: Command): { result: CommandResult; events: Sim['events'] } {
  const sim = new Sim(state, map);
  const c = state.countries[countryId];
  let result: CommandResult;
  if (!c || !c.alive) result = { ok: false, error: 'País inexistente o desaparecido.' };
  else {
    try { result = execute(sim, c, cmd); } catch (e) { result = { ok: false, error: `Error interno: ${(e as Error).message}` }; }
  }
  sim.commit();
  return { result, events: sim.events };
}

/** Comandos del sistema (no de jugadores): presencia humana para la regla de guerras sincronizadas. */
export type SystemCommand = { type: 'presence'; human: string[]; online: string[] };

export function applySystemCommand(state: WorldState, cmd: SystemCommand): void {
  if (cmd.type === 'presence') {
    state.humanCountries = [...new Set(cmd.human)].sort();
    state.onlineCountries = [...new Set(cmd.online)].sort();
  }
}

function execute(sim: Sim, c: CountryState, cmd: Command): CommandResult {
  const st = sim.state;
  switch (cmd.type) {
    case 'setBudget': {
      for (const k of BUDGET_CATEGORIES) {
        const v = cmd.budget[k];
        if (v === undefined) continue;
        if (!Number.isFinite(v)) return { ok: false, error: 'Valor inválido.' };
        c.budget[k] = Math.round(clamp(v, 0, 40) * 100) / 100;
      }
      return { ok: true };
    }
    case 'setTaxes': {
      const lp = sim.params(c);
      for (const k of TAXES) {
        const v = cmd.taxes[k];
        if (v === undefined) continue;
        // restricciones institucionales: los regímenes federales delegan impuestos provinciales; el libre comercio limita aranceles
        let max = k === 'wealth' ? 0.1 : k === 'import' ? (lp.tradeBarriers < 0.1 ? 0.1 : 0.8) : 0.9;
        if (k === 'provincial' && lp.centralization > 0.8) max = 0.03;
        if (k === 'import' && c.laws.trade === 'free') max = Math.min(max, 0.1);
        c.taxes[k] = Math.round(clamp(v, 0, max) * 1000) / 1000;
      }
      return { ok: true };
    }
    case 'setMonetary': {
      const lp = sim.params(c);
      if (cmd.policyRate !== undefined) {
        if (lp.cbIndependence > 0.5) return { ok: false, error: 'El banco central es independiente: fija la tasa por su cuenta.' };
        c.econ.policyRate = clamp(cmd.policyRate, 0, 1);
      }
      if (cmd.monetization !== undefined) {
        if (lp.cbIndependence > 0.5 && cmd.monetization > 0) return { ok: false, error: 'Un banco central independiente no financia al Tesoro.' };
        c.fiscal.monetization = clamp(cmd.monetization, 0, 1);
      }
      return { ok: true };
    }
    case 'proposeLaw': {
      const r = proposeLaw(sim, c, cmd.law, cmd.option);
      return r.ok ? { ok: true, data: { bill: r.bill?.id } } : { ok: false, error: r.error };
    }
    case 'withdrawBill': {
      const b = c.bills.find((x) => x.id === cmd.bill && x.status === 'debate');
      if (!b) return { ok: false, error: 'Proyecto inexistente o ya votado.' };
      b.status = 'withdrawn';
      return { ok: true };
    }
    case 'privatize': {
      const r = startPrivatization(sim, c, { sector: cmd.sector as SectorId, percent: cmd.percent, method: cmd.method, buyers: cmd.buyers, regulation: cmd.regulation, labor: cmd.labor, proceeds: cmd.proceeds });
      return r.ok ? { ok: true, data: { estimate: r.estimate } } : { ok: false, error: r.error };
    }
    case 'nationalize': return wrap(startNationalization(sim, c, cmd.sector as SectorId, cmd.percent, cmd.compensation));
    case 'buildProject': {
      const r = startBuild(sim, c, cmd.province, cmd.kind);
      return r.ok ? { ok: true, data: { project: r.project?.id, cost: r.project?.totalCost } } : { ok: false, error: r.error };
    }
    case 'cancelProject': {
      const p = c.projects.find((x) => x.id === cmd.project && (x.status === 'active' || x.status === 'stalled'));
      if (!p) return { ok: false, error: 'Proyecto inexistente.' };
      p.status = 'cancelled';
      return { ok: true };
    }
    case 'setResearch': {
      const queue: string[] = [];
      for (const id of cmd.queue) {
        const t = TECH_BY_ID[id];
        if (!t) return { ok: false, error: `Tecnología desconocida: ${id}` };
        const chk = canResearch(c, t);
        if (!chk.ok) return { ok: false, error: `${t.name}: ${chk.reason}` };
        if (!queue.includes(id)) queue.push(id);
      }
      c.tech.queue = queue;
      return { ok: true };
    }
    case 'borrow': {
      const can = canBorrow(sim, c);
      if (!can.ok) return { ok: false, error: can.reason };
      borrow(sim, c, cmd.amount);
      return { ok: true };
    }
    case 'repayDebt': {
      const paid = repay(c, cmd.amount);
      return paid > 0 ? { ok: true, data: { paid } } : { ok: false, error: 'No hay fondos o deuda que pagar.' };
    }
    case 'declareDefault': {
      if (c.fiscal.inDefault) return { ok: false, error: 'Ya está en default.' };
      declareDefault(sim, c, `El gobierno de ${c.name} anuncia la suspensión de pagos de su deuda.`);
      return { ok: true };
    }
    case 'restructureDebt': return wrap(restructureDebt(sim, c, cmd.haircut));
    case 'recruit': {
      const n = cmd.count ?? 1;
      let made = 0;
      let err: string | undefined;
      for (let i = 0; i < n; i++) {
        const r = recruit(sim, c, cmd.unitType, cmd.province);
        if (!r.ok) { err = r.error; break; }
        made++;
      }
      return made ? { ok: true, data: { created: made }, message: err } : { ok: false, error: err };
    }
    case 'disbandUnit': {
      const u = st.units[cmd.unit];
      if (!u || u.owner !== c.id) return { ok: false, error: 'Unidad inexistente.' };
      if (u.status === 'combat') return { ok: false, error: 'No se puede disolver una unidad en combate.' };
      // el personal vuelve a la reserva y el equipo al arsenal
      const info = UNIT_INFO[u.type];
      c.military.manpower += info.manpower / 1000 * u.strength;
      for (const k of ['arms', 'vehicles', 'aircraft', 'ships'] as const) c.military.equipment[k] += info.equipment[k] * u.equipment * 0.8;
      delete st.units[u.id];
      return { ok: true };
    }
    case 'orderUnits': {
      const r = issueOrder(sim, c, cmd.units, cmd.order, cmd.target);
      return r.ok ? { ok: true, data: { moved: r.moved }, message: r.error } : { ok: false, error: r.error };
    }
    case 'createPlan': {
      const units = cmd.units.filter((id) => st.units[id]?.owner === c.id && st.units[id].domain === 'land');
      if (!units.length) return { ok: false, error: 'Sin unidades terrestres válidas.' };
      if (cmd.kind === 'offensive' && !cmd.targets.length) return { ok: false, error: 'Una ofensiva necesita objetivos.' };
      for (const p of Object.values(st.plans)) if (p.owner === c.id && p.active) p.units = p.units.filter((u) => !units.includes(u));
      const id = sim.nextId('PL');
      st.plans[id] = { id, owner: c.id, kind: cmd.kind, units, targets: cmd.targets.filter((t) => st.provinces[t]), enemy: cmd.enemy, createdDay: sim.day, active: true };
      return { ok: true, data: { plan: id } };
    }
    case 'cancelPlan': {
      const p = st.plans[cmd.plan];
      if (!p || p.owner !== c.id) return { ok: false, error: 'Plan inexistente.' };
      p.active = false;
      return { ok: true };
    }
    case 'setProduction': c.military.production = { ...cmd.production }; return { ok: true };
    case 'setDoctrine': c.military.doctrine = cmd.doctrine; return { ok: true };
    case 'diploPropose': {
      const to = st.countries[cmd.to];
      if (!to) return { ok: false, error: 'País inexistente.' };
      const r = createProposal(sim, c, to, cmd.proposal, cmd.terms, cmd.message ?? '');
      return r.ok ? { ok: true, data: { proposal: r.proposal?.id } } : { ok: false, error: r.error };
    }
    case 'diploRespond': return wrap(respondProposal(sim, c, cmd.proposal, cmd.response, cmd.counter));
    case 'diploWithdraw': {
      const p = st.proposals[cmd.proposal];
      if (!p || p.from !== c.id || p.status !== 'pending') return { ok: false, error: 'Propuesta inexistente.' };
      p.status = 'withdrawn';
      p.resolvedDay = sim.day;
      return { ok: true };
    }
    case 'diploAction': {
      const t = st.countries[cmd.to];
      if (!t) return { ok: false, error: 'País inexistente.' };
      return wrap(diploAction(sim, c, t, cmd.action));
    }
    case 'cancelTreaty': return wrap(cancelTreaty(sim, c, cmd.treaty));
    case 'createOrganization': return wrap(createOrganization(sim, c, cmd.name, cmd.kind));
    case 'leaveOrganization': {
      const o = st.organizations[cmd.organization];
      if (!o || !o.members.includes(c.id)) return { ok: false, error: 'No es miembro.' };
      o.members = o.members.filter((m) => m !== c.id);
      if (!o.members.length) o.active = false;
      sim.emit('org_leave', 'world', 'minor', [c.id], `${c.name} abandona ${o.name}`, '');
      return { ok: true };
    }
    case 'declareWar': {
      const t = st.countries[cmd.target];
      if (!t) return { ok: false, error: 'País inexistente.' };
      const r = declareWar(sim, c, t, cmd.goal, cmd.provinces);
      return r.ok ? { ok: true, data: { war: r.war?.id } } : { ok: false, error: r.error };
    }
    case 'warReady': {
      const w = st.wars[cmd.war];
      if (!w || !w.participants.some((p) => p.country === c.id)) return { ok: false, error: 'Guerra inexistente.' };
      if (!w.ready.includes(c.id)) w.ready.push(c.id);
      return { ok: true };
    }
    case 'withdrawDeclaration': {
      const w = st.wars[cmd.war];
      if (!w || w.attacker !== c.id) return { ok: false, error: 'Solo el declarante puede retirar la declaración.' };
      if (w.status !== 'pending' && w.status !== 'preparing') return { ok: false, error: 'La guerra ya comenzó.' };
      w.status = 'ended';
      w.endedDay = sim.day;
      w.result = 'Declaración retirada antes del inicio de las hostilidades.';
      c.politics.legitimacy -= 3;
      sim.emit('war_withdrawn', 'world', 'major', [w.attacker, w.defender], `${c.name} retira su declaración de guerra`, w.result);
      return { ok: true };
    }
    case 'callToArmsRespond': return wrap(respondCallToArms(sim, c, cmd.war, cmd.accept));
    case 'resolveDecision': return wrap(resolveDecision(sim, c, cmd.decision, cmd.option));
    case 'setDirectives': c.directives = { ...cmd.directives }; return { ok: true };
  }
  return { ok: false, error: 'Comando desconocido.' };
}

function wrap(r: { ok: boolean; error?: string }): CommandResult { return r.ok ? { ok: true } : { ok: false, error: r.error }; }
