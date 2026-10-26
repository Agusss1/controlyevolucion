import { useGame, useCountryView } from '../store/game';
import { UNIT_INFO, TERRAIN_INFO } from '@cyo/simulation';
import { Badge, Bar, Button, Flag, Stat } from './kit';
import { ARCHETYPE_NAMES, REGIME_NAMES, fmtBn, fmtNum, fmtPct, fmtPop, ORDER_NAMES, STATUS_NAMES } from './format';
import { command, emit } from '../net/connection';

export function CountryCard({ id, compact }: { id: string; compact?: boolean }) {
  const c = useCountryView(id);
  const me = useGame((s) => s.you?.countryId);
  const rel = useGame((s) => s.view?.relations[id]);
  const players = useGame((s) => s.players);
  const status = useGame((s) => s.game?.status);
  if (!c) return null;
  const player = players.find((p) => p.countryId === id);
  const approx = !c.exact ? '≈ ' : '';
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-900/95 p-3 shadow-panel">
      <div className="flex items-start gap-2.5">
        <Flag flag={c.flag} size={26} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-base leading-tight text-slate-100">{c.longName}</div>
          <div className="text-[11px] text-slate-400">{REGIME_NAMES[c.regime]} · {ARCHETYPE_NAMES[c.archetype] ?? c.archetype}{c.createdDay > 0 ? ' · Estado nuevo' : ''}</div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {player && <Badge tone="info">Jugador: {player.name}{player.online ? '' : ' (desconectado)'}</Badge>}
            {!player && <Badge>IA</Badge>}
            {c.inDefault && <Badge tone="bad">Default</Badge>}
            {c.bloc && <Badge tone="warn">{c.bloc === 'pacto' ? 'Pacto de Aurelia' : c.bloc === 'concordia' ? 'Concordia' : c.bloc}</Badge>}
            {rel && <Badge tone={rel.opinion > 30 ? 'good' : rel.opinion < -30 ? 'bad' : 'default'}>Relación {rel.opinion > 0 ? '+' : ''}{rel.opinion}</Badge>}
            {rel?.sanctions && <Badge tone="bad">Sanciones</Badge>}
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <Stat label="Población" value={fmtPop(c.population)} />
        <Stat label="PIB" value={approx + fmtBn(c.gdp)} hint={c.exact ? undefined : 'Estimación de la inteligencia'} />
        <Stat label="PIB per cápita" value={approx + fmtNum(c.gdpPerCapita, 0)} />
        <Stat label="Crecimiento" value={approx + fmtPct(c.growth)} tone={c.growth < 0 ? 'bad' : 'good'} />
        <Stat label="Inflación" value={approx + fmtPct(c.inflation)} tone={c.inflation > 0.2 ? 'bad' : null} />
        <Stat label="Estabilidad" value={`${approx}${c.stability}`} tone={c.stability < 30 ? 'bad' : c.stability > 60 ? 'good' : 'warn'} />
        <Stat label="Fuerza militar" value={approx + fmtNum(c.military, 0)} />
        <Stat label="Deuda/PIB" value={approx + fmtPct(c.debtRatio, 0)} />
        <Stat label="Calificación" value={c.rating} />
      </div>
      {!compact && (
        <>
          <div className="mt-2 text-[11px] text-slate-400">{c.history.slice(0, 2).map((h, i) => <p key={i} className="mb-1">{h}</p>)}</div>
          <div className="mt-1 flex flex-wrap gap-1">{c.parties.filter((p) => p.seats > 0).map((p) => <span key={p.short} className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: p.color + '33', color: p.color }}>{p.short} {p.seats}{p.government ? ' ★' : ''}</span>)}</div>
        </>
      )}
      {compact && <div className="mt-2 text-[11px] text-slate-400">{c.history[0]}</div>}
      {status === 'running' && me && me !== id && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button small onClick={() => useGame.getState().openDiplomacy(id)}>Diplomacia</Button>
          <Button small onClick={() => command({ type: 'diploAction', to: id, action: 'improve_relations' })}>Mejorar relaciones</Button>
        </div>
      )}
      {status === 'running' && !me && !player && <div className="mt-2"><Button small kind="primary" onClick={() => emit('lobby:pick', { countryId: id })}>Gobernar {c.name}</Button></div>}
    </div>
  );
}

