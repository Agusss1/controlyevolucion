import { useEffect, useState } from 'react';
import { useGame, type MapLayer, type PanelId } from '../store/game';
import { MapView } from '../map/MapView';
import { Badge, Button, Flag, cls } from './kit';
import { fmtBn, fmtPct, fmtPop, WAR_STATUS } from './format';
import { CountryCard, ProvinceCard, UnitsPanel } from './InfoCard';
import { PanelHost } from '../panels/PanelHost';
import { DecisionsModal } from './Decisions';
import { WarRoom } from './WarRoom';
import { ChatBox } from './ChatBox';
import { Tutorial } from './Tutorial';
import { disconnect, emit } from '../net/connection';
import { totalRevenueOf } from '../panels/util';

const MENU: { id: PanelId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Resumen nacional', icon: '◉' },
  { id: 'government', label: 'Gobierno', icon: '♜' },
  { id: 'economy', label: 'Economía', icon: '◈' },
  { id: 'budget', label: 'Presupuesto', icon: '▤' },
  { id: 'taxes', label: 'Impuestos', icon: '％' },
  { id: 'society', label: 'Sociedad', icon: '☷' },
  { id: 'infrastructure', label: 'Infraestructura', icon: '⌂' },
  { id: 'industry', label: 'Industria', icon: '⚙' },
  { id: 'energy', label: 'Energía', icon: 'ϟ' },
  { id: 'trade', label: 'Comercio exterior', icon: '⇄' },
  { id: 'defense', label: 'Defensa', icon: '⚔' },
  { id: 'diplomacy', label: 'Diplomacia', icon: '✉' },
  { id: 'intelligence', label: 'Inteligencia', icon: '◎' },
  { id: 'technology', label: 'Tecnología', icon: '⚛' },
  { id: 'legislation', label: 'Legislación', icon: '§' },
  { id: 'elections', label: 'Elecciones', icon: '☑' },
  { id: 'statistics', label: 'Estadísticas', icon: '▥' },
  { id: 'history', label: 'Historia nacional', icon: '❦' },
  { id: 'world', label: 'Mundo', icon: '◍' }
];

const LAYERS: { id: MapLayer; label: string }[] = [
  { id: 'political', label: 'Político' }, { id: 'geographic', label: 'Geográfico' }, { id: 'economic', label: 'Económico' }, { id: 'population', label: 'Población' },
  { id: 'resources', label: 'Recursos' }, { id: 'infrastructure', label: 'Infraestructura' }, { id: 'trade', label: 'Comercio' }, { id: 'diplomacy', label: 'Influencia' },
  { id: 'alliances', label: 'Alianzas' }, { id: 'military', label: 'Militar' }, { id: 'fronts', label: 'Frentes' }, { id: 'stability', label: 'Estabilidad' },
  { id: 'technology', label: 'Tecnología' }, { id: 'culture', label: 'Culturas' }
];

export function GameHUD() {
  const panel = useGame((s) => s.panel);
  const openPanel = useGame((s) => s.openPanel);
  const selectedProvince = useGame((s) => s.selectedProvince);
  const selectedCountry = useGame((s) => s.selectedCountry);
  const warRoom = useGame((s) => s.warRoom);
  const me = useGame((s) => s.you?.countryId);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') { openPanel(null); useGame.getState().setSelectedUnits([]); useGame.getState().openWarRoom(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPanel]);

  return (
    <div className="flex h-full w-full flex-col bg-ink-950">
      <TopBar onChat={() => setChatOpen((v) => !v)} />
      <div className="relative flex min-h-0 flex-1">
        <nav className="z-20 flex w-12 flex-col items-center gap-0.5 overflow-y-auto border-r border-ink-700 bg-ink-900/95 py-2">
          {MENU.map((m) => (
            <button key={m.id} title={m.label} disabled={!me && m.id !== 'world' && m.id !== 'history'} onClick={() => openPanel(panel === m.id ? null : m.id)}
              className={cls('flex h-9 w-9 items-center justify-center rounded-md text-lg transition disabled:opacity-25', panel === m.id ? 'bg-brass-500/20 text-brass-300' : 'text-slate-400 hover:bg-ink-700 hover:text-slate-100')}>{m.icon}</button>
          ))}
        </nav>
        <div className="relative min-w-0 flex-1">
          <MapView />
          {panel && (
            <div className="panel-enter absolute bottom-0 left-0 top-0 z-10 w-[560px] max-w-[92%] overflow-hidden border-r border-ink-600 bg-ink-900 shadow-panel">
              <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2">
                <h2 className="font-display text-lg text-brass-300">{MENU.find((m) => m.id === panel)?.label ?? 'Noticias'}</h2>
                <Button small kind="ghost" onClick={() => openPanel(null)}>✕</Button>
              </div>
              <div className="h-[calc(100%-44px)] overflow-y-auto p-4"><PanelHost panel={panel} /></div>
            </div>
          )}
          <div className="pointer-events-none absolute right-3 top-3 z-10 flex w-[360px] flex-col gap-2">
            <div className="pointer-events-auto"><UnitsPanel /></div>
            {selectedProvince && <div className="pointer-events-auto"><ProvinceCard id={selectedProvince} /></div>}
            {selectedCountry && <div className="pointer-events-auto"><CountryCard id={selectedCountry} /></div>}
          </div>
          <LayerBar />
          <NewsTicker />
          {chatOpen && (
            <div className="absolute bottom-14 right-3 z-20 flex h-80 w-[360px] flex-col rounded-lg border border-ink-600 bg-ink-900/95 p-3 shadow-panel">
              <div className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-wide text-brass-300">Chat global<button onClick={() => setChatOpen(false)} className="text-slate-400">✕</button></div>
              <ChatBox channel="global" />
            </div>
          )}
        </div>
      </div>
      <DecisionsModal />
      {warRoom && <WarRoom warId={warRoom} />}
      <Tutorial />
    </div>
  );
}

