import { useEffect } from 'react';
import { useGame } from './store/game';
import { MainMenu } from './screens/MainMenu';
import { CreateGame } from './screens/CreateGame';
import { JoinGame } from './screens/JoinGame';
import { ContinueGame } from './screens/ContinueGame';
import { SettingsScreen } from './screens/SettingsScreen';
import { InfoScreen } from './screens/InfoScreen';
import { GameScreen } from './screens/GameScreen';
import { Toasts } from './ui/Toasts';
import { connect } from './net/connection';
import { loadSessions } from './net/api';

export function App() {
  const screen = useGame((s) => s.screen);
  const setScreen = useGame((s) => s.setScreen);

  // enlaces de invitación (?join=CODIGO) y reanudación automática (?game=ID)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('join')) setScreen('join');
    const resume = params.get('game');
    if (resume) {
      const s = loadSessions().find((x) => x.gameId === resume);
      if (s) { useGame.getState().setSession(s); connect(s); setScreen('game'); }
    }
  }, [setScreen]);

  return (
    <div className="h-full w-full">
      {screen === 'menu' && <MainMenu />}
      {screen === 'create' && <CreateGame />}
      {screen === 'join' && <JoinGame />}
      {screen === 'continue' && <ContinueGame />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'info' && <InfoScreen />}
      {screen === 'game' && <GameScreen />}
      <Toasts />
    </div>
  );
}
