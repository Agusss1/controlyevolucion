import { useEffect, useState } from 'react';
import { formatDate, SOCIAL_GROUPS, type GameEvent } from '@cyo/shared';
import { useGame } from '../store/game';
import { command, emit } from '../net/connection';
import { Badge, Bar, Button, Card, Flag, Stat, Tabs } from '../ui/kit';
import { ARCHETYPE_NAMES, GROUP_NAMES, REGIME_NAMES, WAR_STATUS, fmtBn, fmtNum, fmtPct, fmtPop } from '../ui/format';
import { popOf, debtRatio, totalRevenueOf } from './util';

export function OverviewPanel() {
  const priv = useGame((s) => s.priv)!;
  const c = priv.country;
  const ng = priv.nominalGDP;
  const d = c.directives;
  const setDir = (patch: Partial<typeof d>) => command({ type: 'setDirectives', directives: { ...d, ...patch } });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Flag flag={c.flag} size={40} />
        <div>
          <div className="font-display text-xl text-slate-100">{c.longName}</div>
          <div className="text-xs text-slate-400">{REGIME_NAMES[c.regime]} · {ARCHETYPE_NAMES[c.archetype] ?? c.archetype} · moneda: {c.currency.name} ({c.currency.code}) · fundado en {c.foundedYear}</div>
          <div className="text-xs text-slate-400">Jefe de gobierno: {c.politics.headOfGovernment} · Jefe de Estado: {c.politics.headOfState}</div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        <Stat label="PIB real" value={fmtBn(c.econ.realGDP)} />
        <Stat label="Crecimiento" value={fmtPct(c.econ.growth)} tone={c.econ.growth < 0 ? 'bad' : 'good'} />
        <Stat label="Inflación" value={fmtPct(c.econ.inflation)} tone={c.econ.inflation > 0.15 ? 'bad' : null} />
        <Stat label="Desempleo" value={fmtPct(c.econ.unemployment)} tone={c.econ.unemployment > 0.12 ? 'bad' : null} />
        <Stat label="Población" value={fmtPop(popOf(c))} />
        <Stat label="PIB per cápita" value={fmtNum(c.econ.realGDP / popOf(c) * 1000, 0)} />
        <Stat label="Deuda/PIB" value={fmtPct(debtRatio(c, ng), 0)} tone={debtRatio(c, ng) > 0.9 ? 'bad' : null} />
        <Stat label="Saldo fiscal" value={fmtPct(c.fiscal.balance / ng)} tone={c.fiscal.balance < 0 ? 'warn' : 'good'} />
        <Stat label="Aprobación" value={fmtNum(c.politics.approval, 0)} hint="Opinión pública ponderada por el peso político de cada grupo" />
        <Stat label="Legitimidad" value={fmtNum(c.politics.legitimacy, 0)} hint="Aceptación de las instituciones, distinta de la popularidad" />
        <Stat label="Estabilidad" value={fmtNum(c.politics.stability, 0)} tone={c.politics.stability < 30 ? 'bad' : null} />
        <Stat label="Capital político" value={fmtNum(c.politics.politicalCapital, 0)} hint="Se gasta en reformas, decretos y declaraciones de guerra" />
      </div>
      <Card title="Fortalezas y debilidades estructurales">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>{c.strengths.map((s) => <div key={s} className="text-emerald-300">+ {s}</div>)}</div>
          <div>{c.weaknesses.map((s) => <div key={s} className="text-red-300">− {s}</div>)}</div>
        </div>
      </Card>
      <Card title="Alertas">
        <div className="space-y-1 text-xs">
          {c.econ.energyShortage > 0.05 && <div className="text-amber-300">⚠ Escasez de energía: {fmtPct(c.econ.energyShortage)} de la demanda sin cubrir.</div>}
          {c.econ.foodShortage > 0.05 && <div className="text-red-300">⚠ Escasez de alimentos: {fmtPct(c.econ.foodShortage)}.</div>}
          {c.fiscal.arrears > 0 && <div className="text-red-300">⚠ Atrasos con proveedores: {fmtBn(c.fiscal.arrears, c.currency.code)}. El gasto se recorta.</div>}
          {c.fiscal.inDefault && <div className="text-red-300">⚠ El país está en default.</div>}
          {c.politics.protest > 0.3 && <div className="text-amber-300">⚠ Protestas extendidas ({fmtPct(c.politics.protest, 0)}).</div>}
          {c.politics.coupRisk > 0.5 && <div className="text-red-300">⚠ Riesgo de golpe de Estado elevado.</div>}
          {c.politics.separatism > 0.35 && <div className="text-amber-300">⚠ Tensiones separatistas.</div>}
          {c.econ.bankStress > 0.4 && <div className="text-amber-300">⚠ Tensión en el sistema bancario.</div>}
          {priv.wars.filter((w) => w.status !== 'ended').map((w) => <div key={w.id} className="text-red-300">⚔ {w.name}: {WAR_STATUS[w.status]}</div>)}
          {priv.proposals.filter((p) => p.to === c.id && p.status === 'pending').length > 0 && <div className="text-sky-300">✉ Propuestas diplomáticas pendientes de respuesta.</div>}
        </div>
      </Card>
      <Card title="Directivas de ausencia">
        <p className="mb-2 text-[11px] text-slate-400">Mientras estés desconectado, tus políticas siguen vigentes. Estas directivas mantienen el país sin reemplazar tus decisiones estratégicas.</p>
        <div className="space-y-1 text-sm">
          {([['balanceBudget', 'Recortar gasto discrecional si el déficit supera el 3 % del PIB'], ['continueResearch', 'Continuar la investigación automáticamente'], ['maintainGarrison', 'Reponer bajas de las guarniciones'], ['autoDecisions', 'Aplicar la opción por defecto en decisiones vencidas'], ['acceptFriendlyTrade', 'Aceptar tratados comerciales de países amigos (relación > 50)']] as const).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2"><input type="checkbox" className="accent-brass-500" checked={d[k]} onChange={(e) => setDir({ [k]: e.target.checked })} />{label}</label>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function GovernmentPanel() {
  const priv = useGame((s) => s.priv)!;
  const c = priv.country;
  const p = c.politics;
  const gov = c.parties.filter((x) => p.governmentParties.includes(x.id));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Régimen" value={REGIME_NAMES[c.regime]} />
        <Stat label="Democracia efectiva" value={fmtPct(priv.lawParams.democracy, 0)} />
        <Stat label="Capacidad administrativa" value={fmtNum(p.adminCapacity, 0)} hint="Recaudación, implementación de políticas y obras" />
        <Stat label="Estado de derecho" value={fmtNum(p.ruleOfLaw, 0)} />
        <Stat label="Corrupción" value={fmtNum(p.corruption, 0)} tone={p.corruption > 50 ? 'bad' : null} />
        <Stat label="Riesgo de golpe" value={fmtPct(p.coupRisk, 0)} tone={p.coupRisk > 0.5 ? 'bad' : null} />
        <Stat label="Protestas" value={fmtPct(p.protest, 0)} />
        <Stat label="Huelgas" value={fmtPct(p.strikes, 0)} />
        <Stat label="Criminalidad" value={fmtNum(p.crime, 0)} />
      </div>
      <Card title="Gobierno">
        <div className="text-sm text-slate-200">{gov.map((g) => g.name).join(' + ') || '—'}</div>
        <div className="text-xs text-slate-400">Jefe de gobierno: {p.headOfGovernment}</div>
        {p.nextElectionDay !== null && <div className="text-xs text-slate-400">Próximas elecciones: {formatDate(p.nextElectionDay)}</div>}
      </Card>
      <Card title="Proyectos de ley en trámite">
        {!c.bills.filter((b) => b.status === 'debate' || b.status === 'implementing').length && <div className="text-xs text-slate-500">Ninguno. Propón reformas desde «Legislación».</div>}
        {c.bills.filter((b) => b.status === 'debate' || b.status === 'implementing').map((b) => (
          <div key={b.id} className="mb-1 flex items-center justify-between rounded bg-ink-800/70 px-2 py-1 text-xs">
            <span>{b.law} → {b.option}</span>
            <span className="text-slate-400">{b.status === 'debate' ? `votación el ${formatDate(b.voteDay)} · apoyo ${fmtPct(b.support, 0)}` : `en vigor el ${formatDate(b.effectiveDay ?? 0)}`}</span>
            {b.status === 'debate' && <Button small kind="ghost" onClick={() => command({ type: 'withdrawBill', bill: b.id })}>Retirar</Button>}
          </div>
        ))}
        <div className="mt-2 text-[11px] text-slate-500">Últimas resoluciones: {c.bills.filter((b) => b.status === 'enacted' || b.status === 'rejected').slice(-4).map((b) => `${b.law} (${b.status === 'enacted' ? 'aprobada' : 'rechazada'})`).join(', ') || '—'}</div>
      </Card>
    </div>
  );
}

