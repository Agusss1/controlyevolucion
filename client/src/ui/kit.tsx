import type { ReactNode } from 'react';
import type { FlagSpec } from '@cyo/shared';

export function cls(...xs: (string | false | null | undefined)[]): string { return xs.filter(Boolean).join(' '); }

export function Button({ children, onClick, kind = 'default', disabled, title, small, className }: { children: ReactNode; onClick?: () => void; kind?: 'default' | 'primary' | 'danger' | 'ghost'; disabled?: boolean; title?: string; small?: boolean; className?: string }) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition disabled:cursor-not-allowed disabled:opacity-40';
  const size = small ? 'px-2 py-0.5 text-xs' : 'px-3 py-1.5 text-sm';
  const k = kind === 'primary' ? 'border-brass-500 bg-brass-500/90 text-ink-950 hover:bg-brass-400' : kind === 'danger' ? 'border-signal-red/70 bg-signal-red/15 text-red-200 hover:bg-signal-red/30' : kind === 'ghost' ? 'border-transparent bg-transparent text-slate-300 hover:bg-white/5' : 'border-ink-500 bg-ink-700/70 text-slate-200 hover:border-brass-500/60 hover:bg-ink-600';
  return <button type="button" title={title} disabled={disabled} onClick={onClick} className={cls(base, size, k, className)}>{children}</button>;
}

export function Card({ title, children, right, className }: { title?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={cls('rounded-lg border border-ink-600/80 bg-ink-850/80 p-3', className)}>
      {(title || right) && <header className="mb-2 flex items-center justify-between gap-2"><h3 className="text-xs font-semibold uppercase tracking-wider text-brass-300">{title}</h3>{right}</header>}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'good' | 'bad' | 'warn' | null }) {
  const t = tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-red-300' : tone === 'warn' ? 'text-amber-300' : 'text-slate-100';
  return (
    <div className="rounded-md bg-ink-800/80 px-2.5 py-1.5" title={hint}>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={cls('font-mono text-sm', t)}>{value}</div>
    </div>
  );
}

export function Bar({ value, max = 1, color = '#c9a227', label }: { value: number; max?: number; color?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="w-full" title={label}>
      <div className="h-1.5 w-full overflow-hidden rounded bg-ink-700"><div className="h-full rounded" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}

export function Slider({ value, min, max, step, onChange, format }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <div className="flex items-center gap-2">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1 flex-1 cursor-pointer accent-brass-500" />
      <span className="w-16 text-right font-mono text-xs text-slate-300">{format ? format(value) : value}</span>
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className={cls('rounded border border-ink-500 bg-ink-800 px-2 py-1 text-sm text-slate-200 focus:border-brass-500 focus:outline-none', className)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string }[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-1 border-b border-ink-600">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} className={cls('-mb-px border-b-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition', value === t.id ? 'border-brass-500 text-brass-300' : 'border-transparent text-slate-400 hover:text-slate-200')}>{t.label}</button>
      ))}
    </div>
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'good' | 'bad' | 'warn' | 'info' }) {
  const t = tone === 'good' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : tone === 'bad' ? 'bg-red-500/15 text-red-300 border-red-500/40' : tone === 'warn' ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : tone === 'info' ? 'bg-sky-500/15 text-sky-300 border-sky-500/40' : 'bg-ink-700 text-slate-300 border-ink-500';
  return <span className={cls('inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', t)}>{children}</span>;
}

export function Input({ value, onChange, placeholder, className, maxLength, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; maxLength?: number; type?: string }) {
  return <input type={type} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cls('w-full rounded border border-ink-500 bg-ink-800 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brass-500 focus:outline-none', className)} />;
}