function TopBar({ onChat }: { onChat: () => void }) {
  const priv = useGame((s) => s.priv);
  const view = useGame((s) => s.view);
  const date = useGame((s) => s.date);
  const connection = useGame((s) => s.connection);
  const game = useGame((s) => s.game);
  const settings = useGame((s) => s.settings);
  const you = useGame((s) => s.you);
  const unread = useGame((s) => s.unreadNews);
  const session = useGame((s) => s.session);
  const [menu, setMenu] = useState(false);
  const c = priv?.country;
  const pv = view?.countries.find((x) => x.id === c?.id);
  const pendingProposals = priv?.proposals.filter((p) => p.to === c?.id && p.status === 'pending').length ?? 0;
  const wars = priv?.wars.filter((w) => w.status !== 'ended') ?? [];
  const calls = priv?.wars.filter((w) => w.callsToArms.some((x) => x.country === c?.id && x.status === 'pending')) ?? [];
  return (
    <header className="z-30 flex h-12 shrink-0 items-center gap-3 border-b border-ink-700 bg-gradient-to-b from-ink-850 to-ink-900 px-3">
      <span className="font-display text-xl font-black tracking-[0.15em] text-brass-300">CYO</span>
      {c && pv ? (
        <button className="flex items-center gap-2" onClick={() => useGame.getState().openPanel('overview')}>
          <Flag flag={c.flag} size={20} />
          <div className="text-left leading-tight"><div className="text-sm font-semibold text-slate-100">{c.name}</div><div className="text-[10px] text-slate-400">{c.politics.headOfGovernment}</div></div>
        </button>
      ) : <span className="text-sm text-slate-400">Observador · elige un país libre en el mapa</span>}
      <div className="rounded border border-ink-600 bg-ink-800 px-2 py-0.5 font-mono text-sm text-brass-300" title="20 segundos reales = 1 día">{date}</div>
      {c && (
        <div className="hidden items-center gap-3 text-xs lg:flex">
          <TopStat label="PIB" value={fmtBn(c.econ.realGDP)} />
          <TopStat label="Tesoro" value={`${fmtBn(c.fiscal.treasury, c.currency.code)}`} tone={c.fiscal.treasury < 0 ? 'bad' : null} />
          <TopStat label="Inflación" value={fmtPct(c.econ.inflation)} tone={c.econ.inflation > 0.2 ? 'bad' : null} />
          <TopStat label="Población" value={fmtPop(c.demography.young + c.demography.adult + c.demography.old)} />
          <TopStat label="Estabilidad" value={c.politics.stability.toFixed(0)} tone={c.politics.stability < 30 ? 'bad' : c.politics.stability > 60 ? 'good' : null} />
          <TopStat label="Aprobación" value={c.politics.approval.toFixed(0)} tone={c.politics.approval < 30 ? 'bad' : null} />
          <TopStat label="Saldo fiscal" value={fmtPct(c.fiscal.balance / Math.max(1e-9, priv!.nominalGDP))} tone={c.fiscal.balance < 0 ? 'warn' : 'good'} />
          <span className="hidden xl:inline text-[10px] text-slate-500">Ingresos {fmtPct(totalRevenueOf(c) / Math.max(1e-9, priv!.nominalGDP))} del PIB</span>
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        {c && c.decisions.length > 0 && <Badge tone="warn">{c.decisions.length} decisión(es)</Badge>}
        {pendingProposals > 0 && <button onClick={() => useGame.getState().openPanel('diplomacy')}><Badge tone="info">{pendingProposals} propuesta(s)</Badge></button>}
        {calls.length > 0 && <button onClick={() => useGame.getState().openWarRoom(calls[0].id)}><Badge tone="bad">Llamada a las armas</Badge></button>}
        {wars.map((w) => <button key={w.id} onClick={() => useGame.getState().openWarRoom(w.id)}><Badge tone={w.status === 'active' ? 'bad' : 'warn'}>⚔ {WAR_STATUS[w.status]}</Badge></button>)}
        <button onClick={() => { useGame.getState().openPanel('news'); useGame.getState().markNewsRead(); }} className="relative text-sm text-slate-300 hover:text-white" title="Noticias">📰{unread > 0 && <span className="absolute -right-2 -top-1 rounded-full bg-signal-red px-1 text-[9px] text-white">{unread}</span>}</button>
        <button onClick={onChat} className="text-sm text-slate-300 hover:text-white" title="Chat">💬</button>
        <span className={cls('h-2 w-2 rounded-full', connection === 'connected' ? 'bg-emerald-400' : 'pulse-dot bg-amber-400')} title={connection === 'connected' ? 'Conectado' : 'Reconectando…'} />
        <div className="relative">
          <Button small kind="ghost" onClick={() => setMenu((v) => !v)}>☰</Button>
          {menu && (
            <div className="absolute right-0 top-8 z-50 w-72 rounded-lg border border-ink-600 bg-ink-900 p-3 text-xs shadow-panel">
              <div className="font-display text-sm text-slate-100">{game?.name}</div>
              <div className="text-slate-400">Código: <span className="font-mono text-brass-300">{game?.code}</span> · reloj: {settings?.clockMode === 'always' ? 'siempre activo' : settings?.clockMode === 'paused' ? 'pausado' : 'con jugadores'}</div>
              {session?.recovery && <details className="mt-2"><summary className="cursor-pointer text-slate-300">Código de recuperación</summary><div className="mt-1 break-all font-mono text-[10px]">{session.recovery}</div></details>}
              {you?.admin && (
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button small onClick={() => emit('admin:settings', { clockMode: settings?.clockMode === 'paused' ? 'when_online' : 'paused' })}>{settings?.clockMode === 'paused' ? 'Reanudar reloj' : 'Pausar reloj'}</Button>
                  <Button small onClick={() => emit('admin:settings', { clockMode: 'always' })}>Reloj siempre activo</Button>
                </div>
              )}
              {c && <div className="mt-2"><Button small kind="danger" onClick={() => { if (confirm('¿Abandonar tu país? Volverá a la IA.')) void emit('admin:release', { playerId: you!.playerId }); }}>Abandonar el país</Button></div>}
              <div className="mt-2"><Button small onClick={() => { disconnect(); useGame.getState().setScreen('menu'); }}>Salir al menú</Button></div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function TopStat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'warn' | null }) {
  return <div className="leading-tight"><div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div><div className={cls('font-mono', tone === 'bad' ? 'text-red-300' : tone === 'good' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-slate-200')}>{value}</div></div>;
}

function LayerBar() {
  const layer = useGame((s) => s.layer);
  const setLayer = useGame((s) => s.setLayer);
  return (
    <div className="absolute bottom-9 left-1/2 z-10 flex max-w-[95%] -translate-x-1/2 flex-wrap justify-center gap-0.5 rounded-lg border border-ink-600 bg-ink-900/90 p-1 shadow-panel">
      {LAYERS.map((l) => (
        <button key={l.id} onClick={() => setLayer(l.id)} className={cls('rounded px-2 py-0.5 text-[11px] transition', layer === l.id ? 'bg-brass-500/25 text-brass-300' : 'text-slate-400 hover:bg-ink-700 hover:text-slate-100')}>{l.label}</button>
      ))}
    </div>
  );
}

function NewsTicker() {
  const news = useGame((s) => s.news);
  const top = news.filter((n) => n.severity !== 'info').slice(0, 6);
  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 flex h-7 items-center gap-4 overflow-hidden border-t border-ink-700 bg-ink-900/95 px-3 text-xs">
      <span className="shrink-0 font-display text-brass-400">Diario de Vereth</span>
      <div className="flex min-w-0 gap-6 overflow-hidden whitespace-nowrap text-slate-300">
        {top.map((n) => <span key={n.id} className={n.severity === 'critical' ? 'text-red-300' : n.severity === 'major' ? 'text-amber-200' : ''}>• {n.title}</span>)}
        {!top.length && <span className="text-slate-500">Sin novedades importantes.</span>}
      </div>
    </div>
  );
}
