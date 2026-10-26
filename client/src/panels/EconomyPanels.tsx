import { useEffect, useMemo, useState } from 'react';
import { BUDGET_CATEGORIES, SECTORS, TAXES, formatDate, type BudgetCategory, type TaxId, type SectorId } from '@cyo/shared';
import { SECTOR_INFO, BUILD_INFO, TAX_ELASTICITY, TERRAIN_INFO } from '@cyo/simulation';
import type { Projection } from '@cyo/simulation';
import { useGame } from '../store/game';
import { command, emit } from '../net/connection';
import { Badge, Button, Card, LineChart, Legend, Select, Slider, Stat, Tabs } from '../ui/kit';
import { BUDGET_NAMES, SECTOR_NAMES, TAX_NAMES, fmtBn, fmtNum, fmtPct } from '../ui/format';
import { BUILDING_NAMES } from '../ui/InfoCard';
import { debtRatio, popOf, provinceName, totalRevenueOf, countryName } from './util';

function useProjection(deps: unknown[]) {
  const [proj, setProj] = useState<Projection | null>(null);
  useEffect(() => {
    let alive = true;
    void emit<{ ok: boolean; projection: Projection }>('request:projection').then((r) => { if (alive && r.ok) setProj(r.projection); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return proj;
}

export function EconomyPanel() {
  const priv = useGame((s) => s.priv)!;
  const c = priv.country;
  const e = c.econ;
  const ng = priv.nominalGDP;
  const [tab, setTab] = useState<'macro' | 'money' | 'debt'>('macro');
  const [rate, setRate] = useState(e.policyRate);
  const [mon, setMon] = useState(c.fiscal.monetization);
  const [amount, setAmount] = useState(0.01 * ng);
  const [haircut, setHaircut] = useState(0.3);
  const proj = useProjection([c.id, Math.floor((useGame.getState().view?.day ?? 0) / 30)]);
  const cbIndependent = priv.lawParams.cbIndependence > 0.5;
  return (
    <div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'macro', label: 'Macroeconomía' }, { id: 'money', label: 'Moneda y tasas' }, { id: 'debt', label: 'Deuda' }]} />
      {tab === 'macro' && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-1.5">
            <Stat label="PIB real" value={fmtBn(e.realGDP)} />
            <Stat label="PIB nominal" value={fmtBn(ng, c.currency.code)} />
            <Stat label="Potencial" value={fmtBn(e.potentialGDP)} />
            <Stat label="Brecha" value={fmtPct(e.outputGap)} tone={e.outputGap < -0.03 ? 'bad' : null} />
            <Stat label="Crecimiento" value={fmtPct(e.growth)} tone={e.growth < 0 ? 'bad' : 'good'} />
            <Stat label="Inflación" value={fmtPct(e.inflation)} tone={e.inflation > 0.15 ? 'bad' : null} />
            <Stat label="Desempleo" value={fmtPct(e.unemployment)} />
            <Stat label="Salario medio" value={`${fmtNum(e.wage, 1)} mil UMI`} />
            <Stat label="Consumo" value={fmtBn(e.consumption)} />
            <Stat label="Inversión" value={fmtBn(e.investment)} />
            <Stat label="Inv. extranjera" value={fmtBn(e.fdi)} />
            <Stat label="Confianza" value={fmtNum(e.confidence, 0)} />
            <Stat label="Pobreza" value={fmtPct(e.poverty, 0)} />
            <Stat label="Informalidad" value={fmtPct(e.informality, 0)} />
            <Stat label="Tensión bancaria" value={fmtPct(e.bankStress, 0)} tone={e.bankStress > 0.4 ? 'bad' : null} />
            <Stat label="Participación laboral" value={fmtPct(e.participation, 0)} />
          </div>
          <Card title="Proyección a 24 meses (estimación del gobierno)">
            {proj ? (
              <>
                <LineChart series={[{ name: 'PIB', color: '#e2c27a', values: proj.base.map((p) => p.gdp) }]} band={{ low: proj.low.map((p) => p.gdp), high: proj.high.map((p) => p.gdp), color: '#e2c27a' }} format={(v) => fmtNum(v, 0)} labels={['hoy', '+24 meses']} />
                <LineChart height={90} series={[{ name: 'Inflación', color: '#e5534b', values: proj.base.map((p) => p.inflation * 100) }, { name: 'Desempleo', color: '#58a6ff', values: proj.base.map((p) => p.unemployment * 100) }]} format={(v) => `${v.toFixed(1)}%`} />
                <Legend items={[{ label: 'PIB (banda de incertidumbre)', color: '#e2c27a' }, { label: 'Inflación %', color: '#e5534b' }, { label: 'Desempleo %', color: '#58a6ff' }]} />
                <div className="mt-1 text-[10px] text-slate-500">Incertidumbre ±{fmtNum(proj.uncertainty, 1)} (depende de la capacidad administrativa). Supone el resto del mundo constante.</div>
              </>
            ) : <div className="text-xs text-slate-500">Calculando…</div>}
          </Card>
        </div>
      )}
      {tab === 'money' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            <Stat label="Tipo de cambio" value={`${fmtNum(e.exchangeRate, 2)} ${c.currency.code}/UMI`} />
            <Stat label="Reservas" value={fmtBn(e.reserves)} />
            <Stat label="Cuenta corriente" value={fmtBn(e.currentAccount)} tone={e.currentAccount < 0 ? 'warn' : 'good'} />
            <Stat label="Masa monetaria" value={fmtBn(e.moneySupply, c.currency.code)} />
            <Stat label="Crecimiento monetario" value={fmtPct(e.moneyGrowth)} />
            <Stat label="Expectativas de inflación" value={fmtPct(e.expectedInflation)} />
          </div>
          <Card title="Política monetaria">
            {cbIndependent ? <p className="text-xs text-slate-400">El banco central es independiente: fija la tasa con una regla (actual {fmtPct(e.policyRate)}) y no financia al Tesoro. Puedes cambiarlo en Legislación.</p> : (
              <div className="space-y-2">
                <div className="text-xs text-slate-400">Tasa de interés de referencia</div>
                <Slider value={rate} min={0} max={0.8} step={0.0025} onChange={setRate} format={(v) => fmtPct(v)} />
                <div className="text-xs text-slate-400">Financiamiento del déficit con emisión</div>
                <Slider value={mon} min={0} max={1} step={0.05} onChange={setMon} format={(v) => fmtPct(v, 0)} />
                <p className="text-[11px] text-amber-300/80">Emitir financia el déficit hoy y alimenta la inflación mañana; con emisión alta y sostenida puede llegar la hiperinflación.</p>
                <Button kind="primary" onClick={() => command({ type: 'setMonetary', policyRate: rate, monetization: mon })}>Aplicar</Button>
              </div>
            )}
          </Card>
          <Card title="Régimen cambiario"><div className="text-xs text-slate-400">Vigente: {c.laws.currency === 'fixed' ? 'tipo de cambio fijo (defendido con reservas)' : c.laws.currency === 'managed' ? 'flotación administrada' : 'flotación libre'}. Modificable en Legislación → Impuestos y moneda.</div></Card>
        </div>
      )}
      {tab === 'debt' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            <Stat label="Deuda interna" value={fmtBn(c.fiscal.debtDomestic, c.currency.code)} />
            <Stat label="Deuda externa" value={fmtBn(c.fiscal.debtForeign)} />
            <Stat label="Deuda/PIB" value={fmtPct(debtRatio(c, ng), 0)} />
            <Stat label="Tasa media" value={fmtPct(c.fiscal.debtRate)} />
            <Stat label="Prima de riesgo" value={fmtPct(e.riskPremium)} tone={e.riskPremium > 0.08 ? 'bad' : null} />
            <Stat label="Calificación" value={c.fiscal.rating} />
            <Stat label="Intereses anuales" value={fmtBn(c.fiscal.interest, c.currency.code)} />
            <Stat label="Tesoro" value={fmtBn(c.fiscal.treasury, c.currency.code)} />
            <Stat label="Atrasos" value={fmtBn(c.fiscal.arrears, c.currency.code)} tone={c.fiscal.arrears > 0 ? 'bad' : null} />
          </div>
          <Card title="Operaciones de deuda">
            <div className="text-xs text-slate-400">Monto (mil M {c.currency.code})</div>
            <Slider value={amount} min={0} max={Math.max(0.1, ng * 0.1)} step={Math.max(0.001, ng * 0.001)} onChange={setAmount} format={(v) => fmtNum(v, 1)} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button onClick={() => command({ type: 'borrow', amount })}>Emitir deuda</Button>
              <Button onClick={() => command({ type: 'repayDebt', amount })}>Cancelar deuda</Button>
            </div>
          </Card>
          <Card title="Default y reestructuración">
            <p className="mb-2 text-xs text-slate-400">Suspender pagos alivia el presupuesto pero cierra el crédito durante años, daña la confianza y enoja a los acreedores.</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button kind="danger" disabled={c.fiscal.inDefault} onClick={() => { if (confirm('¿Declarar el default de la deuda?')) void command({ type: 'declareDefault' }); }}>Declarar default</Button>
              <span className="text-xs text-slate-400">Quita</span>
              <div className="w-40"><Slider value={haircut} min={0} max={0.8} step={0.05} onChange={setHaircut} format={(v) => fmtPct(v, 0)} /></div>
              <Button onClick={() => command({ type: 'restructureDebt', haircut })}>Reestructurar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export function BudgetPanel() {
  const priv = useGame((s) => s.priv)!;
  const c = priv.country;
  const ng = priv.nominalGDP;
  const [draft, setDraft] = useState<Record<BudgetCategory, number>>({ ...c.budget });
  useEffect(() => { setDraft({ ...c.budget }); }, [c.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = BUDGET_CATEGORIES.reduce((a, k) => a + draft[k], 0);
  const rev = totalRevenueOf(c) / ng * 100;
  const interest = c.fiscal.interest / ng * 100;
  const balance = rev - total - interest;
  const upkeep = (c.cooldowns.readiness ?? 1);
  const proj = useProjection([c.id, JSON.stringify(c.budget)]);
  const changed = BUDGET_CATEGORIES.some((k) => Math.abs(draft[k] - c.budget[k]) > 1e-9);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1.5">
        <Stat label="Ingresos" value={`${fmtNum(rev)} % PIB`} />
        <Stat label="Gasto programado" value={`${fmtNum(total)} % PIB`} />
        <Stat label="Intereses" value={`${fmtNum(interest)} % PIB`} />
        <Stat label="Saldo estimado" value={`${fmtNum(balance)} % PIB`} tone={balance < -3 ? 'bad' : balance < 0 ? 'warn' : 'good'} />
      </div>
      <Card title="Asignación (porcentaje del PIB)">
        <div className="space-y-1.5">
          {BUDGET_CATEGORIES.map((k) => (
            <div key={k}>
              <div className="flex justify-between text-xs"><span className="text-slate-300">{BUDGET_NAMES[k]}</span><span className="text-slate-500">{fmtBn(draft[k] / 100 * ng, c.currency.code)}/año</span></div>
              <Slider value={draft[k]} min={0} max={k === 'defense' ? 30 : 20} step={0.1} onChange={(v) => setDraft({ ...draft, [k]: v })} format={(v) => `${v.toFixed(1)} %`} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">Defensa cubre el mantenimiento de las tropas ({upkeep >= 1 ? 'suficiente' : `solo ${fmtPct(upkeep, 0)}`}) y la producción de equipo.</div>
          <Button kind="primary" disabled={!changed} onClick={() => command({ type: 'setBudget', budget: draft })}>Aprobar presupuesto</Button>
        </div>
      </Card>
      <Card title="Efectos esperados">
        <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-slate-400">
          <li>Educación construye capital humano en años (productividad, investigación).</li>
          <li>Salud mejora la esperanza de vida y la productividad; Seguridad reduce crimen y protestas visibles.</li>
          <li>Infraestructura acelera la logística, el comercio y la productividad provincial.</li>
          <li>Administración mejora la recaudación y la ejecución; Justicia reduce la corrupción.</li>
          <li>Subsidios sostienen sectores y precios, con coste fiscal; Transferencias reducen pobreza y desigualdad.</li>
        </ul>
      </Card>
      <Card title="Proyección de saldo fiscal y deuda">
        {proj ? (
          <>
            <LineChart series={[{ name: 'Saldo', color: '#3fb950', values: proj.base.map((p) => p.balance * 100) }]} band={{ low: proj.low.map((p) => p.balance * 100), high: proj.high.map((p) => p.balance * 100), color: '#3fb950' }} format={(v) => `${v.toFixed(1)}%`} />
            <LineChart height={90} series={[{ name: 'Deuda', color: '#e5534b', values: proj.base.map((p) => p.debt * 100) }]} band={{ low: proj.low.map((p) => p.debt * 100), high: proj.high.map((p) => p.debt * 100), color: '#e5534b' }} format={(v) => `${v.toFixed(0)}%`} labels={['hoy', '+24 meses']} />
            <Legend items={[{ label: 'Saldo fiscal % PIB', color: '#3fb950' }, { label: 'Deuda % PIB', color: '#e5534b' }]} />
          </>
        ) : <div className="text-xs text-slate-500">Calculando…</div>}
      </Card>
    </div>
  );
}

export function TaxesPanel() {
  const priv = useGame((s) => s.priv)!;
  const c = priv.country;
  const ng = priv.nominalGDP;
  const [draft, setDraft] = useState<Record<TaxId, number>>({ ...c.taxes });
  useEffect(() => { setDraft({ ...c.taxes }); }, [c.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const est = (k: TaxId) => {
    const cur = c.fiscal.revenue[k] ?? 0, t0 = c.taxes[k], t1 = draft[k];
    if (t0 <= 0) return t1 > 0 ? null : 0;
    return cur * (t1 / t0) * Math.exp(-TAX_ELASTICITY[k] * (t1 - t0));
  };
  const changed = TAXES.some((k) => Math.abs(draft[k] - c.taxes[k]) > 1e-9);
  const other = (c.fiscal.revenue.rents ?? 0) + (c.fiscal.revenue.soe ?? 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Recaudación total" value={`${fmtPct(totalRevenueOf(c) / ng)} del PIB`} />
        <Stat label="Rentas de recursos y empresas públicas" value={fmtBn(other, c.currency.code)} />
        <Stat label="Informalidad" value={fmtPct(c.econ.informality, 0)} hint="Sube con la presión sobre el trabajo, la regulación y la baja capacidad administrativa" />
      </div>
      <Card title="Tasas">
        <div className="space-y-2">
          {TAXES.map((k) => {
            const e = est(k);
            return (
              <div key={k}>
                <div className="flex justify-between text-xs"><span className="text-slate-300">{TAX_NAMES[k]}</span><span className="text-slate-500">recauda {fmtBn(c.fiscal.revenue[k] ?? 0, c.currency.code)}{e !== null && Math.abs(draft[k] - c.taxes[k]) > 1e-9 ? ` → ≈ ${fmtBn(e, c.currency.code)}` : ''}</span></div>
                <Slider value={draft[k]} min={0} max={k === 'wealth' ? 0.05 : k === 'provincial' ? 0.05 : 0.7} step={k === 'wealth' || k === 'provincial' ? 0.001 : 0.005} onChange={(v) => setDraft({ ...draft, [k]: v })} format={(v) => fmtPct(v, 1)} />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="max-w-xs text-[11px] text-slate-500">Estimación de impacto directo. A mediano plazo, tasas altas reducen la base: más informalidad, menos inversión y fuga de capitales.</div>
          <Button kind="primary" disabled={!changed} onClick={() => command({ type: 'setTaxes', taxes: draft })}>Aplicar reforma tributaria</Button>
        </div>
      </Card>
    </div>
  );
}

export function IndustryPanel() {
  const priv = useGame((s) => s.priv)!;
  const c = priv.country;
  const [sector, setSector] = useState<SectorId>('energy');
  const [percent, setPercent] = useState(0.4);
  const [method, setMethod] = useState<'auction' | 'public_offering' | 'direct_sale'>('auction');
  const [buyers, setBuyers] = useState<'domestic' | 'foreign_allowed' | 'workers'>('domestic');
  const [regulation, setRegulation] = useState<'light' | 'regulator' | 'price_caps'>('regulator');
  const [labor, setLabor] = useState<'keep_jobs' | 'flexible'>('keep_jobs');
  const [proceeds, setProceeds] = useState<'debt' | 'treasury' | 'investment'>('debt');
  const [nPct, setNPct] = useState(0.5);
  const [comp, setComp] = useState<'full' | 'partial' | 'none'>('full');
  const sec = c.econ.sectors[sector];
  const consequences = useMemo(() => {
    const out: string[] = [];
    out.push(`Ingreso extraordinario estimado: depende del capital del sector, la confianza (${fmtNum(c.econ.confidence, 0)}) y el método (${method === 'auction' ? 'subasta: precio alto' : method === 'public_offering' ? 'oferta pública: precio medio, propiedad dispersa' : 'venta directa: rápida, precio bajo, riesgo de favoritismo'}).`);
    if (SECTOR_INFO[sector].naturalMonopoly) out.push(regulation === 'light' ? 'Monopolio natural con regulación ligera: más inversión y tarifas más altas (malestar de consumidores).' : regulation === 'price_caps' ? 'Topes de precios: tarifas contenidas pero menos inversión privada.' : 'Ente regulador: equilibrio entre inversión y tarifas.');
    out.push(labor === 'flexible' ? 'Flexibilidad laboral: mayor productividad y despidos (huelgas, desempleo transitorio).' : 'Garantía de empleo: menor rechazo sindical y menor mejora de productividad.');
    if (buyers === 'foreign_allowed') out.push('Compradores extranjeros: mejor precio e inversión; salida de utilidades y rechazo nacionalista.');
    if (buyers === 'workers') out.push('Venta a trabajadores: precio bajo, apoyo sindical, gestión cooperativa.');
    out.push(proceeds === 'debt' ? 'Destino: cancelar deuda (menos intereses).' : proceeds === 'investment' ? 'Destino: infraestructura (efecto a mediano plazo).' : 'Destino: Tesoro (financiar gasto corriente).');
    if (c.politics.adminCapacity < 45) out.push('Riesgo regulatorio alto: con baja capacidad administrativa la venta puede ser capturada por intereses privados.');
    out.push('Los efectos sobre productividad, precios y empleo no son inmediatos: se despliegan durante meses o años.');
    return out;
  }, [sector, method, regulation, labor, buyers, proceeds, c.econ.confidence, c.politics.adminCapacity]);
  const procs = c.projects.filter((p) => p.kind === 'privatization' || p.kind === 'nationalization');
  return (
    <div className="space-y-3">
      <Card title="Sectores productivos">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-slate-500"><th>Sector</th><th className="text-right">Producción</th><th className="text-right">Empleo</th><th className="text-right">Estatal</th><th className="text-right">Subsidio</th></tr></thead>
          <tbody>
            {SECTORS.map((s) => { const x = c.econ.sectors[s]; return (
              <tr key={s} className={`cursor-pointer border-t border-ink-700 hover:bg-ink-800 ${s === sector ? 'bg-brass-500/10' : ''}`} onClick={() => setSector(s)}>
                <td className="py-0.5 text-slate-200">{SECTOR_NAMES[s]}</td><td className="text-right">{fmtBn(x.output)}</td><td className="text-right">{fmtNum(x.labor, 2)} M</td><td className="text-right">{fmtPct(x.stateShare, 0)}</td><td className="text-right">{fmtPct(x.subsidy, 0)}</td>
              </tr>
            ); })}
          </tbody>
        </table>
      </Card>
      <Card title={`Constructor de políticas: privatización de ${SECTOR_NAMES[sector].toLowerCase()}`} right={<Badge>{fmtPct(sec.stateShare, 0)} estatal</Badge>}>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="col-span-2 text-slate-400">Porcentaje de la participación estatal a vender<Slider value={percent} min={0.05} max={1} step={0.05} onChange={setPercent} format={(v) => fmtPct(v, 0)} /></label>
          <label className="text-slate-400">Método<Select value={method} onChange={setMethod} className="w-full" options={[{ value: 'auction', label: 'Subasta' }, { value: 'public_offering', label: 'Oferta pública de acciones' }, { value: 'direct_sale', label: 'Venta directa' }]} /></label>
          <label className="text-slate-400">Compradores elegibles<Select value={buyers} onChange={setBuyers} className="w-full" options={[{ value: 'domestic', label: 'Solo nacionales' }, { value: 'foreign_allowed', label: 'Incluye extranjeros' }, { value: 'workers', label: 'Trabajadores (cooperativa)' }]} /></label>
          <label className="text-slate-400">Regulación posterior<Select value={regulation} onChange={setRegulation} className="w-full" options={[{ value: 'light', label: 'Ligera' }, { value: 'regulator', label: 'Ente regulador' }, { value: 'price_caps', label: 'Topes de precios' }]} /></label>
          <label className="text-slate-400">Condiciones laborales<Select value={labor} onChange={setLabor} className="w-full" options={[{ value: 'keep_jobs', label: 'Garantía de empleo' }, { value: 'flexible', label: 'Flexibilidad' }]} /></label>
          <label className="col-span-2 text-slate-400">Destino de los ingresos<Select value={proceeds} onChange={setProceeds} className="w-full" options={[{ value: 'debt', label: 'Cancelar deuda' }, { value: 'treasury', label: 'Tesoro' }, { value: 'investment', label: 'Infraestructura' }]} /></label>
        </div>
        <div className="mt-2 rounded bg-ink-800/70 p-2 text-[11px] text-slate-300"><div className="mb-1 font-semibold text-brass-300">Consecuencias posibles</div>{consequences.map((t) => <div key={t}>· {t}</div>)}</div>
        <div className="mt-2 flex items-center justify-between"><span className="text-[11px] text-slate-500">Coste: 8 de capital político · plazo: 3 a 8 meses</span><Button kind="primary" disabled={sec.stateShare < 0.03} onClick={() => command({ type: 'privatize', sector, percent, method, buyers, regulation, labor, proceeds })}>Iniciar privatización</Button></div>
      </Card>
      <Card title={`Nacionalización de ${SECTOR_NAMES[sector].toLowerCase()}`}>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="text-slate-400">Porcentaje de la parte privada<Slider value={nPct} min={0.05} max={1} step={0.05} onChange={setNPct} format={(v) => fmtPct(v, 0)} /></label>
          <label className="text-slate-400">Compensación<Select value={comp} onChange={setComp} className="w-full" options={[{ value: 'full', label: 'Plena (costosa)' }, { value: 'partial', label: 'Parcial' }, { value: 'none', label: 'Expropiación sin compensación' }]} /></label>
        </div>
        <div className="mt-2 flex justify-end"><Button kind="danger" onClick={() => command({ type: 'nationalize', sector, percent: nPct, compensation: comp })}>Nacionalizar</Button></div>
      </Card>
      {procs.length > 0 && (
        <Card title="Procesos en curso">
          {procs.map((p) => <div key={p.id} className="flex justify-between text-xs"><span>{p.kind === 'privatization' ? 'Privatización' : 'Nacionalización'} · {SECTOR_NAMES[String(p.params?.sector)]}</span><span className="text-slate-400">{p.status === 'done' ? 'completada' : `${fmtPct(p.progress, 0)} · fin ${formatDate(p.endDay)}`}</span></div>)}
        </Card>
      )}
    </div>
  );
}

export function EnergyPanel() {
  const priv = useGame((s) => s.priv)!;
  const view = useGame((s) => s.view)!;
  const c = priv.country;
  const names: Record<string, string> = { food: 'Alimentos', oil: 'Petróleo', gas: 'Gas', coal: 'Carbón', minerals: 'Minerales' };
  const reserves = priv.provinces.reduce((a, p) => ({ oil: a.oil + p.reserves.oil, gas: a.gas + p.reserves.gas, coal: a.coal + p.reserves.coal, minerals: a.minerals + p.reserves.minerals }), { oil: 0, gas: 0, coal: 0, minerals: 0 });
  const plants = priv.provinces.reduce((a, p) => a + p.buildings.power_plant, 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Escasez de energía" value={fmtPct(c.econ.energyShortage)} tone={c.econ.energyShortage > 0.05 ? 'bad' : 'good'} />
        <Stat label="Escasez de alimentos" value={fmtPct(c.econ.foodShortage)} tone={c.econ.foodShortage > 0.05 ? 'bad' : 'good'} />
        <Stat label="Centrales eléctricas" value={String(plants)} />
        <Stat label="Nuclear" value={c.tech.known.includes('nuclear_fission') ? 'Disponible' : 'No'} />
        <Stat label="Sector eléctrico" value={fmtBn(c.econ.sectors.energy.output)} />
        <Stat label="Eficiencia energética" value={fmtPct(c.tech.known.length / 90, 0)} hint="Mejora con tecnologías de energía y transporte" />
      </div>
      <Card title="Balance de materias primas (anual, valor a precios de 1990)">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-slate-500"><th>Producto</th><th className="text-right">Producción</th><th className="text-right">Consumo</th><th className="text-right">Import.</th><th className="text-right">Export.</th><th className="text-right">Precio mundial</th></tr></thead>
          <tbody>
            {Object.entries(c.econ.commodities).map(([k, b]) => (
              <tr key={k} className="border-t border-ink-700"><td className="py-0.5 text-slate-200">{names[k]}</td><td className="text-right">{fmtNum(b.production)}</td><td className="text-right">{fmtNum(b.consumption)}</td><td className="text-right">{fmtNum(b.imports)}</td><td className="text-right">{fmtNum(b.exports)}</td><td className="text-right">{fmtPct(view.markets[k as keyof typeof view.markets].price, 0)}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Reservas restantes">
        <div className="grid grid-cols-4 gap-1.5">
          <Stat label="Petróleo" value={fmtNum(reserves.oil, 0)} />
          <Stat label="Gas" value={fmtNum(reserves.gas, 0)} />
          <Stat label="Carbón" value={fmtNum(reserves.coal, 0)} />
          <Stat label="Minerales" value={fmtNum(reserves.minerals, 0)} />
        </div>
        <div className="mt-1 text-[10px] text-slate-500">Las reservas se agotan con la extracción. Ley de explotación vigente: {c.laws.extraction}.</div>
      </Card>
    </div>
  );
}

export function TradePanel() {
  const priv = useGame((s) => s.priv)!;
  const view = useGame((s) => s.view)!;
  const c = priv.country;
  const flows = view.trade.filter((t) => t.from === c.id || t.to === c.id).sort((a, b) => b.value - a.value);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1.5">
        <Stat label="Exportaciones" value={fmtBn(c.econ.exports)} />
        <Stat label="Importaciones" value={fmtBn(c.econ.imports)} />
        <Stat label="Balanza" value={fmtBn(c.econ.exports - c.econ.imports)} tone={c.econ.exports < c.econ.imports ? 'warn' : 'good'} />
        <Stat label="Cuenta corriente" value={fmtBn(c.econ.currentAccount)} />
        <Stat label="Arancel medio" value={fmtPct(c.taxes.import, 1)} />
        <Stat label="Política comercial" value={c.laws.trade} />
        <Stat label="Controles de capital" value={c.laws.capitalControls} />
        <Stat label="Inversión extranjera" value={c.laws.foreignInvestment} />
      </div>
      <Card title="Principales socios comerciales">
        {flows.slice(0, 15).map((f) => { const other = f.from === c.id ? f.to : f.from; return <div key={f.from + f.to} className="flex justify-between border-b border-ink-700 py-0.5 text-xs"><span className="text-slate-200">{countryName(other)}</span><span className="font-mono text-slate-300">{fmtBn(f.value)}</span></div>; })}
        {!flows.length && <div className="text-xs text-slate-500">Sin flujos comerciales importantes.</div>}
        <div className="mt-1 text-[10px] text-slate-500">Activa la capa «Comercio» del mapa para ver las rutas. Los tratados comerciales, las uniones aduaneras y las organizaciones reducen aranceles; sanciones, guerras y bloqueos los cortan.</div>
      </Card>
      <Card title="Acuerdos vigentes">
        {view.treaties.filter((t) => t.parties.includes(c.id) && ['trade_agreement', 'customs_union', 'energy_agreement'].includes(t.type)).map((t) => <div key={t.id} className="text-xs text-slate-300">· {t.name}</div>)}
      </Card>
    </div>
  );
}

export function InfrastructurePanel() {
  const priv = useGame((s) => s.priv)!;
  const map = useGame((s) => s.map)!;
  const selected = useGame((s) => s.selectedProvince);
  const c = priv.country;
  const own = priv.provinces.filter((p) => p.owner === c.id && p.controller === c.id);
  const [prov, setProv] = useState(selected && own.some((p) => p.id === selected) ? selected : c.capital);
  const [kind, setKind] = useState<keyof typeof BUILD_INFO>('road');
  const ps = map.provinces.find((p) => p.id === prov);
  const cost = ps ? BUILD_INFO[kind].cost * Math.max(0.15, Math.min(3, c.econ.realGDP / 400)) * TERRAIN_INFO[ps.terrain].buildCost * c.econ.priceLevel * c.econ.baseExchangeRate : 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Infraestructura nacional" value={fmtPct(c.stocks.infrastructure, 0)} />
        <Stat label="Gasto en infraestructura" value={`${fmtNum(c.budget.infrastructure)} % PIB`} />
        <Stat label="Obras activas" value={String(c.projects.filter((p) => p.status === 'active' && p.province).length)} />
      </div>
      <Card title="Nueva obra pública">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="text-slate-400">Provincia<Select value={prov} onChange={setProv} className="w-full" options={own.map((p) => ({ value: p.id, label: map.provinces.find((x) => x.id === p.id)?.name ?? p.id }))} /></label>
          <label className="text-slate-400">Tipo<Select value={kind} onChange={(v) => setKind(v)} className="w-full" options={Object.entries(BUILD_INFO).map(([k, v]) => ({ value: k as keyof typeof BUILD_INFO, label: v.name }))} /></label>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-slate-400">Coste estimado: {fmtBn(cost, c.currency.code)} · plazo ≈ {Math.round(BUILD_INFO[kind].days * (1.3 - 0.5 * c.politics.adminCapacity / 100) / 30)} meses · se paga día a día</span>
          <Button kind="primary" onClick={() => command({ type: 'buildProject', province: prov, kind })}>Iniciar obra</Button>
        </div>
      </Card>
      <Card title="Obras">
        {c.projects.filter((p) => p.province).slice().reverse().map((p) => (
          <div key={p.id} className="flex items-center justify-between border-b border-ink-700 py-1 text-xs">
            <span className="text-slate-200">{BUILD_INFO[p.kind as keyof typeof BUILD_INFO]?.name ?? p.kind} · {provinceName(p.province!)}</span>
            <span className="text-slate-400">{p.status === 'done' ? 'inaugurada' : p.status === 'stalled' ? 'paralizada (sin fondos)' : p.status === 'cancelled' ? 'cancelada' : `${fmtPct(p.progress, 0)}`}</span>
            {(p.status === 'active' || p.status === 'stalled') && <Button small kind="ghost" onClick={() => command({ type: 'cancelProject', project: p.id })}>Cancelar</Button>}
          </div>
        ))}
      </Card>
      <Card title="Provincias">
        <div className="max-h-60 overflow-y-auto">
          {own.slice().sort((a, b) => b.pop - a.pop).map((p) => (
            <button key={p.id} onClick={() => { setProv(p.id); useGame.getState().selectProvince(p.id); }} className="flex w-full items-center justify-between border-b border-ink-700 py-0.5 text-left text-xs hover:bg-ink-800">
              <span className="text-slate-200">{map.provinces.find((x) => x.id === p.id)?.name}</span>
              <span className="text-slate-400">{fmtNum(p.pop, 2)} M · infra {fmtPct(p.infra, 0)} · {Object.entries(p.buildings).filter(([, v]) => v > 0).map(([k, v]) => `${BUILDING_NAMES[k]} ${v}`).join(', ')}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function StatisticsPanel() {
  const priv = useGame((s) => s.priv)!;
  const game = useGame((s) => s.game)!;
  const c = priv.country;
  const s = c.series;
  const [hist, setHist] = useState<{ day: number; data: Record<string, number> }[] | null>(null);
  useEffect(() => { void emit<{ ok: boolean; stats: { day: number; data: Record<string, number> }[] }>('request:history', { country: c.id }).then((r) => { if (r.ok) setHist(r.stats); }); }, [c.id, game.day]);
  const charts: { key: string; label: string; color: string; scale?: number; fmt: (v: number) => string }[] = [
    { key: 'gdp', label: 'PIB real', color: '#e2c27a', fmt: (v) => fmtNum(v, 0) },
    { key: 'inflation', label: 'Inflación %', color: '#e5534b', scale: 100, fmt: (v) => v.toFixed(1) },
    { key: 'unemployment', label: 'Desempleo %', color: '#58a6ff', scale: 100, fmt: (v) => v.toFixed(1) },
    { key: 'debt', label: 'Deuda % PIB', color: '#bc8cff', scale: 100, fmt: (v) => v.toFixed(0) },
    { key: 'approval', label: 'Aprobación', color: '#3fb950', fmt: (v) => v.toFixed(0) },
    { key: 'stability', label: 'Estabilidad', color: '#7ee787', fmt: (v) => v.toFixed(0) },
    { key: 'population', label: 'Población (M)', color: '#ffa657', fmt: (v) => v.toFixed(1) },
    { key: 'poverty', label: 'Pobreza %', color: '#f778ba', scale: 100, fmt: (v) => v.toFixed(0) }
  ];
  const fromHist = (k: string) => hist?.map((h) => Number(h.data[k] ?? 0)) ?? [];
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">Serie mensual desde 1990 ({(hist?.length ?? s.gdp?.length ?? 0)} meses registrados). Ingresos actuales {fmtPct(totalRevenueOf(c) / priv.nominalGDP)} del PIB · población {fmtNum(popOf(c), 1)} M.</div>
      <div className="grid grid-cols-2 gap-2">
        {charts.map((ch) => {
          const vals = (hist && hist.length > (s[ch.key]?.length ?? 0) ? fromHist(ch.key) : s[ch.key] ?? []).map((v) => v * (ch.scale ?? 1));
          return <Card key={ch.key} title={ch.label}><LineChart height={90} series={[{ name: ch.label, color: ch.color, values: vals }]} format={ch.fmt} /></Card>;
        })}
      </div>
    </div>
  );
}
