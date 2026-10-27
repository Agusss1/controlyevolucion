import { useState } from 'react';
import type { ClockMode, GameSettings } from '@cyo/shared';
import { useGame } from '../store/game';
import { api, loadPrefs, saveSession, savePrefs } from '../net/api';
import { connect } from '../net/connection';
import { Button, Card, Input, Select } from '../ui/kit';
import { ScreenFrame } from './ScreenFrame';
import { useServer } from '../net/useServer';
import { DEFAULT_SETTINGS } from '@cyo/shared';

export function CreateGame() {
  const setScreen = useGame((s) => s.setScreen);
  const prefs = loadPrefs();
  const [name, setName] = useState('Partida de CYO');
  const [player, setPlayer] = useState(prefs.playerName);
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [privacy, setPrivacy] = useState<'private' | 'public'>('private');
  const [advancedAI, setAdvancedAI] = useState(true);
  const [clockMode, setClockMode] = useState<ClockMode>('when_online');
  const [worldMode, setWorldMode] = useState<'official' | 'random'>('official');
  const [seed, setSeed] = useState('');
  const [countries, setCountries] = useState(52);
  const [grace, setGrace] = useState(90);
  const [prep, setPrep] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const server = useServer();
  const local = server === false;

  const submit = async () => {
    if (player.trim().length < 2) { setError('Escribe tu nombre (mínimo 2 letras).'); return; }
    setBusy(true); setError(null);
    try {
      const settings: Partial<GameSettings> = { name, maxPlayers, privacy, advancedAI, clockMode, world: { mode: worldMode, seed: seed || undefined, countries: worldMode === 'random' ? countries : undefined }, warGraceSeconds: grace, warPrepDays: prep };
      savePrefs({ ...prefs, playerName: player.trim() });
      if (local) {
        // sin servidor: partida de un jugador con el motor en el navegador
        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const session = { gameId: `local:${id}`, code: 'LOCAL', playerId: 'local', token: '', name: player.trim(), savedAt: Date.now() };
        useGame.getState().setSession(session);
        connect(session, { settings: { ...DEFAULT_SETTINGS, ...settings, clockMode: clockMode === 'always' ? 'when_online' : clockMode } as GameSettings, playerName: player.trim() });
        setScreen('game');
        return;
      }
      const r = await api.createGame(settings, player.trim(), null);
      const session = { gameId: r.gameId, code: r.code, playerId: r.playerId, token: r.token, name: player.trim(), recovery: r.recovery, savedAt: Date.now() };
      saveSession(session);
      useGame.getState().setSession(session);
      connect(session);
      setScreen('game');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <ScreenFrame title="Nueva partida" onBack={() => setScreen('menu')}>
      {local && (
        <div className="mb-4 rounded border border-sky-500/40 bg-sky-950/40 px-3 py-2 text-sm text-sky-100">
          <b>Modo un jugador.</b> Este sitio no tiene servidor multijugador: el motor de CYO correrá dentro de tu navegador contra la IA, con el mismo reloj (20 s = 1 día) mientras la página esté abierta. La partida se guarda en este navegador.
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Sala">
          <label className="mb-2 block text-xs text-slate-400">Nombre de la partida<Input value={name} onChange={setName} maxLength={60} /></label>
          <label className="mb-2 block text-xs text-slate-400">Tu nombre<Input value={player} onChange={setPlayer} maxLength={32} placeholder="Cómo te verán los demás" /></label>
          {!local && <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-slate-400">Jugadores máximos<Input type="number" value={String(maxPlayers)} onChange={(v) => setMaxPlayers(Math.max(1, Math.min(64, Number(v) || 1)))} /></label>
            <label className="block text-xs text-slate-400">Privacidad<Select value={privacy} onChange={setPrivacy} className="w-full" options={[{ value: 'private', label: 'Privada (solo con código)' }, { value: 'public', label: 'Pública (listada)' }]} /></label>
          </div>}
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={advancedAI} onChange={(e) => setAdvancedAI(e.target.checked)} className="accent-brass-500" />IA avanzada (diplomacia, leyes, guerras y obras de los países sin jugador)</label>
        </Card>
        <Card title="Mundo">
          <div className="mb-3 grid grid-cols-2 gap-2">
            {(['official', 'random'] as const).map((m) => (
              <button key={m} onClick={() => setWorldMode(m)} className={`rounded-md border p-3 text-left ${worldMode === m ? 'border-brass-500 bg-brass-500/10' : 'border-ink-500 bg-ink-800 hover:border-ink-500/80'}`}>
                <div className="font-display text-sm text-slate-100">{m === 'official' ? 'Mundo oficial: Vereth' : 'Mundo aleatorio'}</div>
                <div className="text-[11px] text-slate-400">{m === 'official' ? '47 países diseñados, historia documentada, idéntico en todas las partidas.' : 'Continentes, países, recursos e historia generados por semilla.'}</div>
              </button>
            ))}
          </div>
          {worldMode === 'random' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-slate-400">Semilla (vacía = al azar)<Input value={seed} onChange={setSeed} maxLength={40} placeholder="p. ej. nueva-era" /></label>
              <label className="block text-xs text-slate-400">Países (40-70)<Input type="number" value={String(countries)} onChange={(v) => setCountries(Math.max(40, Math.min(70, Number(v) || 40)))} /></label>
            </div>
          )}
        </Card>
        <Card title="Reloj">
          <Select value={clockMode} onChange={setClockMode} className="w-full" options={local ? [
            { value: 'when_online', label: 'Activo mientras la página esté abierta' },
            { value: 'paused', label: 'Pausado (lo activas tú)' }
          ] : [
            { value: 'when_online', label: 'Activo si hay al menos un jugador conectado' },
            { value: 'always', label: 'Activo permanentemente (aunque no haya nadie)' },
            { value: 'paused', label: 'Pausado (el administrador lo activa)' }
          ]} />
          <p className="mt-2 text-xs text-slate-400">Escala fija: 20 segundos reales = 1 día · 1 hora = 6 meses · 2 horas = 1 año.</p>
        </Card>
        {!local && <Card title="Guerras entre jugadores">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-slate-400">Gracia de reconexión (s)<Input type="number" value={String(grace)} onChange={(v) => setGrace(Math.max(5, Math.min(600, Number(v) || 5)))} /></label>
            <label className="block text-xs text-slate-400">Días de preparación<Input type="number" value={String(prep)} onChange={(v) => setPrep(Math.max(0, Math.min(30, Number(v) || 0)))} /></label>
          </div>
          <p className="mt-2 text-xs text-slate-400">Una guerra con jugadores humanos solo avanza cuando todos los participantes obligatorios están conectados.</p>
        </Card>}
      </div>
      {error && <div className="mt-3 rounded border border-red-500/40 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</div>}
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={() => setScreen('menu')}>Cancelar</Button>
        <Button kind="primary" disabled={busy || server === null} onClick={submit}>{busy ? 'Creando el mundo…' : server === null ? 'Comprobando servidor…' : local ? 'Crear partida (un jugador)' : 'Crear partida'}</Button>
      </div>
    </ScreenFrame>
  );
}
