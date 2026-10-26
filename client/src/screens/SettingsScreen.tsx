import { useState } from 'react';
import { useGame } from '../store/game';
import { loadPrefs, savePrefs } from '../net/api';
import { Button, Card, Input } from '../ui/kit';
import { ScreenFrame } from './ScreenFrame';

export function SettingsScreen() {
  const setScreen = useGame((s) => s.setScreen);
  const [p, setP] = useState(loadPrefs());
  const save = () => { savePrefs(p); useGame.getState().toast('Configuración guardada', 'success'); setScreen('menu'); };
  return (
    <ScreenFrame title="Configuración" onBack={() => setScreen('menu')}>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Jugador">
          <label className="block text-xs text-slate-400">Nombre predeterminado<Input value={p.playerName} onChange={(v) => setP({ ...p, playerName: v })} maxLength={32} /></label>
        </Card>
        <Card title="Interfaz y accesibilidad">
          <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brass-500" checked={p.reduceMotion} onChange={(e) => setP({ ...p, reduceMotion: e.target.checked })} />Reducir animaciones del mapa</label>
          <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brass-500" checked={p.mapLabels} onChange={(e) => setP({ ...p, mapLabels: e.target.checked })} />Mostrar nombres en el mapa</label>
          <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brass-500" checked={p.showTutorial} onChange={(e) => setP({ ...p, showTutorial: e.target.checked })} />Mostrar el tutorial contextual</label>
        </Card>
      </div>
      <div className="mt-4 flex justify-end"><Button kind="primary" onClick={save}>Guardar</Button></div>
    </ScreenFrame>
  );
}