export function SocietyPanel() {
  const priv = useGame((s) => s.priv)!;
  const c = priv.country;
  const d = c.demography;
  const pop = popOf(c);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1.5">
        <Stat label="Población" value={fmtPop(pop)} />
        <Stat label="0-14 años" value={fmtPct(d.young / pop, 0)} />
        <Stat label="15-64 años" value={fmtPct(d.adult / pop, 0)} />
        <Stat label="65+ años" value={fmtPct(d.old / pop, 0)} />
        <Stat label="Fecundidad" value={fmtNum(d.fertility, 2)} />
        <Stat label="Esperanza de vida" value={fmtNum(d.lifeExpectancy, 1)} />
        <Stat label="Urbanización" value={fmtPct(d.urban, 0)} />
        <Stat label="Migración neta" value={`${fmtNum(d.netMigration * 1000, 0)} mil/año`} />
        <Stat label="Pobreza" value={fmtPct(c.econ.poverty, 0)} tone={c.econ.poverty > 0.35 ? 'bad' : null} />
        <Stat label="Gini" value={fmtNum(c.econ.gini, 3)} />
        <Stat label="Informalidad" value={fmtPct(c.econ.informality, 0)} />
        <Stat label="Religiosidad" value={fmtPct(d.religiosity, 0)} />
      </div>
      <Card title="Educación y salud">
        <div className="grid grid-cols-4 gap-1.5">
          <Stat label="Sin estudios" value={fmtPct(d.education[0], 0)} />
          <Stat label="Primaria" value={fmtPct(d.education[1], 0)} />
          <Stat label="Secundaria" value={fmtPct(d.education[2], 0)} />
          <Stat label="Superior" value={fmtPct(d.education[3], 0)} />
          <Stat label="Capital humano" value={fmtPct(c.stocks.humanCapital, 0)} hint="Acumulado por educación durante años" />
          <Stat label="Salud pública" value={fmtPct(c.stocks.health, 0)} />
          <Stat label="Gasto educación" value={`${fmtNum(c.budget.education)} % PIB`} />
          <Stat label="Gasto salud" value={`${fmtNum(c.budget.health)} % PIB`} />
        </div>
      </Card>
      <Card title="Grupos sociales">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-slate-500"><th>Grupo</th><th>Tamaño</th><th>Satisfacción</th><th>Radicalización</th><th>Peso</th></tr></thead>
          <tbody>
            {SOCIAL_GROUPS.map((g) => {
              const gs = c.groups[g];
              return (
                <tr key={g} className="border-t border-ink-700">
                  <td className="py-1 text-slate-200">{GROUP_NAMES[g]}</td>
                  <td>{fmtPct(gs.size, 0)}</td>
                  <td className="w-28"><div className="flex items-center gap-1"><Bar value={gs.sat} max={100} color={gs.sat < 35 ? '#e5534b' : gs.sat > 60 ? '#3fb950' : '#d29922'} /><span className="w-6 text-right">{gs.sat.toFixed(0)}</span></div></td>
                  <td>{fmtPct(gs.radical, 0)}</td>
                  <td>{fmtNum(gs.weight * 100, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-slate-500">Cada grupo reacciona de forma distinta a las leyes, impuestos, empleo, inflación y servicios. En regímenes no democráticos pesan más las élites (empresarios, militares, religiosos).</p>
      </Card>
    </div>
  );
}

export function ElectionsPanel() {
  const priv = useGame((s) => s.priv)!;
  const c = priv.country;
  const total = Object.values(c.parliament).reduce((a, b) => a + b, 0) || 1;
  // hemiciclo
  const seats: { color: string }[] = [];
  for (const p of c.parties) for (let i = 0; i < (c.parliament[p.id] ?? 0); i++) seats.push({ color: p.color });
  const rows = 8;
  const pts: { x: number; y: number }[] = [];
  const n = seats.length;
  let k = 0;
  for (let r = 0; r < rows && k < n; r++) {
    const rad = 40 + r * 9;
    const count = Math.round(n * rad / Array.from({ length: rows }, (_, i) => 40 + i * 9).reduce((a, b) => a + b, 0));
    for (let i = 0; i < count && k < n; i++, k++) { const a = Math.PI - (i / Math.max(1, count - 1)) * Math.PI; pts.push({ x: 120 + rad * Math.cos(a), y: 115 - rad * Math.sin(a) }); }
  }
  while (pts.length < n) pts.push({ x: 120, y: 115 });
  pts.sort((a, b) => Math.atan2(115 - b.y, b.x - 120) - Math.atan2(115 - a.y, a.x - 120));
  return (
    <div className="space-y-3">
      <Card title="Parlamento">
        <svg viewBox="0 0 240 120" className="w-full">{pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={Math.max(1.2, 3.5 - n / 200)} fill={seats[i]?.color ?? '#555'} />)}</svg>
        <div className="mt-1 text-center text-xs text-slate-400">{total} escaños · sistema: {c.laws.electoral === 'none' ? 'sin elecciones competitivas' : c.laws.electoral}</div>
      </Card>
      <Card title="Partidos">
        {c.parties.map((p) => (
          <div key={p.id} className="flex items-center gap-2 border-b border-ink-700 py-1 text-xs">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: p.color }} />
            <span className="flex-1 text-slate-200">{p.name} {!p.legal && <Badge tone="bad">ilegal</Badge>} {c.politics.governmentParties.includes(p.id) && <Badge tone="warn">gobierno</Badge>}</span>
            <span className="w-14 text-right">{fmtPct(p.vote, 1)}</span>
            <span className="w-12 text-right font-mono">{c.parliament[p.id] ?? 0}</span>
          </div>
        ))}
      </Card>
      <div className="text-xs text-slate-400">{c.politics.nextElectionDay !== null ? `Próximas elecciones: ${formatDate(c.politics.nextElectionDay)}. Los votos dependen de la satisfacción de cada grupo y de la cercanía ideológica de los partidos.` : 'No hay elecciones competitivas bajo el régimen actual.'}</div>
    </div>
  );
}

export function HistoryPanel() {
  const priv = useGame((s) => s.priv);
  const news = useGame((s) => s.news);
  const map = useGame((s) => s.map);
  const [older, setOlder] = useState<GameEvent[]>([]);
  const c = priv?.country;
  const mine = news.filter((e) => !c || e.countries.includes(c.id));
  const load = async () => {
    const before = [...mine, ...older].reduce((m, e) => Math.min(m, e.day), Infinity);
    const r = await emit<{ ok: boolean; events: GameEvent[] }>('request:events', { beforeDay: Number.isFinite(before) ? before : undefined });
    if (r.ok) setOlder((o) => [...o, ...r.events.filter((e) => !c || e.countries.includes(c.id))]);
  };
  return (
    <div className="space-y-3">
      {c && <Card title="Antecedentes">{c.history.map((h, i) => <p key={i} className="mb-1 text-sm text-slate-300">{h}</p>)}</Card>}
      {!c && map && <Card title="Vereth">{['Seis grandes regiones y decenas de Estados. Usa «Mundo» para ver el estado global.'].map((t) => <p key={t} className="text-sm text-slate-300">{t}</p>)}</Card>}
      <Card title="Cronología" right={<Button small onClick={load}>Cargar más antiguos</Button>}>
        <Timeline events={[...mine, ...older]} />
      </Card>
    </div>
  );
}

function Timeline({ events }: { events: GameEvent[] }) {
  const seen = new Set<string>();
  const list = events.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true))).sort((a, b) => b.day - a.day);
  return (
    <div className="space-y-1.5">
      {list.slice(0, 300).map((e) => (
        <div key={e.id} className="border-l-2 pl-2 text-xs" style={{ borderColor: e.severity === 'critical' ? '#e5534b' : e.severity === 'major' ? '#d29922' : '#34496a' }}>
          <div className="text-[10px] text-slate-500">{formatDate(e.day)}</div>
          <div className="text-slate-200">{e.title}</div>
          {e.text && <div className="text-slate-400">{e.text}</div>}
        </div>
      ))}
      {!list.length && <div className="text-xs text-slate-500">Aún no hay acontecimientos registrados.</div>}
    </div>
  );
}

