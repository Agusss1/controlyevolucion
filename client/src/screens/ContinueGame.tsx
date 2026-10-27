import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { formatDate } from '@cyo/shared';
import { useGame } from '../store/game';
import { api, forgetSession, loadSessions, saveSession, type SessionInfo } from '../net/api';
import { connect } from '../net/connection';
import { Badge, Button, Card, Input } from '../ui/kit';
import { ScreenFrame } from './ScreenFrame';
import { useServer } from '../net/useServer';
import { deleteSave, listSaves, type LocalMeta } from '../local/db';

export function ContinueGame() {
  const setScreen = useGame((s) => s.setScreen);
  const [sessions, setSessions] = useState(loadSessions());
  const [recovery, setRecovery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const server = useServer();
  const mine = useQuery({ queryKey: ['mine', sessions.map((s) => s.gameId).join(',')], queryFn: () => api.mine(sessions.map((s) => s.gameId)), enabled: server === true });
  const pub = useQuery({ queryKey: ['public'], queryFn: () => api.publicGames(), enabled: server === true });
  const locals = useQuery({ queryKey: ['local-saves'], queryFn: () => listSaves().catch(() => [] as LocalMeta[]) });
  const resumeLocal = (m: LocalMeta) => resume({ gameId: `local:${m.id}`, code: 'LOCAL', playerId: 'local', token: '', name: m.playerName, savedAt: Date.now() });
  const removeLocal = async (m: LocalMeta) => {
    if (!confirm(`¿Borrar definitivamente «${m.name}»? No se puede deshacer.`)) return;
    await deleteSave(m.id);
    void locals.refetch();
  };

  const resume = (s: SessionInfo) => {
    useGame.getState().setSession(s);
    connect(s);
    setScreen('game');
  };
  const recover = async () => {
    setError(null);
    try {
      const r = await api.recover(recovery);
      const s = { gameId: r.gameId, code: r.code, playerId: r.playerId, token: r.token, name: r.name, recovery, savedAt: Date.now() };
      saveSession(s);
      resume(s);
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <ScreenFrame title="Continuar partida" onBack={() => setScreen('menu')}>
      {(locals.data?.length ?? 0) > 0 && (
        <Card title="Partidas de un jugador en este navegador" className="mb-4">
          <div className="space-y-2">
            {locals.data!.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded border border-ink-600 bg-ink-800/60 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-100">{m.name} <span className="text-xs text-slate-500">{m.worldName}</span></div>
                  <div className="text-[11px] text-slate-400">{formatDate(m.day)} · {m.countryName ? `gobernando ${m.countryName}` : 'sin país elegido'} · como {m.playerName}</div>
                </div>
                <Badge tone={m.status === 'running' ? 'good' : 'info'}>{m.status === 'running' ? 'En curso' : 'Sala'}</Badge>
                <Button small kind="primary" onClick={() => resumeLocal(m)}>Continuar</Button>
                <Button small kind="ghost" onClick={() => void removeLocal(m)}>✕</Button>
              </div>
            ))}
          </div>
        </Card>
      )}
      {server === false ? (
        <div className="rounded border border-ink-600 bg-ink-850/70 px-3 py-2 text-sm text-slate-400">
          {locals.data?.length ? 'Las partidas multijugador necesitan el servidor de CYO; este sitio funciona en modo un jugador.' : 'No hay partidas guardadas en este navegador. Crea una desde «Nueva partida».'}
        </div>
      ) : (
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Mis partidas">
          {!sessions.length && <div className="text-sm text-slate-500">No hay partidas guardadas en este navegador.</div>}
          <div className="space-y-2">
            {sessions.map((s) => {
              const g = mine.data?.find((x) => x.id === s.gameId);
              return (
                <div key={s.gameId + s.playerId} className="flex items-center gap-3 rounded border border-ink-600 bg-ink-800/60 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-slate-100">{g?.name ?? 'Partida'} <span className="font-mono text-xs text-slate-500">{s.code}</span></div>
                    <div className="text-[11px] text-slate-400">{g ? `${formatDate(g.day)} · ${g.players}/${g.maxPlayers} jugadores` : mine.isLoading ? 'Consultando…' : 'No encontrada en el servidor'} · como {s.name}</div>
                  </div>
                  {g && <Badge tone={g.status === 'running' ? 'good' : 'info'}>{g.status === 'running' ? 'En curso' : g.status === 'lobby' ? 'Sala' : 'Terminada'}</Badge>}
                  <Button small kind="primary" disabled={!g} onClick={() => resume(s)}>Entrar</Button>
                  <Button small kind="ghost" onClick={() => { forgetSession(s.gameId); setSessions(loadSessions()); }}>✕</Button>
                </div>
              );
            })}
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Recuperar en este dispositivo">
            <p className="mb-2 text-xs text-slate-400">Pega el código de recuperación que obtuviste al crear o unirte a la partida (menú de partida → «Código de recuperación»).</p>
            <Input value={recovery} onChange={setRecovery} placeholder="CODIGO.jugador.clave" className="font-mono text-xs" />
            {error && <div className="mt-2 text-xs text-red-300">{error}</div>}
            <div className="mt-2"><Button disabled={recovery.length < 10} onClick={recover}>Recuperar</Button></div>
          </Card>
          <Card title="Partidas públicas">
            {!pub.data?.length && <div className="text-sm text-slate-500">{pub.isLoading ? 'Cargando…' : 'No hay partidas públicas abiertas.'}</div>}
            <div className="space-y-1.5">
              {pub.data?.map((g) => (
                <div key={g.id} className="flex items-center justify-between rounded border border-ink-600 bg-ink-800/60 px-3 py-1.5 text-sm">
                  <div><div className="text-slate-100">{g.name}</div><div className="text-[11px] text-slate-400">{g.worldName} · {g.players}/{g.maxPlayers} · {formatDate(g.day)}</div></div>
                  <Button small onClick={() => { history.replaceState(null, '', `?join=${g.code}`); setScreen('join'); }}>Unirse</Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
      )}
    </ScreenFrame>
  );
}
