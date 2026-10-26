import { describe, it, expect } from 'vitest';
import type { WorldState, WorldMap, Command } from '@cyo/shared';
import {
  runDay, applyCommand, applySystemCommand, computeRevenue, totalRevenue, nominalGDP, Sim, independence, captureProvince, declareWar, TECH_BY_ID
} from '@cyo/simulation';
import { officialWorld, hashState } from './helpers.js';

function days(state: WorldState, map: WorldMap, n: number) { for (let i = 0; i < n; i++) runDay(state, map); }
function cmd(state: WorldState, map: WorldMap, country: string, c: Command) { return applyCommand(state, map, country, c).result; }

describe('determinismo', () => {
  it('misma semilla y mismas entradas producen exactamente el mismo mundo', () => {
    const a = officialWorld(), b = officialWorld();
    const script = (w: { state: WorldState; map: WorldMap }) => {
      days(w.state, w.map, 10);
      cmd(w.state, w.map, 'VAL', { type: 'setTaxes', taxes: { vat: 0.2 } });
      cmd(w.state, w.map, 'TEC', { type: 'proposeLaw', law: 'centralBank', option: 'independent' });
      days(w.state, w.map, 25);
    };
    script(a); script(b);
    expect(hashState(a.state)).toBe(hashState(b.state));
    const c = officialWorld();
    days(c.state, c.map, 35);
    expect(hashState(c.state)).not.toBe(hashState(a.state));
  });
});

describe('economía y finanzas públicas', () => {
  it('subir el IVA aumenta la recaudación, pero tasas extremas recaudan menos (bases y evasión)', () => {
    const { state, map } = officialWorld();
    const sim = new Sim(state, map);
    const c = state.countries.MOR;
    const base = totalRevenue(computeRevenue(sim, c));
    c.taxes.vat += 0.05;
    const higher = totalRevenue(computeRevenue(sim, c));
    expect(higher).toBeGreaterThan(base);
    c.taxes.vat = 0.6;
    const r60 = totalRevenue(computeRevenue(sim, c));
    c.taxes.vat = 0.9;
    const r90 = totalRevenue(computeRevenue(sim, c));
    expect(r90).toBeLessThan(r60);
  });

  it('los cambios fiscales llegan al presupuesto y al saldo del Tesoro', () => {
    const a = officialWorld(), b = officialWorld();
    a.state.humanCountries = ['MOR']; b.state.humanCountries = ['MOR'];
    expect(cmd(b.state, b.map, 'MOR', { type: 'setTaxes', taxes: { income: b.state.countries.MOR.taxes.income + 0.05 } }).ok).toBe(true);
    expect(cmd(b.state, b.map, 'MOR', { type: 'setBudget', budget: { defense: b.state.countries.MOR.budget.defense + 1 } }).ok).toBe(true);
    days(a.state, a.map, 30); days(b.state, b.map, 30);
    const ra = totalRevenue(a.state.countries.MOR.fiscal.revenue), rb = totalRevenue(b.state.countries.MOR.fiscal.revenue);
    expect(rb).toBeGreaterThan(ra);
    expect(b.state.countries.MOR.fiscal.spending.defense).toBeGreaterThan(a.state.countries.MOR.fiscal.spending.defense);
  });

  it('los recursos no aparecen de la nada: identidad contable del Tesoro y reservas físicas decrecientes', () => {
    const { state, map } = officialWorld();
    const before = Object.fromEntries(Object.values(state.countries).map((c) => [c.id, { t: c.fiscal.treasury, l: { ...c.fiscal.ledger } }]));
    const oil0 = Object.values(state.provinces).reduce((a, p) => a + p.reserves.oil, 0);
    days(state, map, 60);
    for (const c of Object.values(state.countries)) {
      if (!before[c.id] || c.createdDay > 0) continue;
      const l = c.fiscal.ledger, l0 = before[c.id].l;
      const flows = (l.revenue - l0.revenue) - (l.spending - l0.spending) - (l.interest - l0.interest) + (l.borrowed - l0.borrowed) - (l.repaid - l0.repaid) + (l.printed - l0.printed) + (l.extraordinary - l0.extraordinary) + (l.aid - l0.aid);
      const delta = c.fiscal.treasury - before[c.id].t;
      expect(Math.abs(delta - flows), c.id).toBeLessThan(1e-6 * Math.max(1, Math.abs(nominalGDP(c))));
    }
    const oil1 = Object.values(state.provinces).reduce((a, p) => a + p.reserves.oil, 0);
    expect(oil1).toBeLessThan(oil0);
    for (const p of Object.values(state.provinces)) expect(p.reserves.oil).toBeGreaterThanOrEqual(0);
  });

  it('un país sin jugador conectado conserva sus políticas y su situación', () => {
    const { state, map } = officialWorld();
    applySystemCommand(state, { type: 'presence', human: ['LUS'], online: [] });
    cmd(state, map, 'LUS', { type: 'setBudget', budget: { education: 7.5 } });
    cmd(state, map, 'LUS', { type: 'setTaxes', taxes: { corporate: 0.21 } });
    const laws = JSON.stringify(state.countries.LUS.laws);
    days(state, map, 45);
    const c = state.countries.LUS;
    expect(c.budget.education).toBe(7.5);
    expect(c.taxes.corporate).toBe(0.21);
    expect(JSON.stringify(c.laws)).toBe(laws);
    expect(c.alive).toBe(true);
  });
});

