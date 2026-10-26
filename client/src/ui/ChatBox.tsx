import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../store/game';
import { emit } from '../net/connection';
import { Input } from './kit';

export function ChatBox({ channel, placeholder = 'Escribe un mensaje…' }: { channel: string; placeholder?: string }) {
  const allChat = useGame((s) => s.chat);
  const chat = useMemo(() => allChat.filter((m) => m.channel === channel), [allChat, channel]);
  const countries = useGame((s) => s.view?.countries);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [chat.length]);
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    await emit('chat:send', { channel, text: t });
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 min-h-[120px] flex-1 space-y-1 overflow-y-auto pr-1 text-sm">
        {chat.map((m) => {
          const c = countries?.find((x) => x.id === m.countryId);
          return (
            <div key={m.id} className="leading-snug">
              <span className="text-[10px] text-slate-500">{new Date(m.at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })} </span>
              <span className="font-semibold" style={{ color: c?.color ?? '#e2c27a' }}>{m.playerName}{c ? ` (${c.name})` : ''}:</span> <span className="text-slate-200">{m.text}</span>
            </div>
          );
        })}
        {!chat.length && <div className="text-xs text-slate-500">Sin mensajes.</div>}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(); }}><Input value={text} onChange={setText} placeholder={placeholder} maxLength={600} /></form>
    </div>
  );
}