export function ProvinceCard({ id }: { id: string }) {
  const map = useGame((s) => s.map);
  const view = useGame((s) => s.view);
  const priv = useGame((s) => s.priv);
  if (!map || !view) return null;
  const idx = map.provinces.findIndex((p) => p.id === id);
  const p = map.provinces[idx];
  if (!p) return null;
  const owner = view.countries.find((c) => c.id === view.owner[idx]);
  const ctrl = view.controller[idx] !== view.owner[idx] ? view.countries.find((c) => c.id === view.controller[idx]) : null;
  const own = priv?.provinces.find((x) => x.id === id);
  const capital = view.countries.some((c) => c.capital === id);
  const res = p.resources;
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-900/95 p-3 shadow-panel">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display text-base text-slate-100">{p.name}{capital && ' ★'}</div>
          <div className="text-[11px] text-slate-400">{p.cityName} · {TERRAIN_INFO[p.terrain].name} · clima {p.climate === 'arid' ? 'árido' : p.climate === 'tropical' ? 'tropical' : p.climate === 'polar' ? 'polar' : p.climate === 'cold' ? 'frío' : 'templado'}{p.river === 2 ? ' · río navegable' : p.river ? ' · río' : ''}{p.coastal ? ' · costa' : ''}</div>
        </div>
        {owner && <Flag flag={owner.flag} size={18} />}
      </div>
      <div className="mt-1 text-xs text-slate-300">Soberanía: <span style={{ color: owner?.color }}>{owner?.name}</span>{ctrl && <> · <span className="text-red-300">Ocupada por {ctrl.name}</span></>}</div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <Stat label="Población" value={fmtPop(view.pop[idx])} />
        <Stat label="Infraestructura" value={fmtPct(view.infra[idx], 0)} />
        <Stat label="Malestar" value={fmtPct(view.unrest[idx], 0)} tone={view.unrest[idx] > 0.5 ? 'bad' : null} />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1 text-[10px] text-slate-400">
        {res.oil > 0 && <span>Petróleo {fmtNum(own?.reserves.oil ?? res.oil, 0)}</span>}
        {res.gas > 0 && <span>Gas {fmtNum(own?.reserves.gas ?? res.gas, 0)}</span>}
        {res.coal > 0 && <span>Carbón {fmtNum(res.coal, 0)}</span>}
        {res.minerals > 0 && <span>Minerales {fmtNum(res.minerals, 0)}</span>}
        <span>Fértil {fmtNum(res.fertile, 0)}</span>
        {res.timber > 0 && <span>Madera {fmtNum(res.timber, 0)}</span>}
        {res.fish > 0 && <span>Pesca {fmtNum(res.fish, 1)}</span>}
        {res.hydro > 0 && <span>Hidro {fmtNum(res.hydro, 1)}</span>}
      </div>
      <div className="mt-1 text-[10px] text-slate-500">Cultura: {map.cultures.find((c) => c.id === p.culture)?.name} · Religión: {map.religions.find((r) => r.id === p.religion)?.name} · Rugosidad {fmtPct(p.roughness, 0)}</div>
      {own && (
        <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
          {Object.entries(own.buildings).filter(([, v]) => v > 0).map(([k, v]) => <Badge key={k}>{BUILDING_NAMES[k] ?? k} {v}</Badge>)}
        </div>
      )}
    </div>
  );
}

export const BUILDING_NAMES: Record<string, string> = { port: 'Puerto', airport: 'Aeropuerto', power_plant: 'Central', industrial_zone: 'Polo industrial', military_base: 'Base militar', fortification: 'Fortificación', refinery: 'Refinería', university: 'Universidad', road: 'Red vial' };

export function UnitsPanel() {
  const ids = useGame((s) => s.selectedUnits);
  const view = useGame((s) => s.view);
  const map = useGame((s) => s.map);
  if (!ids.length || !view || !map) return null;
  const units = ids.map((id) => view.units.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);
  if (!units.length) return null;
  const locName = (loc: string) => map.provinces.find((p) => p.id === loc)?.name ?? map.seaZones.find((z) => z.id === loc)?.name ?? loc;
  return (
    <div className="rounded-lg border border-brass-500/40 bg-ink-900/95 p-3 shadow-panel">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-display text-sm text-brass-300">{units.length} unidad(es) seleccionada(s)</div>
        <Button small kind="ghost" onClick={() => useGame.getState().setSelectedUnits([])}>✕</Button>
      </div>
      <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {units.map((u) => (
          <div key={u.id} className="rounded bg-ink-800/80 px-2 py-1.5 text-xs">
            <div className="flex justify-between"><span className="text-slate-100">{u.name || UNIT_INFO[u.type as keyof typeof UNIT_INFO]?.name}</span><span className="text-slate-400">{STATUS_NAMES[u.status] ?? u.status}</span></div>
            <div className="text-[10px] text-slate-400">{locName(u.location)}{u.order ? ` · ${ORDER_NAMES[u.order] ?? u.order}${u.target ? ' → ' + locName(u.target) : ''}` : ''}{u.path.length ? ` · ${u.path.length} etapa(s)` : ''}</div>
            <div className="mt-1 grid grid-cols-3 gap-x-2 gap-y-0.5 text-[10px] text-slate-400">
              <span>Fuerza <Bar value={u.strength} color="#3fb950" /></span>
              <span>Organización <Bar value={u.organization} color="#58a6ff" /></span>
              <span>Suministros <Bar value={u.supply} color="#d29922" /></span>
              <span>Equipo <Bar value={u.equipment} color="#bc8cff" /></span>
              <span>Moral <Bar value={u.morale} color="#f778ba" /></span>
              <span>Entrenamiento <Bar value={u.training} color="#7ee787" /></span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button small onClick={() => command({ type: 'orderUnits', units: ids, order: 'defend', target: null })}>Defender / atrincherarse</Button>
        <Button small onClick={() => command({ type: 'orderUnits', units: ids, order: 'retreat', target: null })}>Retirarse</Button>
        <Button small onClick={() => command({ type: 'orderUnits', units: ids, order: 'blockade', target: null })}>Bloqueo (flotas)</Button>
        <Button small onClick={() => command({ type: 'createPlan', kind: 'front_defense', units: ids, targets: [], enemy: null })}>Asignar a defensa de frente</Button>
        <Button small kind="danger" onClick={() => ids.forEach((id) => command({ type: 'disbandUnit', unit: id }))}>Disolver</Button>
      </div>
      <div className="mt-1 text-[10px] text-slate-500">Clic derecho en el mapa para mover o atacar. Aviones: clic derecho sobre una provincia para superioridad aérea o apoyo cercano.</div>
    </div>
  );
}
