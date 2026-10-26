import { useState } from 'react';
import { formatDate, type TreatyType, type TreatyTerms } from '@cyo/shared';
import { useGame } from '../store/game';
import { command } from '../net/connection';
import { Badge, Button, Card, Flag, Input, Select, Stat, Tabs } from '../ui/kit';
import { ChatBox } from '../ui/ChatBox';
import { TREATY_NAMES, fmtNum } from '../ui/format';
import { countryName } from './util';

const PROPOSABLE: TreatyType[] = ['trade_agreement', 'customs_union', 'non_aggression', 'defensive_alliance', 'military_alliance', 'military_access', 'energy_agreement', 'science_cooperation', 'migration_cooperation', 'economic_aid', 'loan', 'debt_relief', 'recognition', 'territorial_cession', 'unification', 'mediation', 'join_organization'];

export function DiplomacyPanel() {
  const priv = useGame((s) => s.priv)!;
  const view = useGame((s) => s.view)!;
  const target = useGame((s) => s.diploTarget);
  const setTarget = (id: string | null) => useGame.setState({ diploTarget: id });
  const c = priv.country;
  const [tab, setTab] = useState<'relations' | 'inbox' | 'treaties' | 'orgs'>(target ? 'relations' : 'inbox');
  const [type, setType] = useState<TreatyType>('trade_agreement');
  const [amount, setAmount] = useState('5');
  const [years, setYears] = useState('10');
  const [rate, setRate] = useState('5');
  const [provinces, setProvinces] = useState('');
  const [msg, setMsg] = useState('');
  const [org, setOrg] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgKind, setOrgKind] = useState<'economic' | 'military' | 'political' | 'scientific'>('economic');
  const others = view.countries.filter((x) => x.alive && x.id !== c.id).sort((a, b) => (view.relations[b.id]?.opinion ?? 0) - (view.relations[a.id]?.opinion ?? 0));
  const t = target ? view.countries.find((x) => x.id === target) : null;
  const rel = target ? view.relations[target] : null;
  const incoming = priv.proposals.filter((p) => p.to === c.id && p.status === 'pending');
  const outgoing = priv.proposals.filter((p) => p.from === c.id);
  const myTreaties = view.treaties.filter((x) => x.parties.includes(c.id));
  const myOrgs = view.organizations.filter((o) => o.members.includes(c.id));

  const terms = (): TreatyTerms => {
    const tr: TreatyTerms = {};
    if (type === 'economic_aid' || type === 'loan') tr.amount = Math.max(0, Number(amount) || 0);
    if (type === 'loan') { tr.years = Math.max(1, Math.min(50, Number(years) || 10)); tr.rate = Math.max(0, Math.min(0.5, (Number(rate) || 0) / 100)); }
    if (type === 'non_aggression') tr.years = Math.max(1, Math.min(50, Number(years) || 10));
    if (type === 'territorial_cession') { tr.provinces = provinces.split(',').map((s) => s.trim()).filter(Boolean); tr.provincesTo = target!; }
    if (type === 'debt_relief') tr.share = 0.3;
    if (type === 'join_organization') tr.organization = org;
    if (type === 'recognition') tr.recognize = c.id;
    return tr;
  };

  return (
    <div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'relations', label: 'Relaciones' }, { id: 'inbox', label: `Propuestas${incoming.length ? ` (${incoming.length})` : ''}` }, { id: 'treaties', label: 'Tratados' }, { id: 'orgs', label: 'Organizaciones' }]} />
      {tab === 'relations' && (
        <div className="space-y-3">
          <Select value={target ?? ''} onChange={(v) => setTarget(v || null)} className="w-full" options={[{ value: '', label: '— Elegir país —' }, ...others.map((o) => ({ value: o.id, label: `${o.name} (${view.relations[o.id]?.opinion ?? 0})${o.human ? ' · jugador' : ''}` }))]} />
          {t && rel ? (
            <>
              <div className="flex items-center gap-2"><Flag flag={t.flag} size={22} /><div className="font-display text-lg text-slate-100">{t.longName}</div></div>
              <div className="grid grid-cols-4 gap-1.5">
                <Stat label="Opinión" value={String(rel.opinion)} tone={rel.opinion > 30 ? 'good' : rel.opinion < -30 ? 'bad' : null} />
                <Stat label="Confianza" value={String(rel.trust)} />
                <Stat label="Embajadas" value={rel.embassies ? 'Sí' : 'No'} />
                <Stat label="Reconocimiento" value={rel.recognized ? 'Mutuo' : 'No'} />
              </div>
              <div className="flex flex-wrap gap-1">{myTreaties.filter((x) => x.parties.includes(t.id)).map((x) => <Badge key={x.id} tone="info">{TREATY_NAMES[x.type]}</Badge>)}{rel.sanctions && <Badge tone="bad">Sanciones</Badge>}</div>
              <Card title="Proponer acuerdo">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="col-span-2 text-slate-400">Tipo<Select value={type} onChange={setType} className="w-full" options={PROPOSABLE.map((p) => ({ value: p, label: TREATY_NAMES[p] }))} /></label>
                  {(type === 'economic_aid' || type === 'loan') && <label className="text-slate-400">Monto (mil M UMI)<Input value={amount} onChange={setAmount} /></label>}
                  {(type === 'loan' || type === 'non_aggression') && <label className="text-slate-400">Años<Input value={years} onChange={setYears} /></label>}
                  {type === 'loan' && <label className="text-slate-400">Tasa anual %<Input value={rate} onChange={setRate} /></label>}
                  {type === 'territorial_cession' && <label className="col-span-2 text-slate-400">Provincias que {t.name} te cedería (IDs separados por comas)<Input value={provinces} onChange={setProvinces} placeholder="P012, P013" /></label>}
                  {type === 'join_organization' && <label className="col-span-2 text-slate-400">Organización<Select value={org} onChange={setOrg} className="w-full" options={[{ value: '', label: '—' }, ...myOrgs.map((o) => ({ value: o.id, label: o.name }))]} /></label>}
                  <label className="col-span-2 text-slate-400">Mensaje<Input value={msg} onChange={setMsg} maxLength={300} /></label>
                </div>
                <div className="mt-2 flex justify-end"><Button kind="primary" onClick={() => command({ type: 'diploPropose', to: t.id, proposal: type, terms: terms(), message: msg })}>Enviar propuesta</Button></div>
                <div className="mt-1 text-[10px] text-slate-500">La propuesta queda pendiente hasta que {t.name} responda (aunque su gobierno esté desconectado). Vence en 45 días.</div>
              </Card>
              <Card title="Acciones unilaterales">
                <div className="flex flex-wrap gap-1.5">
                  <Button small onClick={() => command({ type: 'diploAction', to: t.id, action: 'improve_relations' })}>Campaña diplomática</Button>
                  {rel.sanctions ? <Button small onClick={() => command({ type: 'diploAction', to: t.id, action: 'lift_sanctions' })}>Levantar sanciones</Button> : <Button small kind="danger" onClick={() => command({ type: 'diploAction', to: t.id, action: 'sanction' })}>Imponer sanciones</Button>}
                  {rel.embassies ? <Button small onClick={() => command({ type: 'diploAction', to: t.id, action: 'recall_ambassador' })}>Retirar embajador</Button> : <Button small onClick={() => command({ type: 'diploAction', to: t.id, action: 'restore_embassy' })}>Restablecer embajada</Button>}
                  {rel.recognized ? <Button small onClick={() => command({ type: 'diploAction', to: t.id, action: 'withdraw_recognition' })}>Retirar reconocimiento</Button> : <Button small onClick={() => command({ type: 'diploAction', to: t.id, action: 'recognize' })}>Reconocer</Button>}
                  <Button small onClick={() => command({ type: 'diploAction', to: t.id, action: 'denounce' })}>Denuncia pública</Button>
                </div>
              </Card>
              {t.human && <Card title={`Mensajería privada con ${t.name}`} className="flex h-56 flex-col"><ChatBox channel={`dm:${[c.id, t.id].sort().join('|')}`} placeholder="Mensaje diplomático privado…" /></Card>}
            </>
          ) : (
            <div className="space-y-0.5">
              {others.map((o) => (
                <button key={o.id} onClick={() => setTarget(o.id)} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-ink-700">
                  <Flag flag={o.flag} size={11} /><span className="flex-1 text-slate-200">{o.name}{o.human ? ' 👤' : ''}</span>
                  <span className="w-10 text-right font-mono" style={{ color: (view.relations[o.id]?.opinion ?? 0) > 30 ? '#3fb950' : (view.relations[o.id]?.opinion ?? 0) < -30 ? '#e5534b' : '#94a3b8' }}>{view.relations[o.id]?.opinion ?? 0}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {tab === 'inbox' && (
        <div className="space-y-3">
          <Card title="Recibidas">
            {incoming.map((p) => (
              <div key={p.id} className="mb-2 rounded border border-ink-600 bg-ink-800/60 p-2 text-xs">
                <div className="flex justify-between"><span className="text-slate-100">{TREATY_NAMES[p.type]} · de {countryName(p.from)}</span><span className="text-slate-500">vence {formatDate(p.expiresDay)}</span></div>
                {p.message && <div className="italic text-slate-400">«{p.message}»</div>}
                <div className="text-slate-400">{describeTerms(p.terms)}</div>
                <div className="mt-1 flex gap-1">
                  <Button small kind="primary" onClick={() => command({ type: 'diploRespond', proposal: p.id, response: 'accept' })}>Aceptar</Button>
                  <Button small onClick={() => command({ type: 'diploRespond', proposal: p.id, response: 'reject' })}>Rechazar</Button>
                  {(p.terms.amount !== undefined || p.terms.years !== undefined) && <Button small onClick={() => command({ type: 'diploRespond', proposal: p.id, response: 'reject', counter: { ...(p.terms.amount !== undefined ? { amount: (p.terms.amount ?? 0) * 1.5 } : {}), ...(p.terms.years !== undefined ? { years: Math.max(1, Math.round((p.terms.years ?? 10) / 2)) } : {}) } })}>Contraproponer</Button>}
                </div>
              </div>
            ))}
            {!incoming.length && <div className="text-xs text-slate-500">No hay propuestas pendientes.</div>}
          </Card>
          <Card title="Enviadas">
            {outgoing.slice().reverse().slice(0, 30).map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-ink-700 py-0.5 text-xs">
                <span className="text-slate-300">{TREATY_NAMES[p.type]} → {countryName(p.to)}</span>
                <span className="flex items-center gap-1"><Badge tone={p.status === 'accepted' ? 'good' : p.status === 'pending' ? 'info' : 'bad'}>{{ pending: 'pendiente', accepted: 'aceptada', rejected: 'rechazada', countered: 'contrapropuesta', expired: 'vencida', withdrawn: 'retirada' }[p.status]}</Badge>{p.status === 'pending' && <Button small kind="ghost" onClick={() => command({ type: 'diploWithdraw', proposal: p.id })}>Retirar</Button>}</span>
              </div>
            ))}
          </Card>
        </div>
      )}
      {tab === 'treaties' && (
        <Card title="Tratados vigentes">
          {myTreaties.map((x) => (
            <div key={x.id} className="flex items-center justify-between border-b border-ink-700 py-1 text-xs">
              <div><div className="text-slate-200">{x.name}</div><div className="text-[10px] text-slate-500">{TREATY_NAMES[x.type]} · desde {x.signedDay < 0 ? 'antes de 1990' : formatDate(x.signedDay)}{x.expiresDay !== null ? ` · vence ${formatDate(x.expiresDay)}` : ''}</div></div>
              <Button small kind="danger" onClick={() => { if (confirm('Denunciar el tratado tiene costes diplomáticos. ¿Continuar?')) void command({ type: 'cancelTreaty', treaty: x.id }); }}>Denunciar</Button>
            </div>
          ))}
          {!myTreaties.length && <div className="text-xs text-slate-500">Sin tratados.</div>}
        </Card>
      )}
      {tab === 'orgs' && (
        <div className="space-y-3">
          <Card title="Membresías">
            {myOrgs.map((o) => <div key={o.id} className="flex items-center justify-between text-xs"><span className="text-slate-200">{o.name} <span className="text-slate-500">({o.members.length} miembros{o.mutualDefense ? ', defensa mutua' : ''}{o.tariffCut ? `, aranceles −${Math.round(o.tariffCut * 100)} %` : ''})</span></span><Button small kind="ghost" onClick={() => command({ type: 'leaveOrganization', organization: o.id })}>Abandonar</Button></div>)}
            {!myOrgs.length && <div className="text-xs text-slate-500">No pertenece a ninguna organización.</div>}
          </Card>
          <Card title="Fundar una organización">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Input value={orgName} onChange={setOrgName} placeholder="Nombre" maxLength={60} />
              <Select value={orgKind} onChange={setOrgKind} options={[{ value: 'economic', label: 'Bloque económico' }, { value: 'military', label: 'Alianza militar' }, { value: 'political', label: 'Foro político' }, { value: 'scientific', label: 'Cooperación científica' }]} />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-slate-500"><span>Luego invita a otros países con la propuesta «Adhesión a organización». Cuesta 15 de capital político.</span><Button small kind="primary" disabled={orgName.length < 3} onClick={() => command({ type: 'createOrganization', name: orgName, kind: orgKind })}>Fundar</Button></div>
          </Card>
          <Card title="Todas las organizaciones">{view.organizations.map((o) => <div key={o.id} className="text-xs text-slate-300">· {o.name} — {o.members.map(countryName).join(', ')}</div>)}</Card>
        </div>
      )}
      <div className="mt-3 text-[10px] text-slate-500">Capital político disponible: {fmtNum(c.politics.politicalCapital, 0)}</div>
    </div>
  );
}

function describeTerms(t: TreatyTerms): string {
  const parts: string[] = [];
  if (t.amount) parts.push(`monto ${t.amount}`);
  if (t.years) parts.push(`${t.years} años`);
  if (t.rate !== undefined) parts.push(`tasa ${(t.rate * 100).toFixed(1)} %`);
  if (t.provinces?.length) parts.push(`${t.provinces.length} provincia(s) a ${countryName(t.provincesTo ?? '')}`);
  if (t.reparations) parts.push(`reparaciones ${t.reparations}`);
  if (t.truceYears) parts.push(`tregua ${t.truceYears} años`);
  return parts.join(' · ');
}
