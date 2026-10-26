import { useEffect, useState } from 'react';
import { useGame } from '../store/game';
import { api, loadPrefs, saveSession, savePrefs, type CountryChoice } from '../net/api';
import { connect } from '../net/connection';
import { Badge, Button, Card, Flag, Input } from '../ui/kit';
import { ARCHETYPE_NAMES, REGIME_NAMES, fmtBn, fmtPop } from '../ui/format';
import { ScreenFrame } from './ScreenFrame';

export function JoinGame() {
  const setScreen = useGame((s) => s.setScreen);
  const prefs = loadPrefs();
  const [code, setCode] = useState(new URLSearchParams(location.search).get('join') ?? '');
  const [player, setPlayer] = useState(prefs.playerName);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.preview>> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const c = code.trim();
    if (c.length < 6) { setPreview(null); return; }
    let alive = true;
    api.preview(c).then((p) => { if (alive) { setPreview(p); setError(null); } }).catch((e) => { if (alive) { setPreview(null); setError((e as Error).message); } });
    return () => { alive = false; };
  }, [code]);

  const join = async () => {
    if (player.trim().length < 2) { setError('Escribe tu nombre.'); return; }
    setBusy(true); setError(null);
    try {
      const r = await api.join(code.trim(), player.trim(), selected);
      savePrefs({ ...prefs, playerName: player.trim() });
      const session = { gameId: r.gameId, code: r.code, playerId: r.playerId, token: r.token, name: player.trim(), recovery: r.recovery, savedAt: Date.now() };
      saveSession(session);
      useGame.getState().setSession(session);
      connect(session);
      setScreen('game');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const countries = (preview?.countries ?? []).filter((c) => c.name.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => Number(a.taken) - Number(b.taken) || b.gdp - a.gdp);
  const sel = preview?.countries.find((c) => c.id === selected) ?? null;

  return (
    <ScreenFrame title="Unirse con código" onBack={() => setScreen('menu')}>
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Datos" className="md:col-span-1">
          <label className="mb-2 block text-xs text-slate-400">Código de la partida<Input value={code} onChange={(v) => setCode(v.toUpperCase())} maxLength={12} placeholder="ABC123" className="font-mono tracking-[0.3em]" /></label>
          <label className="mb-2 block text-xs text-slate-400">Tu nombre<Input value={player} onChange={setPlayer} maxLength={32} /></label>
          {preview && (
            <div className="mt-3 space-y-1 text-sm">
              <div className="font-display text-slate-100">{preview.game.name}</div>
              <div className="text-xs text-slate-400">{preview.game.worldName}</div>
              <div className="text-xs text-slate-400">{preview.game.players}/{preview.game.maxPlayers} jugadores · {preview.game.status === 'lobby' ? 'En sala de espera' : `En curso (día ${preview.game.day})`}</div>
              <div className="mt-2 flex flex-wrap gap-1">{preview.players.map((p) => <Badge key={p.name}>{p.name}{p.countryId ? ` · ${preview.countries.find((c) => c.id === p.countryId)?.name ?? ''}` : ''}</Badge>)}</div>
            </div>
          )}
          {error && <div className="mt-3 rounded border border-red-500/40 bg-red-950/50 px-2 py-1 text-xs text-red-200">{error}</div>}
          <div className="mt-4 flex gap-2">
            <Button kind="primary" disabled={!preview || busy} onClick={join}>{selected ? `Gobernar ${sel?.name ?? ''}` : 'Entrar (elegir país después)'}</Button>
          </div>
        </Card>
        <Card title="Países disponibles" className="md:col-span-2" right={<Input value={filter} onChange={setFilter} placeholder="Buscar…" className="w-40 py-0.5 text-xs" />}>
          {!preview && <div className="text-sm text-slate-500">Introduce un código válido para ver los países.</div>}
          <div className="grid max-h-[60vh] grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {countries.map((c: CountryChoice) => (
              <button key={c.id} disabled={c.taken} onClick={() => setSelected(c.id)} className={`flex items-center gap-2 rounded border px-2 py-1.5 text-left transition disabled:opacity-35 ${selected === c.id ? 'border-brass-500 bg-brass-500/10' : 'border-ink-600 bg-ink-800/60 hover:border-ink-500'}`}>
                <Flag flag={c.flag} size={16} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-100">{c.name}{c.taken && ' · ocupado'}</div>
                  <div className="truncate text-[10px] text-slate-400">{REGIME_NAMES[c.regime]} · {ARCHETYPE_NAMES[c.archetype] ?? c.archetype}</div>
                </div>
                <div className="text-right text-[10px] text-slate-400"><div>{fmtPop(c.population)}</div><div>{fmtBn(c.gdp)}</div></div>
              </button>
            ))}
          </div>
          {sel && (
            <div className="mt-3 rounded border border-ink-600 bg-ink-900/60 p-2 text-xs">
              <div className="mb-1 flex items-center gap-2"><Flag flag={sel.flag} size={14} /><span className="font-semibold text-slate-100">{sel.longName}</span></div>
              {sel.history.map((h, i) => <p key={i} className="mb-1 text-slate-300">{h}</p>)}
              <div className="mt-1 grid grid-cols-2 gap-2">
                <div><div className="text-emerald-300">Fortalezas</div>{sel.strengths.map((s) => <div key={s} className="text-slate-300">· {s}</div>)}</div>
                <div><div className="text-red-300">Debilidades</div>{sel.weaknesses.map((s) => <div key={s} className="text-slate-300">· {s}</div>)}</div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </ScreenFrame>
  );
}