/** Bandera generada a partir de su especificación. */
export function Flag({ flag, size = 24, className }: { flag: FlagSpec; size?: number; className?: string }) {
  const w = 30, h = 20;
  const [a, b, c] = [flag.colors[0] ?? '#888', flag.colors[1] ?? '#ddd', flag.colors[2] ?? flag.colors[0] ?? '#444'];
  let body: ReactNode;
  switch (flag.pattern) {
    case 'tricolor_h': body = <><rect width={w} height={h / 3} fill={a} /><rect y={h / 3} width={w} height={h / 3} fill={b} /><rect y={(2 * h) / 3} width={w} height={h / 3} fill={c} /></>; break;
    case 'tricolor_v': body = <><rect width={w / 3} height={h} fill={a} /><rect x={w / 3} width={w / 3} height={h} fill={b} /><rect x={(2 * w) / 3} width={w / 3} height={h} fill={c} /></>; break;
    case 'bicolor_h': body = <><rect width={w} height={h / 2} fill={a} /><rect y={h / 2} width={w} height={h / 2} fill={b} /></>; break;
    case 'bicolor_v': body = <><rect width={w / 2} height={h} fill={a} /><rect x={w / 2} width={w / 2} height={h} fill={b} /></>; break;
    case 'cross': body = <><rect width={w} height={h} fill={a} /><rect x={w / 2 - 2} width={4} height={h} fill={b} /><rect y={h / 2 - 2} width={w} height={4} fill={b} /></>; break;
    case 'nordic': body = <><rect width={w} height={h} fill={a} /><rect x={9} width={4} height={h} fill={b} /><rect y={h / 2 - 2} width={w} height={4} fill={b} /><rect x={10} width={2} height={h} fill={c} /><rect y={h / 2 - 1} width={w} height={2} fill={c} /></>; break;
    case 'canton': body = <><rect width={w} height={h} fill={a} /><rect width={w / 2.2} height={h / 2} fill={b} /></>; break;
    case 'diagonal': body = <><rect width={w} height={h} fill={a} /><polygon points={`0,${h} ${w},0 ${w},${h}`} fill={c} /><polygon points={`0,${h} ${w},0 ${w},3 3,${h}`} fill={b} /></>; break;
    case 'disc': body = <><rect width={w} height={h} fill={a} /><circle cx={w / 2} cy={h / 2} r={5.5} fill={b} /></>; break;
    case 'chevron': body = <><rect width={w} height={h / 2} fill={b} /><rect y={h / 2} width={w} height={h / 2} fill={c} /><polygon points={`0,0 ${w / 2.5},${h / 2} 0,${h}`} fill={a} /></>; break;
    case 'bordered': body = <><rect width={w} height={h} fill={b} /><rect x={2.5} y={2.5} width={w - 5} height={h - 5} fill={a} /></>; break;
    case 'quartered': body = <><rect width={w / 2} height={h / 2} fill={a} /><rect x={w / 2} width={w / 2} height={h / 2} fill={b} /><rect y={h / 2} width={w / 2} height={h / 2} fill={b} /><rect x={w / 2} y={h / 2} width={w / 2} height={h / 2} fill={a} /></>; break;
  }
  const ex = flag.pattern === 'canton' ? w / 4.4 : flag.pattern === 'chevron' ? w / 6 : w / 2;
  const ey = flag.pattern === 'canton' ? h / 4 : h / 2;
  const em = flag.emblemColor;
  let emblem: ReactNode = null;
  switch (flag.emblem) {
    case 'star': emblem = <polygon points={starPoints(ex, ey, 3.2, 1.3)} fill={em} />; break;
    case 'stars3': emblem = <>{[-1, 0, 1].map((k) => <polygon key={k} points={starPoints(ex + k * 4, ey, 1.8, 0.75)} fill={em} />)}</>; break;
    case 'sun': emblem = <><circle cx={ex} cy={ey} r={2.4} fill={em} />{Array.from({ length: 8 }, (_, k) => <line key={k} x1={ex} y1={ey} x2={ex + 4 * Math.cos(k * Math.PI / 4)} y2={ey + 4 * Math.sin(k * Math.PI / 4)} stroke={em} strokeWidth={0.8} />)}</>; break;
    case 'moon': emblem = <path d={`M ${ex + 1.5} ${ey - 3.5} A 3.5 3.5 0 1 0 ${ex + 1.5} ${ey + 3.5} A 2.6 2.6 0 1 1 ${ex + 1.5} ${ey - 3.5} Z`} fill={em} />; break;
    case 'circle': emblem = <circle cx={ex} cy={ey} r={2.6} fill="none" stroke={em} strokeWidth={1} />; break;
    case 'diamond': emblem = <polygon points={`${ex},${ey - 3.5} ${ex + 3},${ey} ${ex},${ey + 3.5} ${ex - 3},${ey}`} fill={em} />; break;
    case 'wheel': emblem = <><circle cx={ex} cy={ey} r={3} fill="none" stroke={em} strokeWidth={0.8} />{Array.from({ length: 6 }, (_, k) => <line key={k} x1={ex} y1={ey} x2={ex + 3 * Math.cos(k * Math.PI / 3)} y2={ey + 3 * Math.sin(k * Math.PI / 3)} stroke={em} strokeWidth={0.6} />)}</>; break;
    case 'tower': emblem = <path d={`M ${ex - 2.5} ${ey + 3} v -5 h 1 v 1 h 1 v -1 h 1 v 1 h 1 v -1 h 1 v 5 z`} fill={em} />; break;
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={size * 1.5} height={size} className={cls('inline-block shrink-0 rounded-[2px] ring-1 ring-black/40', className)}>
      {body}{emblem}
    </svg>
  );
}

