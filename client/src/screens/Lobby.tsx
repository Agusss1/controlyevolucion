import { useState } from 'react';
import type { ClockMode } from '@cyo/shared';
import { useGame } from '../store/game';
import { emit, disconnect, isLocalSession } from '../net/connection';
import { MapView } from '../map/MapView';
import { Badge, Button, Card, Flag, Select } from '../ui/kit';
import { ChatBox } from '../ui/ChatBox';
import { CountryCard } from '../ui/InfoCard';
import { fmtBn, fmtPop, REGIME_NAMES } from '../ui/format';

export function Lobby() {
  const game = useGame((s) => s.game)!;
  const players = useGame((s) => s.players);
  const you = useGame((s) => s.you);
  const settings = useGame((s) => s.settings);
  const view = useGame((s) => s.view);
  const selectedCountry = useGame((s) => s.selectedCountry);
  const session = useGame((s) => s.session);
  const [copied, setCopied] = useState(false);
  const me = players.find((p) => p.id === you?.playerId);
  const admin = you?.admin;
  const taken = new Set(players.map((p) => p.countryId).filter(Boolean));
  const local = isLocalSession(session);
  const invite = `${location.origin}${location.pathname}?join=${game.code}`;
  const sel = view?.countries.find((c) => c.id === selectedCountry);

  const pick = (id: string | null) => emit('lobby:pick', { countryId: id });
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ } };

  return (
    <div className="flex h-full w-full bg-ink-950">
      <div className="relative flex-1">
        <MapView />
        <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-ink-600 bg-ink-900/90 px-4 py-2 shadow-panel">
          <div className="font-display text-2xl font-black tracking-[0.15em] text-brass-300">CYO</div>
          <div className="text-xs text-slate-400">Sala de espera · haz clic en un país del mapa para verlo</div>
        </div>
        {sel && (
          <div className="absolute bottom-4 left-4 w-96">
            <CountryCard id={sel.id} compact />
            <div className="mt-2 flex gap-2">
              <Button kind="primary" disabled={taken.has(sel.id) && me?.countryId !== sel.id} onClick={() => pick(sel.id)}>{me?.countryId === sel.id ? 'Tu país' : taken.has(sel.id) ? 'Ocupado por otro jugador' : `Gobernar ${sel.name}`}</Button>
              {me?.countryId && <Button kind="ghost" onClick={() => pick(null)}>Dejar país</Button>}
            </div>
          </div>
        )}
      </div>
      <aside className="flex w-[380px] flex-col gap-3 overflow-y-auto border-l border-ink-700 bg-ink-900/95 p-3">
        <Card title={game.name} right={<Badge tone="info">Sala de espera</Badge>}>
          <div className="text-xs text-slate-400">{game.worldName}</div>
          {local ? (
            <div className="mt-2 rounded border border-ink-600 bg-ink-800/70 px-2 py-1.5 text-[11px] text-slate-300">Partida local de un jugador contra la IA. El motor corre en este navegador y la partida se guarda aquí mismo.</div>
          ) : (<>
            <div className="mt-2 flex items-center gap-2">
              <div className="rounded border border-brass-500/50 bg-ink-800 px-3 py-1 font-mono text-xl tracking-[0.35em] text-brass-300">{game.code}</div>
              <Button small onClick={() => copy(invite)}>{copied ? '¡Copiado!' : 'Copiar enlace'}</Button>
            </div>
            <div className="mt-1 truncate text-[10px] text-slate-500">{invite}</div>
          </>)}
          {session?.recovery && <details className="mt-2 text-[11px] text-slate-400"><summary className="cursor-pointer">Código de recuperación (guárdalo)</summary><div className="mt-1 break-all font-mono text-[10px] text-slate-300">{session.recovery}</div></details>}
        </Card>
        <Card title={`Jugadores ${players.length}/${game.maxPlayers}`}>
          <div className="space-y-1.5">
            {players.map((p) => {
              const c = view?.countries.find((x) => x.id === p.countryId);
              return (
                <div key={p.id} className="flex items-center gap-2 rounded bg-ink-800/70 px-2 py-1.5">
                  <span className={`h-2 w-2 rounded-full ${p.online ? 'bg-emerald-400' : 'bg-slate-600'}`} title={p.online ? 'Conectado' : 'Desconectado'} />
                  {c ? <Flag flag={c.flag} size={13} /> : <span className="inline-block h-[13px] w-[19px] rounded-sm bg-ink-600" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-slate-100">{p.name}{p.id === you?.playerId && ' (tú)'}</div>
                    <div className="truncate text-[10px] text-slate-400">{c ? c.name : 'Sin país'}</div>
                  </div>
                  {p.role === 'admin' && <Badge tone="warn">Admin</Badge>}
                  <Badge tone={p.ready ? 'good' : 'default'}>{p.ready ? 'Listo' : 'No listo'}</Badge>
                  {admin && p.id !== you?.playerId && <Button small kind="ghost" title="Transferir administración" onClick={() => emit('admin:transfer', { playerId: p.id })}>⇄</Button>}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => emit('lobby:ready', { ready: !me?.ready })} kind={me?.ready ? 'default' : 'primary'}>{me?.ready ? 'No estoy listo' : 'Estoy listo'}</Button>
            {admin && <Button kind="primary" onClick={() => emit('admin:start')}>Comenzar partida</Button>}
          </div>
          {!admin && <div className="mt-2 text-[11px] text-slate-500">El administrador inicia la partida. Después, nadie necesita que siga conectado.</div>}
        </Card>
        {settings && (
          <Card title="Configuración">
            <div className="space-y-2 text-sm">
              <label className="block text-xs text-slate-400">Reloj
                <Select<ClockMode> value={settings.clockMode} onChange={(v) => admin && emit('admin:settings', { clockMode: v })} className="w-full" options={local ? [{ value: 'when_online', label: 'Activo mientras la página está abierta' }, { value: 'paused', label: 'Pausado' }] : [{ value: 'when_online', label: 'Activo con jugadores conectados' }, { value: 'always', label: 'Siempre activo' }, { value: 'paused', label: 'Pausado' }]} />
              </label>
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-brass-500" disabled={!admin} checked={settings.advancedAI} onChange={(e) => emit('admin:settings', { advancedAI: e.target.checked })} />IA avanzada</label>
              <div className="text-[11px] text-slate-500">Privacidad: {settings.privacy === 'public' ? 'pública' : 'privada'} · gracia de reconexión {settings.warGraceSeconds} s · preparación de guerra {settings.warPrepDays} días</div>
            </div>
          </Card>
        )}
        {!me?.countryId && view && (
          <Card title="Países destacados">
            <div className="space-y-1">
              {view.countries.filter((c) => !taken.has(c.id)).sort((a, b) => b.gdp - a.gdp).slice(0, 12).map((c) => (
                <button key={c.id} onClick={() => useGame.getState().selectCountry(c.id)} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-ink-700">
                  <Flag flag={c.flag} size={12} /><span className="flex-1 text-slate-200">{c.name}</span><span className="text-slate-500">{REGIME_NAMES[c.regime]?.split(' ')[0]}</span><span className="w-16 text-right text-slate-400">{fmtPop(c.population)}</span><span className="w-20 text-right text-slate-400" title={c.exact ? undefined : "Estimación pública"}>{c.exact ? "" : "≈"}{fmtBn(c.gdp)}</span>
                </button>
              ))}
            </div>
          </Card>
        )}
        <Card title="Chat de la sala" className="flex min-h-[220px] flex-1 flex-col"><ChatBox channel="global" /></Card>
        <Button kind="ghost" onClick={() => { disconnect(); useGame.getState().setScreen('menu'); }}>Salir al menú</Button>
      </aside>
    </div>
  );
}