describe('tecnología', () => {
  it('respeta los requisitos y no permite investigar lo inalcanzable', () => {
    const { state, map } = officialWorld();
    const r1 = cmd(state, map, 'YAR', { type: 'setResearch', queue: ['cloud_computing'] });
    expect(r1.ok).toBe(false);
    const known = state.countries.VAL.tech.known;
    expect(known).toContain('personal_computers');
    const ok = cmd(state, map, 'VAL', { type: 'setResearch', queue: ['world_web'] });
    expect(ok.ok).toBe(TECH_BY_ID.world_web.prereqs.every((p) => known.includes(p)));
  });

  it('la investigación progresa con el gasto científico y se descubre sin fecha fija', () => {
    const { state, map } = officialWorld();
    applySystemCommand(state, { type: 'presence', human: ['HJE'], online: ['HJE'] });
    cmd(state, map, 'HJE', { type: 'setBudget', budget: { science: 6 } });
    const res = cmd(state, map, 'HJE', { type: 'setResearch', queue: ['digital_mobile'] });
    expect(res.ok).toBe(true);
    days(state, map, 20);
    const p = state.countries.HJE.tech.progress.digital_mobile ?? 0;
    expect(p > 0 || state.countries.HJE.tech.known.includes('digital_mobile')).toBe(true);
  });
});

describe('diplomacia asíncrona', () => {
  it('una propuesta a un jugador desconectado queda pendiente y puede aceptarse días después', () => {
    const { state, map } = officialWorld();
    applySystemCommand(state, { type: 'presence', human: ['TEC', 'IRI'], online: ['TEC'] });
    const r = cmd(state, map, 'TEC', { type: 'diploPropose', to: 'IRI', proposal: 'science_cooperation', terms: {}, message: 'Cooperemos' });
    expect(r.ok).toBe(true);
    const pid = r.data!.proposal as string;
    days(state, map, 10);
    expect(state.proposals[pid].status).toBe('pending');
    const acc = cmd(state, map, 'IRI', { type: 'diploRespond', proposal: pid, response: 'accept' });
    expect(acc.ok).toBe(true);
    expect(Object.values(state.treaties).some((t) => t.type === 'science_cooperation' && t.status === 'active' && t.parties.includes('TEC') && t.parties.includes('IRI'))).toBe(true);
  });
});

