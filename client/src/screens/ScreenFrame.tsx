import type { ReactNode } from 'react';
import { Button } from '../ui/kit';

export function ScreenFrame({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="menu-bg h-full w-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-baseline gap-4">
            <span className="font-display text-3xl font-black tracking-[0.15em] text-brass-300">CYO</span>
            <h2 className="font-display text-xl text-slate-200">{title}</h2>
          </div>
          <Button kind="ghost" onClick={onBack}>← Volver</Button>
        </div>
        {children}
      </div>
    </div>
  );
}
