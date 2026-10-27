import { useGame } from '../store/game';
import { useQuery } from '@tanstack/react-query';
import { loadSessions } from '../net/api';
import { useServer } from '../net/useServer';
import { listSaves } from '../local/db';

function MenuButton({ label, desc, onClick, primary }: { label: string; desc: string; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} className={`group w-full rounded-lg border px-5 py-3 text-left transition ${primary ? 'border-brass-500/80 bg-brass-500/15 hover:bg-brass-500/25' : 'border-ink-500/80 bg-ink-850/70 hover:border-brass-500/60 hover:bg-ink-800'}`}>
      <div className="font-display text-lg tracking-wide text-slate-100 group-hover:text-brass-300">{label}</div>
      <div className="text-xs text-slate-400">{desc}</div>
    </button>
  );
}

export function MainMenu() {
  const setScreen = useGame((s) => s.setScreen);
  const sessions = loadSessions();
  const server = useServer();
  const locals = useQuery({ queryKey: ['local-saves'], queryFn: () => listSaves().catch(() => []) });
  const saved = (server === false ? 0 : sessions.length) + (locals.data?.length ?? 0);
  return (
    <div className="menu-bg relative flex h-full w-full items-center justify-center overflow-hidden">
      <img src="vereth.png" alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.22] blur-[1px]" />
      <div className="grid-lines pointer-events-none absolute inset-0" />
      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center gap-10 px-6 md:flex-row md:items-center md:justify-between">
        <div className="text-center md:text-left">
          <div className="text-xs uppercase tracking-[0.5em] text-brass-400/80">Simulador geopolítico</div>
          <h1 className="title-glow font-display text-[7rem] font-black leading-none tracking-[0.12em] text-brass-300 md:text-[9rem]">CYO</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-300">
            Vereth, 1 de enero de 1990. Cuarenta y siete Estados, seis masas de tierra y ningún destino escrito.
            Gobierna, comercia, legisla, investiga y, si no queda otra, combate.
          </p>
          <p className="mt-3 text-xs text-slate-500">1 hora real = 6 meses de juego · {server === false ? 'modo un jugador en el navegador' : 'multijugador persistente'} · sin turnos</p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-2.5">
          <MenuButton primary label="Nueva partida" desc={server === false ? 'Un jugador contra la IA, directamente en tu navegador' : 'Crea una sala, elige mundo y comparte el código'} onClick={() => setScreen('create')} />
          <MenuButton label="Unirse con código" desc="Entra a la partida de tus amigos" onClick={() => setScreen('join')} />
          <MenuButton label="Continuar partida" desc={saved ? `${saved} partida(s) guardada(s) en este navegador` : 'Recupera tus partidas y tu país'} onClick={() => setScreen('continue')} />
          <MenuButton label="Configuración" desc="Nombre, interfaz y accesibilidad" onClick={() => setScreen('settings')} />
          <MenuButton label="Información del juego" desc="Cómo se juega y cómo funciona el mundo" onClick={() => setScreen('info')} />
        </div>
      </div>
      <div className="absolute bottom-3 text-[10px] text-slate-600">CYO · versión 0.1 · mundo ficticio, cualquier parecido con la Tierra es coincidencia</div>
    </div>
  );
}