describe('guerras sincronizadas', () => {
  it('una guerra entre humanos espera a que todos estén conectados, se congela sin ellos y se reanuda', () => {
    const { state, map } = officialWorld();
    applySystemCommand(state, { type: 'presence', human: ['YRV', 'TEC'], online: ['YRV'] });
    state.countries.YRV.politics.politicalCapital = 100;
    const r = cmd(state, map, 'YRV', { type: 'declareWar', target: 'TEC', goal: 'claims', provinces: state.countries.YRV.claims });
    expect(r.ok).toBe(true);
    const war = state.wars[r.data!.war as string];
    days(state, map, 5);
    expect(war.status).toBe('pending');
    // el defensor se conecta: preparación y luego operaciones
    applySystemCommand(state, { type: 'presence', human: ['YRV', 'TEC'], online: ['YRV', 'TEC'] });
    days(state, map, 1);
    expect(war.status).toBe('preparing');
    cmd(state, map, 'YRV', { type: 'warReady', war: war.id });
    cmd(state, map, 'TEC', { type: 'warReady', war: war.id });
    days(state, map, 1);
    expect(war.status).toBe('active');
    // desconexión del defensor: se congela; no pierde territorio por nuevas operaciones
    applySystemCommand(state, { type: 'presence', human: ['YRV', 'TEC'], online: ['YRV'] });
    days(state, map, 1);
    expect(war.status).toBe('frozen');
    const tecProvinces = Object.values(state.provinces).filter((p) => p.owner === 'TEC');
    const target = tecProvinces.find((p) => map.provinces.find((x) => x.id === p.id)!.neighbors.some((l) => state.provinces[l.to]?.controller === 'YRV'))!;
    expect(target).toBeTruthy();
    // vaciar la provincia de defensores y ordenar un ataque
    for (const u of Object.values(state.units)) if (u.location === target.id) delete state.units[u.id];
    const attacker = Object.values(state.units).find((u) => u.owner === 'YRV' && u.domain === 'land')!;
    const from = map.provinces.find((x) => x.id === target.id)!.neighbors.find((l) => state.provinces[l.to]?.controller === 'YRV')!.to;
    attacker.location = from; attacker.status = 'ready'; attacker.path = [];
    const o = cmd(state, map, 'YRV', { type: 'orderUnits', units: [attacker.id], order: 'attack', target: target.id });
    expect(o.ok).toBe(true);
    const controlBefore = state.provinces[target.id].controller;
    days(state, map, 20);
    expect(state.provinces[target.id].controller).toBe(controlBefore);
    expect(state.provinces[target.id].owner).toBe('TEC');
    // reconexión: la guerra se reanuda desde sus posiciones y las órdenes conservadas se ejecutan
    applySystemCommand(state, { type: 'presence', human: ['YRV', 'TEC'], online: ['YRV', 'TEC'] });
    days(state, map, 1);
    expect(war.status).toBe('active');
    days(state, map, 30);
    expect(state.provinces[target.id].controller).toBe('YRV');
    // ocupación no es soberanía
    expect(state.provinces[target.id].owner).toBe('TEC');
  });

  it('la ocupación cambia el control y solo un tratado de paz cambia la soberanía', () => {
    const { state, map } = officialWorld();
    const sim = new Sim(state, map);
    state.countries.KES.politics.politicalCapital = 100;
    const res = declareWar(sim, state.countries.KES, state.countries.ZAH, 'claims', state.countries.KES.claims);
    sim.commit();
    expect(res.ok).toBe(true);
    days(state, map, 3);
    const war = res.war!;
    expect(['preparing', 'active']).toContain(war.status);
    days(state, map, 3);
    const p = Object.values(state.provinces).find((x) => x.owner === 'ZAH')!;
    const sim2 = new Sim(state, map);
    captureProvince(sim2, p.id, 'KES');
    sim2.commit();
    expect(state.provinces[p.id].controller).toBe('KES');
    expect(state.provinces[p.id].owner).toBe('ZAH');
    const popKES = state.countries.KES.demography.adult;
    const r = cmd(state, map, 'KES', { type: 'diploPropose', to: 'ZAH', proposal: 'peace', terms: { warId: war.id, provinces: [p.id], provincesTo: 'KES', truceYears: 5 } });
    expect(r.ok).toBe(true);
    const a = cmd(state, map, 'ZAH', { type: 'diploRespond', proposal: r.data!.proposal as string, response: 'accept' });
    expect(a.ok).toBe(true);
    expect(state.provinces[p.id].owner).toBe('KES');
    expect(state.provinces[p.id].controller).toBe('KES');
    expect(war.status).toBe('ended');
    expect(state.countries.KES.demography.adult).toBeGreaterThan(popKES);
  });
});

describe('nuevos Estados', () => {
  it('una independencia crea un Estado completo con identificador persistente, bandera, gobierno, economía y relaciones', () => {
    const { state, map } = officialWorld();
    const sim = new Sim(state, map);
    const parent = state.countries.KHA;
    const provs = Object.values(state.provinces).filter((p) => p.owner === 'KHA' && p.culture === 'velskiano').map((p) => p.id);
    expect(provs.length).toBeGreaterThan(0);
    const n = independence(sim, parent, provs, false)!;
    sim.commit();
    expect(n).toBeTruthy();
    expect(state.countries[n.id].alive).toBe(true);
    expect(n.flag.colors.length).toBeGreaterThan(0);
    expect(n.econ.realGDP).toBeGreaterThan(0);
    expect(n.parties.length).toBeGreaterThan(0);
    expect(Object.values(state.provinces).filter((p) => p.owner === n.id).length).toBe(provs.length);
    expect(Object.values(state.relations).some((r) => (r.a === n.id || r.b === n.id))).toBe(true);
    days(state, map, 15);
    expect(state.countries[n.id].econ.realGDP).toBeGreaterThan(0);
    // el nuevo Estado acepta comandos como cualquier otro
    expect(cmd(state, map, n.id, { type: 'setTaxes', taxes: { vat: 0.1 } }).ok).toBe(true);
  });
});

describe('registro de eventos', () => {
  it('los acontecimientos del motor quedan registrados con su fecha', () => {
    const { state, map } = officialWorld();
    const all = [];
    for (let i = 0; i < 40; i++) all.push(...runDay(state, map).events);
    state.countries.KES.politics.politicalCapital = 100;
    const r = applyCommand(state, map, 'KES', { type: 'declareWar', target: 'ZAH', goal: 'claims', provinces: [] });
    expect(r.result.ok).toBe(true);
    expect(r.events.some((e) => e.type === 'war_declared' && e.day === state.day)).toBe(true);
    expect(state.recentEvents.some((e) => e.type === 'war_declared')).toBe(true);
  });
});
