import { useState } from 'react';
import { formatDate } from '@cyo/shared';
import { useGame } from '../store/game';
import { command } from '../net/connection';
import { Badge, Button, Card, Flag, Input } from './kit';
import { ChatBox } from './ChatBox';
import { WAR_STATUS, fmtNum } from './format';
import { provinceName } from '../panels/util';

const EMPTY: never[] = [];

/** Sala de conflicto: estado de sincronización, preparación, chat, bajas, campañas y ofertas de paz. */
export function WarRoom({ warId }: { warId: string }) {
  const war = useGame((s) => s.priv?.wars.find((w) => w.id === warId) ?? s.view?.wars.find((w) => w.id === warId));
  const me = useGame((s) => s.you?.countryId);
  const view = useGame((s) => s.view);
  const proposals = useGame((s) => s.priv?.proposals) ?? EMPTY;
  const presence = useGame((s) => s.priv?.presence) ?? EMPTY;
  const [provinces, setProvinces] = useState('');
  const [reparations, setReparations] = useState('0');
  if (!war || !view) return null;
  const country = (id: string) => view.countries.find((c) => c.id === id);
  const mySide = war.participants.find((p) => p.country === me)?.side;
  const enemyLeader = mySide === 'attacker' ? war.defender : war.attacker;
  const call = war.callsToArms.find((c) => c.country === me && c.status === 'pending');
  const battles = view.battles.filter((b) => b.warId === war.id);
  const peace = proposals.filter((p) => (p.type === 'peace' || p.type === 'ceasefire') && p.terms.warId === war.id && p.status === 'pending');
  const occupiedByMe = Object.values(view.controller).map((c, i) => ({ c, i })).filter(({ c, i }) => c === me && view.owner[i] !== me && war.participants.some((p) => p.country === view.owner[i])).map(({ i }) => useGame.getState().map!.provinces[i].id);
  const myScore = mySide === 'attacker' ? war.warscore : -war.warscore;
  const close = () => useGame.getState().openWarRoom(null);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={close}>
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-red-500/40 bg-ink-900 p-5 shadow-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-red-300">Sala de conflicto</div>
            <h3 className="font-display text-2xl text-slate-100">{war.name}</h3>
            <div className="text-xs text-slate-400">Declarada el {formatDate(war.declaredDay)} · {WAR_STATUS[war.status]}{war.frozenReason ? ` · falta: ${war.frozenReason}` : ''}</div>
          </div>
          <Button small kind="ghost" onClick={close}>✕</Button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Card title="Bandos">
            {(['attacker', 'defender'] as const).map((side) => (
              <div key={side} className="mb-2">
                <div className="text-[10px] uppercase text-slate-500">{side === 'attacker' ? 'Atacantes' : 'Defensores'}</div>
                {war.participants.filter((p) => p.side === side).map((p) => {
                  const c = country(p.country);
                  const pres = presence.find((x) => x.country === p.country && x.war === war.id);
                  return <div key={p.country} className="flex items-center gap-1.5 text-sm">{c && <Flag flag={c.flag} size={12} />}<span className="text-slate-200">{c?.name}</span>{c?.human && <Badge tone={pres?.online ?? c.online ? 'good' : 'bad'}>{pres?.online ?? c.online ? 'conectado' : 'desconectado'}</Badge>}</div>;
                })}
              </div>
            ))}
            <div className="mt-2 text-xs text-slate-400">Puntuación de guerra (tu bando): <span className={myScore >= 0 ? 'text-emerald-300' : 'text-red-300'}>{myScore}</span></div>
          </Card>
          <Card title="Sincronización">
            <p className="text-xs leading-relaxed text-slate-400">Las operaciones solo avanzan con todos los gobiernos humanos obligatorios conectados. Si alguien se desconecta y no vuelve en la ventana de gracia, el conflicto se congela conservando posiciones y órdenes; la vida civil sigue.</p>
            {war.status === 'preparing' && mySide && (
              <div className="mt-2">
                <div className="text-xs text-amber-300">Movilización: operaciones desde el {war.preparingUntil !== null ? formatDate(war.preparingUntil) : '—'} o cuando todos estén listos.</div>
                <Button small kind="primary" className="mt-1" disabled={war.ready.includes(me!)} onClick={() => command({ type: 'warReady', war: war.id })}>{war.ready.includes(me!) ? 'Listo' : 'Estoy listo'}</Button>
              </div>
            )}
            {war.status === 'pending' && war.attacker === me && <Button small kind="danger" className="mt-2" onClick={() => command({ type: 'withdrawDeclaration', war: war.id })}>Retirar la declaración</Button>}
            {call && (
              <div className="mt-2 rounded border border-red-500/40 bg-red-950/30 p-2 text-xs">
                <div className="text-red-200">Tus aliados te llaman a las armas ({call.side === 'attacker' ? 'bando atacante' : 'bando defensor'}).{call.treaty ? ' Rechazar incumple la alianza.' : ''}</div>
                <div className="mt-1 flex gap-1"><Button small kind="danger" onClick={() => command({ type: 'callToArmsRespond', war: war.id, accept: true })}>Entrar en guerra</Button><Button small onClick={() => command({ type: 'callToArmsRespond', war: war.id, accept: false })}>Mantenerse al margen</Button></div>
              </div>
            )}
          </Card>
          <Card title="Bajas">
            {Object.entries(war.casualties).map(([cid, v]) => <div key={cid} className="flex justify-between text-xs"><span className="text-slate-300">{country(cid)?.name}</span><span className="font-mono text-red-300">{fmtNum(v * 1000, 0)}</span></div>)}
            {!Object.keys(war.casualties).length && <div className="text-xs text-slate-500">Sin combates todavía.</div>}
          </Card>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Card title="Batallas y campañas">
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {battles.map((b) => <div key={b.id} className="flex justify-between text-xs"><span className="text-slate-300">{provinceName(b.province)} · {country(b.attacker)?.name} → {country(b.defender)?.name}</span><Badge tone={b.status === 'active' ? 'bad' : b.status === 'frozen' ? 'info' : 'default'}>{b.status === 'active' ? 'en curso' : b.status === 'frozen' ? 'congelada' : b.status === 'attacker_won' ? 'victoria atacante' : 'victoria defensora'}</Badge></div>)}
              {!battles.length && <div className="text-xs text-slate-500">Sin batallas.</div>}
            </div>
          </Card>
          <Card title="Negociación">
            {peace.map((p) => (
              <div key={p.id} className="mb-2 rounded border border-ink-600 p-2 text-xs">
                <div className="text-slate-200">{p.type === 'peace' ? 'Oferta de paz' : 'Alto el fuego'} de {country(p.from)?.name}</div>
                <div className="text-slate-400">{p.terms.provinces?.length ? `Cesión de ${p.terms.provinces.length} provincia(s) a ${country(p.terms.provincesTo ?? p.from)?.name}` : 'Sin cambios territoriales'}{p.terms.reparations ? ` · reparaciones ${p.terms.reparations}` : ''}</div>
                {p.to === me && <div className="mt-1 flex gap-1"><Button small kind="primary" onClick={() => command({ type: 'diploRespond', proposal: p.id, response: 'accept' })}>Aceptar</Button><Button small onClick={() => command({ type: 'diploRespond', proposal: p.id, response: 'reject' })}>Rechazar</Button></div>}
              </div>
            ))}
            {mySide && (
              <div className="space-y-1.5 text-xs">
                <div className="flex flex-wrap gap-1">
                  <Button small onClick={() => command({ type: 'diploPropose', to: enemyLeader, proposal: 'ceasefire', terms: { warId: war.id, months: 6 } })}>Proponer alto el fuego</Button>
                  <Button small onClick={() => command({ type: 'diploPropose', to: enemyLeader, proposal: 'peace', terms: { warId: war.id, provinces: [], truceYears: 5 } })}>Paz blanca</Button>
                </div>
                <div className="text-slate-400">Exigir provincias ocupadas ({occupiedByMe.length} bajo tu control):</div>
                <Input value={provinces} onChange={setProvinces} placeholder="IDs separados por comas (vacío = todas las ocupadas)" className="text-xs" />
                <div className="flex items-center gap-2"><span className="text-slate-400">Reparaciones (mil M UMI)</span><Input value={reparations} onChange={setReparations} className="w-24 text-xs" /></div>
                <Button small kind="primary" onClick={() => command({ type: 'diploPropose', to: enemyLeader, proposal: 'peace', terms: { warId: war.id, provinces: provinces.trim() ? provinces.split(',').map((s) => s.trim()).filter(Boolean) : occupiedByMe, provincesTo: me!, reparations: Math.max(0, Number(reparations) || 0), truceYears: 10 } })}>Enviar condiciones de paz</Button>
              </div>
            )}
          </Card>
        </div>
        {mySide && <Card title="Chat del conflicto" className="mt-3 flex h-56 flex-col"><ChatBox channel={`war:${war.id}`} placeholder="Mensaje a todos los bandos…" /></Card>}
      </div>
    </div>
  );
}
