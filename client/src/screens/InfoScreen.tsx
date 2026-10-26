import { useGame } from '../store/game';
import { Card } from '../ui/kit';
import { ScreenFrame } from './ScreenFrame';

const SECTIONS: { title: string; body: string[] }[] = [
  { title: 'El mundo', body: [
    'Vereth es un planeta ficticio con seis grandes regiones: Aurelia, Kharzun, Solvara, Meridia, Ostria y el archipiélago de Velmar. Sus 47 Estados tienen historia, regímenes, economías y conflictos propios.',
    'También puedes jugar en un mundo aleatorio generado por semilla: la misma semilla produce siempre el mismo mundo.',
    'La partida comienza el 1 de enero de 1990. Nada está escrito: no hay eventos históricos obligatorios.'
  ] },
  { title: 'El tiempo', body: [
    'No hay turnos. El servidor avanza un día cada 20 segundos reales: una hora equivale a seis meses y dos horas a un año.',
    'Tus decisiones se aplican al instante y sus efectos se despliegan con el tiempo: algunas medidas tardan meses o años.',
    'Si te desconectas, tu país sigue funcionando con las políticas vigentes y las directivas de ausencia que configures.'
  ] },
  { title: 'Gobernar', body: [
    'Economía por sectores con producción, empleo, inflación, tipo de cambio, deuda, comercio y materias primas reales del mapa.',
    'Impuestos con bases imponibles, evasión e informalidad: subir tasas no siempre recauda más.',
    'Leyes por categorías que fijan instituciones concretas; en democracia el parlamento vota, en autocracia se decreta con costes de legitimidad.',
    'Grupos sociales con intereses distintos, partidos, elecciones, protestas, golpes, revoluciones y separatismos.'
  ] },
  { title: 'Diplomacia y guerra', body: [
    'Las propuestas diplomáticas son asíncronas: el destinatario responde cuando vuelve. Los tratados generan obligaciones reales.',
    'Las guerras se libran con unidades sobre el mapa: movimiento por provincias conectadas, abastecimiento, terreno, ríos, aviación, flotas y frentes.',
    'Una guerra entre jugadores humanos no avanza hasta que todos los implicados están conectados. Si alguien se desconecta, las operaciones se congelan sin perder posiciones.',
    'Ocupar no es anexar: la soberanía solo cambia con un tratado de paz o por el colapso del Estado.'
  ] },
  { title: 'Controles', body: [
    'Arrastrar para mover el mapa, rueda para el zoom, clic para seleccionar provincias o unidades (Mayús suma unidades).',
    'Con unidades seleccionadas, clic derecho en una provincia para moverlas o atacar.',
    'El menú lateral abre los paneles de gobierno; las capas del mapa muestran economía, población, recursos, alianzas, frentes y más.'
  ] }
];

export function InfoScreen() {
  const setScreen = useGame((s) => s.setScreen);
  return (
    <ScreenFrame title="Información del juego" onBack={() => setScreen('menu')}>
      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((s) => <Card key={s.title} title={s.title}>{s.body.map((b, i) => <p key={i} className="mb-2 text-sm leading-relaxed text-slate-300">{b}</p>)}</Card>)}
      </div>
    </ScreenFrame>
  );
}