function starPoints(cx: number, cy: number, r: number, ri: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? ri : r; pts.push(`${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`); }
  return pts.join(' ');
}

/** Gráfico de líneas SVG con banda opcional de incertidumbre. */
export function LineChart({ series, height = 120, band, format = (v) => v.toFixed(1), labels }: { series: { name: string; color: string; values: number[] }[]; height?: number; band?: { low: number[]; high: number[]; color: string }; format?: (v: number) => string; labels?: string[] }) {
  const all = [...series.flatMap((s) => s.values), ...(band ? [...band.low, ...band.high] : [])].filter(Number.isFinite);
  if (!all.length) return <div className="text-xs text-slate-500">Sin datos todavía.</div>;
  let min = Math.min(...all), max = Math.max(...all);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.08;
  min -= pad; max += pad;
  const W = 320, H = height;
  const n = Math.max(...series.map((s) => s.values.length), band?.low.length ?? 0, 2);
  const x = (i: number) => (i / (n - 1)) * (W - 36) + 34;
  const y = (v: number) => H - 14 - ((v - min) / (max - min)) * (H - 22);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[0, 0.5, 1].map((t) => { const v = min + (max - min) * t; return <g key={t}><line x1={34} x2={W} y1={y(v)} y2={y(v)} stroke="#24354f" strokeDasharray="2 3" /><text x={30} y={y(v) + 3} textAnchor="end" fontSize="8" fill="#7d8ea8">{format(v)}</text></g>; })}
      {band && <path d={`${path(band.high)} ${band.low.map((v, i) => `L${x(band.low.length - 1 - i).toFixed(1)},${y(band.low[band.low.length - 1 - i]).toFixed(1)}`).join(' ')} Z`} fill={band.color} opacity={0.18} />}
      {series.map((s) => <path key={s.name} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={1.6} />)}
      {labels && labels.length > 1 && <><text x={34} y={H - 2} fontSize="8" fill="#7d8ea8">{labels[0]}</text><text x={W} y={H - 2} fontSize="8" textAnchor="end" fill="#7d8ea8">{labels[labels.length - 1]}</text></>}
    </svg>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return <div className="flex flex-wrap gap-3 text-[11px] text-slate-400">{items.map((i) => <span key={i.label} className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: i.color }} />{i.label}</span>)}</div>;
}
