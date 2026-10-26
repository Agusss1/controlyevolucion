import { useState } from 'react';
import { formatDate } from '@cyo/shared';
import { TECHS, TECH_AREAS, LAWS, LAW_CATEGORIES, billSupport, isDemocratic, type LawCategory } from '@cyo/simulation';
import { useGame } from '../store/game';
import { command } from '../net/connection';
import { Badge, Bar, Button, Card, Stat } from '../ui/kit';
import { GROUP_NAMES, fmtNum, fmtPct } from '../ui/format';

export function TechnologyPanel() {
  const priv = useGame((s) => s.priv)!;
  const c = priv.country;
  const [area, setArea] = useState<string>('computing');
  const year = 1990 + Math.floor((useGame.getState().view?.day ?? 0) / 360);
  const queue = c.tech.queue;
  const toggle = (id: string) => {
    const next = queue.includes(id) ? queue.filter((q) => q !== id) : [...queue, id].slice(-6);
    void command({ type: 'setResearch', queue: next });
  };
  const techs = TECHS.filter((t) => t.area === area);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Puntos de investigación" value={`${fmtNum(priv.researchPoints, 0)}/año`} />
        <Stat label="Gasto en ciencia" value={`${fmtNum(c.budget.science)} % PIB`} />
        <Stat label="Tecnologías" value={`${c.tech.known.length}/${TECHS.length}`} />
      </div>
      <Card title="Cola de investigación">
        {queue.map((id, i) => { const t = TECHS.find((x) => x.id === id)!; const tv = priv.techs.find((x) => x.id === id)!; return (
          <div key={id} className="mb-1 text-xs"><div className="flex justify-between"><span className="text-slate-200">{i + 1}. {t.name}</span><span className="text-slate-400">{fmtNum(tv.progress, 0)}/{fmtNum(tv.cost, 0)}</span></div><Bar value={tv.progress} max={tv.cost} /></div>
        ); })}
        {!queue.length && <div className="text-xs text-slate-500">Vacía. Elige tecnologías disponibles (las dos primeras reciben los puntos).</div>}
      </Card>
      <div className="flex flex-wrap gap-1">{TECH_AREAS.map((a) => <button key={a.id} onClick={() => setArea(a.id)} className={`rounded px-2 py-0.5 text-[11px] ${area === a.id ? 'bg-brass-500/25 text-brass-300' : 'bg-ink-800 text-slate-400 hover:text-slate-100'}`}>{a.name}</button>)}</div>
      <div className="space-y-1.5">
        {techs.map((t) => {
          const tv = priv.techs.find((x) => x.id === t.id)!;
          const future = t.year > 2026;
          return (
            <div key={t.id} className={`rounded border px-2 py-1.5 text-xs ${tv.known ? 'border-emerald-600/40 bg-emerald-950/20' : tv.available ? 'border-ink-500 bg-ink-800/70' : 'border-ink-700 bg-ink-900/60 opacity-60'}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-100">{t.name}</span>
                <span className="flex items-center gap-1">{future && <Badge tone="warn">incierta</Badge>}{tv.known ? <Badge tone="good">{c.tech.discoveredDay[t.id] !== undefined ? formatDate(c.tech.discoveredDay[t.id], true) : 'conocida'}</Badge> : tv.available ? <Button small kind={queue.includes(t.id) ? 'primary' : 'default'} onClick={() => toggle(t.id)}>{queue.includes(t.id) ? 'En cola' : 'Investigar'}</Button> : <Badge>bloqueada</Badge>}</span>
              </div>
              <div className="text-[10px] text-slate-400">Madurez de referencia: {t.year}{t.year > year + 2 ? ' (adelantarse cuesta más)' : ''} · coste para ti ≈ {fmtNum(tv.cost, 0)} pts {t.prereqs.length ? `· requiere ${t.prereqs.map((p) => TECHS.find((x) => x.id === p)?.name).join(', ')}` : ''}</div>
              {!tv.known && tv.progress > 0 && <Bar value={tv.progress} max={tv.cost} />}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500">El coste baja cuando la tecnología ya se difundió por el mundo y entre tus socios comerciales o científicos. Las tecnologías posteriores a 2026 tienen coste incierto y su descubrimiento final es probabilístico.</p>
    </div>
  );
}

export function LegislationPanel() {
  const priv = useGame((s) => s.priv)!;
  const c = priv.country;
  const [cat, setCat] = useState<LawCategory>('constitution');
  const dem = isDemocratic(c.regime);
  const pending = new Set(c.bills.filter((b) => b.status === 'debate' || b.status === 'implementing').map((b) => b.law));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Capital político" value={fmtNum(c.politics.politicalCapital, 0)} />
        <Stat label="Procedimiento" value={dem ? 'Votación parlamentaria' : 'Decreto'} />
        <Stat label="Decretos este año" value={fmtNum(c.politics.decreesThisYear, 1)} hint="Gobernar por decreto erosiona la legitimidad" />
      </div>
      <div className="flex flex-wrap gap-1">{LAW_CATEGORIES.map((k) => <button key={k.id} onClick={() => setCat(k.id)} className={`rounded px-2 py-0.5 text-[11px] ${cat === k.id ? 'bg-brass-500/25 text-brass-300' : 'bg-ink-800 text-slate-400 hover:text-slate-100'}`}>{k.name}</button>)}</div>
      {LAWS.filter((l) => l.category === cat).map((law) => (
        <Card key={law.id} title={<span>{law.name}{law.constitutional && <span className="ml-2 text-[10px] text-amber-300">constitucional (2/3)</span>}</span>} right={pending.has(law.id) ? <Badge tone="info">en trámite</Badge> : undefined}>
          <div className="space-y-1">
            {law.options.map((o) => {
              const current = c.laws[law.id] === o.id;
              const support = !current && dem ? billSupport(c, law.id, o.id) : null;
              const cost = (o.cost ?? 5) + (law.constitutional ? 25 : 0);
              const groups = Object.entries(o.groups).filter(([, v]) => v);
              return (
                <div key={o.id} className={`rounded px-2 py-1 text-xs ${current ? 'border border-brass-500/50 bg-brass-500/10' : 'bg-ink-800/60'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-100">{o.name}</span>
                    {current ? <Badge tone="warn">vigente</Badge> : (
                      <span className="flex items-center gap-1.5">
                        {support !== null && <span className={support >= (law.constitutional ? 0.667 : 0.5) ? 'text-emerald-300' : 'text-red-300'}>apoyo ≈ {fmtPct(support, 0)}</span>}
                        <Button small disabled={pending.has(law.id) || c.politics.politicalCapital < cost} onClick={() => command({ type: 'proposeLaw', law: law.id, option: o.id })}>{dem ? 'Presentar' : 'Decretar'} ({cost})</Button>
                      </span>
                    )}
                  </div>
                  {o.desc && <div className="text-[10px] text-slate-400">{o.desc}</div>}
                  {groups.length > 0 && <div className="mt-0.5 flex flex-wrap gap-1">{groups.map(([g, v]) => <span key={g} className={`text-[10px] ${v! > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{GROUP_NAMES[g]} {v! > 0 ? '+' : ''}{v}</span>)}</div>}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
      <p className="text-[11px] text-slate-500">En democracia los proyectos se debaten 20 días (45 si son constitucionales) y se votan según la posición de cada partido; en repúblicas presidenciales un rechazo puede decretarse con coste de legitimidad. Tras aprobarse, las leyes tardan en implementarse.</p>
    </div>
  );
}
