import { useState } from 'react';
import { UNIT_TYPES, type UnitType } from '@cyo/shared';
import { UNIT_INFO } from '@cyo/simulation';
import { useGame } from '../store/game';
import { command } from '../net/connection';
import { Badge, Button, Card, Select, Slider, Stat, Tabs } from '../ui/kit';
import { ORDER_NAMES, STATUS_NAMES, WAR_STATUS, fmtBn, fmtNum, fmtPct } from '../ui/format';
import { countryName, provinceName } from './util';

export function DefensePanel() {
  const priv = useGame((s) => s.priv)!;
  const view = useGame((s) => s.view)!;
  const map = useGame((s) => s.map)!;
  const c = priv.country;
  const m = c.military;
  const [tab, setTab] = useState<'forces' | 'recruit' | 'plans' | 'war'>('forces');
  const units = view.units.filter((u) => u.owner === c.id);
  const own = priv.provinces.filter((p) => p.owner === c.id && p.controller === c.id);
  const [type, setType] = useState<UnitType>('infantry');
  const [prov, setProv] = useState(c.capital);
  const [count, setCount] = useState(1);
  const [prod, setProd] = useState({ ...m.production });
  const [target, setTarget] = useState<string>('');
  const [goal, setGoal] = useState<'claims' | 'conquest' | 'punitive' | 'regime_change'>('claims');
  const [planTargets, setPlanTargets] = useState<string[]>([]);
  const info = UNIT_INFO[type];
  const cost = info.cost * c.econ.priceLevel * c.econ.baseExchangeRate;
  const readiness = c.cooldowns.readiness ?? 1;
  const others = view.countries.filter((x) => x.alive && x.id !== c.id).sort((a, b) => a.name.localeCompare(b.name));
  const enemy = target || priv.hostile[0] || '';
  const enemyProvs = map.provinces.filter((p, i) => view.controller[i] === enemy);
  const claimsOnTarget = c.claims.filter((pid) => view.owner[map.provinces.findIndex((p) => p.id === pid)] === target);
  const selectAllLand = () => useGame.getState().setSelectedUnits(units.filter((u) => UNIT_INFO[u.type as UnitType].domain === 'land' && u.status !== 'training').map((u) => u.id));

  return (
    <div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'forces', label: 'Fuerzas' }, { id: 'recruit', label: 'Reclutamiento y producción' }, { id: 'plans', label: 'Planes y frentes' }, { id: 'war', label: 'Guerra' }]} />
      {tab === 'forces' && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-1.5">
            <Stat label="Personal" value={`${fmtNum(m.personnel, 0)} mil`} />
            <Stat label="Reservas de reclutas" value={`${fmtNum(m.manpower * 1000, 0)} mil`} />
            <Stat label="Preparación" value={fmtPct(Math.min(1.5, readiness), 0)} tone={readiness < 1 ? 'bad' : 'good'} hint="Presupuesto de defensa / mantenimiento requerido" />
            <Stat label="Calidad de mando" value={fmtPct(m.commandQuality, 0)} />
            <Stat label="Cansancio de guerra" value={fmtPct(m.warExhaustion, 0)} tone={m.warExhaustion > 0.4 ? 'bad' : null} />
            <Stat label="Doctrina" value={m.doctrine === 'offensive' ? 'Ofensiva' : m.doctrine === 'defensive' ? 'Defensiva' : 'Equilibrada'} />
            <Stat label="Unidades" value={String(units.length)} />
            <Stat label="Gasto en defensa" value={`${fmtNum(c.budget.defense)} % PIB`} />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Doctrina:</span>
            {(['defensive', 'balanced', 'offensive'] as const).map((d) => <Button key={d} small kind={m.doctrine === d ? 'primary' : 'default'} onClick={() => command({ type: 'setDoctrine', doctrine: d })}>{d === 'defensive' ? 'Defensiva' : d === 'offensive' ? 'Ofensiva' : 'Equilibrada'}</Button>)}
            <Button small onClick={selectAllLand}>Seleccionar todas las terrestres</Button>
          </div>
          <Card title="Unidades">
            <div className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
              {units.map((u) => (
                <button key={u.id} onClick={() => { useGame.getState().setSelectedUnits([u.id]); }} className="flex w-full items-center gap-2 rounded bg-ink-800/60 px-2 py-1 text-left text-xs hover:bg-ink-700">
                  <Badge>{UNIT_INFO[u.type as UnitType].short}</Badge>
                  <span className="flex-1 truncate text-slate-200">{u.name}</span>
                  <span className="w-28 truncate text-slate-400">{provinceName(u.location)}</span>
                  <span className="w-20 text-slate-400">{STATUS_NAMES[u.status] ?? u.status}</span>
                  <span className="w-20 text-slate-500">{u.order ? ORDER_NAMES[u.order] : ''}</span>
                  <span className="w-10 text-right font-mono">{fmtPct(u.strength, 0)}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}
      {tab === 'recruit' && (
        <div className="space-y-3">
          <Card title="Reclutar">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <label className="text-slate-400">Tipo<Select value={type} onChange={setType} className="w-full" options={UNIT_TYPES.map((t) => ({ value: t, label: UNIT_INFO[t].name }))} /></label>
              <label className="text-slate-400">Provincia<Select value={prov} onChange={setProv} className="w-full" options={own.map((p) => ({ value: p.id, label: `${provinceName(p.id)}${p.buildings.port ? ' ⚓' : ''}${p.buildings.airport ? ' ✈' : ''}` }))} /></label>
              <label className="text-slate-400">Cantidad<Select value={String(count)} onChange={(v) => setCount(Number(v))} className="w-full" options={[1, 2, 3, 5].map((n) => ({ value: String(n), label: String(n) }))} /></label>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5 text-xs">
              <Stat label="Coste" value={fmtBn(cost * count, c.currency.code)} />
              <Stat label="Formación" value={`${info.trainingDays} días`} />
              <Stat label="Personal" value={`${info.manpower * count} mil`} />
              <Stat label="Mantenimiento" value={`${fmtBn(info.upkeep * count)}/año`} />
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Equipo requerido: {Object.entries(info.equipment).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(', ')} · {info.requires ? `requiere tecnología ${info.requires}` : ''} {info.domain === 'sea' ? '· requiere puerto' : info.domain === 'air' ? '· requiere aeropuerto' : ''}</div>
            <div className="mt-2 flex justify-end"><Button kind="primary" onClick={() => command({ type: 'recruit', unitType: type, province: prov, count })}>Reclutar</Button></div>
          </Card>
          <Card title="Arsenal (juegos de equipo)">
            <div className="grid grid-cols-4 gap-1.5">
              <Stat label="Armamento" value={fmtNum(m.equipment.arms, 1)} />
              <Stat label="Vehículos" value={fmtNum(m.equipment.vehicles, 1)} />
              <Stat label="Aeronaves" value={fmtNum(m.equipment.aircraft, 2)} />
              <Stat label="Buques" value={fmtNum(m.equipment.ships, 2)} />
            </div>
          </Card>
          <Card title="Prioridades de producción militar">
            {(['arms', 'vehicles', 'aircraft', 'ships'] as const).map((k) => (
              <div key={k}><div className="text-xs text-slate-400">{{ arms: 'Armamento de infantería', vehicles: 'Vehículos blindados', aircraft: 'Aeronaves', ships: 'Buques' }[k]}</div><Slider value={prod[k]} min={0} max={10} step={1} onChange={(v) => setProd({ ...prod, [k]: v })} /></div>
            ))}
            <div className="mt-2 flex justify-between text-[11px] text-slate-500"><span>La producción depende de la industria militar ({fmtBn(c.econ.sectors.defense.output)}) y del presupuesto que queda tras el mantenimiento.</span><Button small kind="primary" onClick={() => command({ type: 'setProduction', production: prod })}>Aplicar</Button></div>
          </Card>
        </div>
      )}
      {tab === 'plans' && (
        <div className="space-y-3">
          <Card title="Planes activos">
            {priv.plans.map((p) => <div key={p.id} className="flex items-center justify-between text-xs"><span>{p.kind === 'offensive' ? 'Ofensiva' : 'Defensa de frente'} · {p.units.length} unidades{p.targets.length ? ` · ${p.targets.length} objetivos` : ''}{p.enemy ? ` · contra ${countryName(p.enemy)}` : ''}</span><Button small kind="ghost" onClick={() => command({ type: 'cancelPlan', plan: p.id })}>Cancelar</Button></div>)}
            {!priv.plans.length && <div className="text-xs text-slate-500">Sin planes. Los planes asignan órdenes a sus unidades cada día: los frentes se cubren solos y las ofensivas avanzan hacia sus objetivos.</div>}
          </Card>
          <Card title="Nueva ofensiva">
            <div className="text-xs text-slate-400">Selecciona unidades en el mapa ({useGame.getState().selectedUnits.length} seleccionadas) y marca objetivos enemigos.</div>
            <div className="mt-1 max-h-40 overflow-y-auto">
              {enemyProvs.slice(0, 80).map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-brass-500" checked={planTargets.includes(p.id)} onChange={(e) => setPlanTargets(e.target.checked ? [...planTargets, p.id] : planTargets.filter((x) => x !== p.id))} />{p.name}</label>
              ))}
              {!enemyProvs.length && <div className="text-xs text-slate-500">No hay territorio enemigo (no estás en guerra o elige un país en la pestaña Guerra).</div>}
            </div>
            <div className="mt-2 flex gap-2">
              <Button small kind="primary" disabled={!planTargets.length} onClick={() => command({ type: 'createPlan', kind: 'offensive', units: useGame.getState().selectedUnits, targets: planTargets, enemy: enemy || null })}>Crear ofensiva</Button>
              <Button small onClick={() => command({ type: 'createPlan', kind: 'front_defense', units: useGame.getState().selectedUnits, targets: [], enemy: enemy || null })}>Defender el frente con las seleccionadas</Button>
            </div>
          </Card>
        </div>
      )}
      {tab === 'war' && (
        <div className="space-y-3">
          <Card title="Conflictos">
            {priv.wars.map((w) => <div key={w.id} className="flex items-center justify-between text-xs"><span className="text-slate-200">{w.name}</span><div className="flex gap-1"><Badge tone={w.status === 'active' ? 'bad' : 'warn'}>{WAR_STATUS[w.status]}</Badge><Button small onClick={() => useGame.getState().openWarRoom(w.id)}>Sala de conflicto</Button></div></div>)}
            {!priv.wars.length && <div className="text-xs text-slate-500">En paz.</div>}
          </Card>
          <Card title="Declarar la guerra">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="text-slate-400">Objetivo<Select value={target} onChange={setTarget} className="w-full" options={[{ value: '', label: '— elegir —' }, ...others.map((o) => ({ value: o.id, label: `${o.name}${o.human ? ' (jugador)' : ''}` }))]} /></label>
              <label className="text-slate-400">Objetivo de guerra<Select value={goal} onChange={setGoal} className="w-full" options={[{ value: 'claims', label: 'Reivindicaciones territoriales' }, { value: 'conquest', label: 'Conquista' }, { value: 'punitive', label: 'Guerra punitiva' }, { value: 'regime_change', label: 'Cambio de régimen' }]} /></label>
            </div>
            {target && <div className="mt-1 text-[11px] text-slate-400">Reivindicaciones sobre {countryName(target)}: {claimsOnTarget.map(provinceName).join(', ') || 'ninguna'}</div>}
            <p className="mt-2 text-[11px] text-amber-300/80">Romper pactos de no agresión o alianzas daña la confianza mundial. Contra un jugador humano, las operaciones esperan a que esté conectado. Cuesta capital político (más en democracias).</p>
            <div className="mt-2 flex justify-end"><Button kind="danger" disabled={!target} onClick={() => { if (confirm(`¿Declarar la guerra a ${countryName(target)}?`)) void command({ type: 'declareWar', target, goal, provinces: claimsOnTarget }); }}>Declarar la guerra</Button></div>
          </Card>
        </div>
      )}
    </div>
  );
}
