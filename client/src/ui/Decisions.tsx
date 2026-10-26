import { useGame } from '../store/game';
import { command } from '../net/connection';
import { Button } from './kit';

const EMPTY: never[] = [];

/** Decisiones pendientes generadas por eventos (protestas, crisis, separatismo…). */
export function DecisionsModal() {
  const decisions = useGame((s) => s.priv?.country.decisions) ?? EMPTY;
  const date = useGame((s) => s.view?.day ?? 0);
  if (!decisions.length) return null;
  const d = decisions[0];
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-brass-500/50 bg-ink-900 p-5 shadow-panel">
        <div className="text-[10px] uppercase tracking-[0.3em] text-brass-400">Decisión de gobierno · vence en {Math.max(0, d.expiresDay - date)} días</div>
        <h3 className="mt-1 font-display text-2xl text-slate-100">{d.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{d.text}</p>
        <div className="mt-4 space-y-2">
          {d.options.map((o) => (
            <button key={o.id} onClick={() => command({ type: 'resolveDecision', decision: d.id, option: o.id })} className="w-full rounded-lg border border-ink-500 bg-ink-800 px-3 py-2 text-left transition hover:border-brass-500/70 hover:bg-ink-700">
              <div className="font-semibold text-slate-100">{o.label}{o.id === d.defaultOption && <span className="ml-2 text-[10px] font-normal text-slate-500">(por defecto si estás ausente)</span>}</div>
              <div className="text-xs text-slate-400">{o.description}</div>
            </button>
          ))}
        </div>
        {decisions.length > 1 && <div className="mt-3 text-right text-[11px] text-slate-500">+{decisions.length - 1} decisión(es) más</div>}
        <div className="mt-2 text-right"><Button small kind="ghost" onClick={() => useGame.getState().openPanel('overview')}>Revisar la situación antes</Button></div>
      </div>
    </div>
  );
}