export function NewsPanel() {
  const news = useGame((s) => s.news);
  const me = useGame((s) => s.you?.countryId);
  const [tab, setTab] = useState<'world' | 'national' | 'economy' | 'diplomacy' | 'military'>('world');
  useEffect(() => { useGame.getState().markNewsRead(); }, []);
  const filter = (e: GameEvent) => {
    if (tab === 'world') return e.scope === 'world';
    if (tab === 'national') return !!me && e.countries.includes(me);
    if (tab === 'economy') return ['devaluation', 'fiscal_crisis', 'banking_crisis', 'hyperinflation', 'default', 'restructuring', 'oil_shock', 'oil_glut', 'food_crisis', 'privatization_done', 'nationalization', 'market_return'].includes(e.type);
    if (tab === 'diplomacy') return ['treaty', 'treaty_broken', 'treaty_cancelled', 'sanctions', 'sanctions_lifted', 'recognition', 'org_created', 'org_join', 'org_leave', 'ambassador_recalled', 'unification', 'independence', 'territory_transfer'].includes(e.type);
    return e.type.startsWith('war') || ['battle_start', 'battle_end', 'province_captured', 'unit_surrender', 'fleet_sunk', 'ceasefire', 'capitulation', 'separate_peace', 'call_declined'].includes(e.type);
  };
  return (
    <div>
      <div className="mb-2 text-center font-display text-2xl tracking-wide text-slate-100">Diario de Vereth</div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'world', label: 'Mundo' }, { id: 'national', label: 'Nacional' }, { id: 'economy', label: 'Economía' }, { id: 'diplomacy', label: 'Diplomacia' }, { id: 'military', label: 'Militar' }]} />
      <Timeline events={news.filter(filter)} />
    </div>
  );
}

