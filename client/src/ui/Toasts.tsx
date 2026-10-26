import { useGame } from '../store/game';
import { cls } from './kit';

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} onClick={() => dismiss(t.id)} className={cls('toast-enter pointer-events-auto cursor-pointer rounded-md border px-3 py-2 text-sm shadow-panel',
          t.kind === 'error' ? 'border-red-500/50 bg-red-950/90 text-red-100' : t.kind === 'success' ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-100' : 'border-ink-500 bg-ink-800/95 text-slate-100')}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
