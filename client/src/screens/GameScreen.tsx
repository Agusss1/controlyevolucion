import { useGame } from '../store/game';
import { disconnect } from '../net/connection';
import { Button } from '../ui/kit';
import { Lobby } from './Lobby';
import { GameHUD } from '../ui/GameHUD';

export function GameScreen() {
  const connection = useGame((s) => s.connection);
  const err = useGame((s) => s.connectionError);
  const game = useGame((s) => s.game);
  const map = useGame((s) => s.map);

  if (!map || !game) {
    return (
      <div className="menu-bg flex h-full flex-col items-center justify-center gap-4">
        <div className="font-display text-5xl font-black tracking-[0.15em] text-brass-300">CYO</div>
        {connection === 'error' ? (
          <>
            <div className="text-red-300">{err ?? 'No se pudo conectar.'}</div>
            <Button onClick={() => { disconnect(); useGame.getState().setScreen('menu'); }}>Volver al menú</Button>
          </>
        ) : <div className="pulse-dot text-sm text-slate-400">{connection === 'reconnecting' ? 'Reconectando con el servidor…' : 'Conectando con el mundo…'}</div>}
      </div>
    );
  }
  return game.status === 'lobby' ? <Lobby /> : <GameHUD />;
}