export function WorldPanel() {
  const view = useGame((s) => s.view);
  const [sort, setSort] = useState<'gdp' | 'population' | 'military' | 'gdpPerCapita' | 'techs'>('gdp');
  if (!view) return null;
  const list = view.countries.filter((c) => c.alive).sort((a, b) => (b[sort] as number) - (a[sort] as number));
  return (
    <div className="space-y-3">
      <Card title="Mercados mundiales">
        <div className="grid grid-cols-5 gap-1.5">
          {Object.entries(view.markets).map(([k, m]) => <Stat key={k} label={{ food: 'Alimentos', oil: 'Petróleo', gas: 'Gas', coal: 'Carbón', minerals: 'Minerales' }[k] ?? k} value={fmtPct(m.price / m.basePrice, 0)} tone={m.price > 1.4 ? 'bad' : m.price < 0.7 ? 'warn' : null} />)}
        </div>
        <div className="mt-1 text-[11px] text-slate-500">Precio respecto de 1990 · inflación mundial {fmtPct(view.worldInflation)} · tasa de interés mundial {fmtPct(view.worldInterestRate)}</div>
      </Card>
      <Card title="Guerras">
        {view.wars.filter((w) => w.status !== 'ended').map((w) => <div key={w.id} className="flex justify-between text-xs"><button className="text-slate-200 hover:text-brass-300" onClick={() => useGame.getState().openWarRoom(w.id)}>{w.name}</button><Badge tone={w.status === 'active' ? 'bad' : 'warn'}>{WAR_STATUS[w.status]}</Badge></div>)}
        {!view.wars.some((w) => w.status !== 'ended') && <div className="text-xs text-slate-500">El mundo está en paz.</div>}
      </Card>
      <Card title="Organizaciones internacionales">
        {view.organizations.map((o) => <div key={o.id} className="mb-1 text-xs"><span className="text-slate-200">{o.name}</span> <span className="text-slate-500">({o.kind === 'military' ? 'militar' : o.kind === 'economic' ? 'económica' : o.kind === 'scientific' ? 'científica' : 'política'}) · {o.members.length} miembros</span></div>)}
      </Card>
      <Card title="Clasificación" right={<select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded bg-ink-800 px-1 text-xs"><option value="gdp">PIB</option><option value="population">Población</option><option value="gdpPerCapita">PIB per cápita</option><option value="military">Fuerza militar</option><option value="techs">Tecnologías</option></select>}>
        <div className="space-y-0.5">
          {list.map((c, i) => (
            <button key={c.id} onClick={() => useGame.getState().selectCountry(c.id)} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-ink-700">
              <span className="w-5 text-right text-slate-500">{i + 1}</span><Flag flag={c.flag} size={11} /><span className="flex-1 truncate text-slate-200">{c.name}{c.human ? ' 👤' : ''}</span>
              <span className="w-24 text-right font-mono text-slate-300">{sort === 'gdp' ? fmtBn(c.gdp) : sort === 'population' ? fmtPop(c.population) : fmtNum(c[sort] as number, 0)}</span>
            </button>
          ))}
        </div>
        <div className="mt-1 text-[10px] text-slate-500">Las cifras de otros países son estimaciones de tus servicios de inteligencia.</div>
      </Card>
    </div>
  );
}

export function IntelligencePanel() {
  const priv = useGame((s) => s.priv)!;
  const view = useGame((s) => s.view)!;
  const c = priv.country;
  const others = view.countries.filter((x) => x.alive && x.id !== c.id).sort((a, b) => b.military - a.military);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Capacidad de inteligencia" value={fmtPct(c.stocks.intelligence, 0)} />
        <Stat label="Gasto en inteligencia" value={`${fmtNum(c.budget.intelligence)} % PIB`} />
        <Stat label="Margen de error" value={`± ${fmtPct(0.35 * (1 - c.stocks.intelligence), 0)}`} hint="Error típico de las estimaciones sobre otros países" />
      </div>
      <p className="text-xs text-slate-400">Las cifras extranjeras son estimaciones: su precisión depende de tu servicio de inteligencia y de la transparencia (libertad de prensa) del país observado. Solo ves unidades cerca de tu territorio, de tus aliados o de tus fuerzas.</p>
      <Card title="Potencias militares estimadas">
        {others.slice(0, 25).map((o) => (
          <div key={o.id} className="flex items-center gap-2 border-b border-ink-700 py-0.5 text-xs">
            <Flag flag={o.flag} size={11} /><span className="flex-1 text-slate-200">{o.name}</span>
            <span className="w-16 text-right text-slate-400">≈ {fmtNum(o.military, 0)}</span>
            <span className="w-16 text-right text-slate-400">estab. ≈ {o.stability}</span>
            <span className="w-20 text-right text-slate-400">{fmtPct(o.inflation)} infl.</span>
            <span className="w-12 text-right" style={{ color: (view.relations[o.id]?.opinion ?? 0) < -30 ? '#e5534b' : '#94a3b8' }}>{view.relations[o.id]?.opinion ?? 0}</span>
          </div>
        ))}
      </Card>
      <Card title="Ingresos fiscales extranjeros (estimados)"><div className="text-xs text-slate-500">Tu recaudación propia es de {fmtPct(totalRevenueOf(c) / priv.nominalGDP)} del PIB.</div></Card>
    </div>
  );
}
