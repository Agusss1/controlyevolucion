import { useState } from 'react';
import { loadPrefs, savePrefs } from '../net/api';
import { Button } from './kit';

const STEPS = [
  { title: 'Bienvenido a CYO', text: 'Gobiernas un Estado de Vereth desde el 1 de enero de 1990. El tiempo corre en el servidor: 20 segundos reales son un día. No hay turnos ni historia escrita.' },
  { title: 'El mapa', text: 'Arrastra para moverte, usa la rueda para acercarte. Al acercarte aparecen ciudades, provincias y rasgos geográficos. Abajo puedes cambiar de capa: economía, población, recursos, alianzas, frentes…' },
  { title: 'El menú de gobierno', text: 'A la izquierda están los paneles del Estado: presupuesto, impuestos, leyes, diplomacia, defensa, tecnología. Cada control está conectado al motor de simulación: los cambios tienen efectos reales, a veces lentos.' },
  { title: 'Consecuencias', text: 'Subir impuestos no siempre recauda más; emitir dinero financia hoy y cuesta inflación mañana; una ley puede satisfacer a unos grupos y enfurecer a otros. Mira los indicadores y las proyecciones con incertidumbre.' },
  { title: 'Otros jugadores', text: 'La diplomacia es asíncrona: las propuestas esperan a que el otro gobierno responda. Una guerra entre jugadores solo avanza cuando todos están conectados; si alguien se desconecta, se congela sin perder posiciones.' },
  { title: 'Unidades', text: 'Selecciona tus unidades con clic (Mayús para sumar) y usa clic derecho en el mapa para moverlas o atacar. Abastecimiento, terreno, ríos, aviación y moral deciden las batallas, no solo los números.' }
];

export function Tutorial() {
  const [prefs, setPrefs] = useState(loadPrefs());
  const [step, setStep] = useState(0);
  if (!prefs.showTutorial) return null;
  const close = () => { const p = { ...prefs, showTutorial: false }; savePrefs(p); setPrefs(p); };
  const s = STEPS[step];
  return (
    <div className="fixed bottom-12 left-16 z-30 w-96 rounded-lg border border-brass-500/50 bg-ink-900/95 p-4 shadow-panel">
      <div className="text-[10px] uppercase tracking-[0.3em] text-brass-400">Tutorial {step + 1}/{STEPS.length}</div>
      <div className="font-display text-lg text-slate-100">{s.title}</div>
      <p className="mt-1 text-sm leading-relaxed text-slate-300">{s.text}</p>
      <div className="mt-3 flex justify-between">
        <Button small kind="ghost" onClick={close}>No volver a mostrar</Button>
        <div className="flex gap-1">
          {step > 0 && <Button small onClick={() => setStep(step - 1)}>Anterior</Button>}
          {step < STEPS.length - 1 ? <Button small kind="primary" onClick={() => setStep(step + 1)}>Siguiente</Button> : <Button small kind="primary" onClick={close}>¡A gobernar!</Button>}
        </div>
      </div>
    </div>
  );
}
