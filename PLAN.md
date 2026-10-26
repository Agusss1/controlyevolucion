# CYO — Plan, arquitectura y hoja de ruta

CYO es un simulador geopolítico multijugador persistente. Se juega en un mundo ficticio, Vereth, a partir del 1 de enero de 1990. Este documento recoge cómo está construido, qué está implementado y verificado, y qué falta.

## 1. Principios

1. **Servidor autoritativo.** El cliente solo envía comandos validados (esquema zod). El servidor los aplica en el motor y responde con vistas filtradas por la niebla de guerra. Ningún resultado se calcula en el cliente.
2. **Motor determinista y puro.** `simulation/` no hace E/S. El estado es un objeto serializable que incluye el estado del generador aleatorio. `runDay(state)` avanza un día. Los comandos se aplican entre días con su número de secuencia.
3. **Persistencia por instantánea + diario de comandos.** Cada N días se guarda una instantánea comprimida del estado, y cada comando se guarda en orden. Al reiniciar, el servidor carga la última instantánea, reproduce los comandos y simula los días faltantes hasta el día guardado. El resultado es idéntico al previo, y las pruebas lo verifican con un hash del estado.
4. **Mundo ficticio.** Ningún país, cultura, religión, moneda u organización real. 1990 marca el nivel tecnológico y no implica eventos históricos obligatorios.
5. **Sin resultados fijados.** Las fórmulas (ver [docs/FORMULAS.md](docs/FORMULAS.md)) producen los resultados. Las crisis surgen del estado, no de un guion.

## 2. Arquitectura

```
cliente (React)  ──REST──▶  Fastify  ──▶ GameManager ──▶ GameInstance ──▶ motor (simulation/)
      ▲                      │                              │
      └──Socket.IO (estado, eventos, chat)◀──────────────────┘
                                                            └──▶ Store (PostgreSQL | SQLite)
```

| Capa | Tecnología | Notas |
|---|---|---|
| Cliente | React 18, TypeScript, Vite, Tailwind, Zustand, TanStack Query | Mapa propio en canvas sobre una rejilla hexagonal: relieve sombreado, 14 capas, fronteras, frentes, unidades y rutas comerciales. |
| Servidor | Node 22, Fastify 5, Socket.IO 4 | Una `GameInstance` por partida cargada; los comandos se procesan en serie, son idempotentes y tienen límite de frecuencia por conexión. |
| Persistencia | PostgreSQL (`pg`) o SQLite (`node:sqlite`) | Mismo SQL con dos dialectos. Tablas: `games`, `players`, `snapshots`, `commands` (único por `(game_id, command_id)`), `events`, `stats`, `chat`, `maps`. |
| Motor | TypeScript puro | Economía, fiscalidad, población, política, leyes, tecnología, diplomacia, ejército, guerras, eventos, IA, vistas y proyecciones. |
| Mundo | Generador procedural con semilla | Geografía (relieve, clima, ríos, lagos, mares) → provincias → países. El mundo oficial es un diseño fijo sobre ese mismo generador. |

### ¿Por qué no MapLibre ni PostGIS?

El mapa es un mundo inventado sobre una rejilla hexagonal con provincias, no geografía real con coordenadas. Un renderizador canvas propio y la adyacencia precalculada (provincias, ríos, estrechos, zonas marítimas) resultan más simples y deterministas que un SIG. Si en el futuro se quisieran mapas vectoriales con teselas, `mapData.ts` concentra la conversión.

### Modelo de datos (`shared/src/types.ts`)

- **`WorldMap`** (estático): celdas en base64; provincias (`ProvinceStatic`: celdas, terreno, rugosidad, vecinos con tipo de enlace tierra/río/estrecho, zonas marítimas, costa, recursos); zonas marítimas; masas de tierra; accidentes geográficos con nombre; ríos navegables.
- **`WorldState`** (dinámico): día, RNG, países (`CountryState`), provincias (`ProvinceState`: dueño soberano, controlador, población, capital por sector, reservas, edificios, malestar, devastación), unidades, batallas, guerras, tratados, propuestas, organizaciones, relaciones, mercados, eventos recientes, jugadores humanos y conectados.
- **`CountryState`**: identidad (identificador persistente, nombre, bandera, moneda, cultura, religión, capital, historia); economía (sectores con capital, trabajo, PTF y cuota estatal; macro; comercio; materias primas); presupuesto, impuestos y fiscalidad (libro contable, deuda interna y externa, calificación); demografía; grupos sociales; política (régimen, partidos, parlamento, gobierno, legitimidad, estabilidad, capital político, proyectos de ley); leyes vigentes; tecnología; ejército (personal, reservas, equipo, doctrina, planes); decisiones pendientes; IA.
- **Comandos** (`shared/src/commands.ts`): 34 tipos, entre ellos `setBudget`, `setTaxes`, `setMonetary`, `proposeLaw`, `privatize`, `nationalize`, `buildProject`, `setResearch`, `borrow`, `declareDefault`, `restructureDebt`, `recruit`, `orderUnits`, `createPlan`, `diploPropose`, `diploRespond`, `diploAction`, `declareWar`, `warReady`, `callToArmsRespond`, `resolveDecision`…

## 3. Estado de las funcionalidades

**Verificado** significa que hay una prueba automatizada o que se comprobó en un navegador real (`tests/e2e/ui-smoke.mjs`).

### Tiempo y multijugador

| Funcionalidad | Estado |
|---|---|
| 1 h real = 6 meses (20 s/día), reloj en el servidor | ✅ verificado (prueba) |
| Modos de reloj: con jugadores conectados / siempre / pausado | ✅ verificado (prueba) |
| Crear partida, código de 6 caracteres, sala de espera, elegir país, listo, comenzar | ✅ verificado (prueba + navegador) |
| Dos jugadores no pueden tener el mismo país | ✅ verificado |
| Reconexión, sesión guardada, código de recuperación | ✅ verificado |
| Comandos idempotentes (sin duplicados tras reconectar) | ✅ verificado |
| País desconectado: conserva su estado y políticas | ✅ verificado |
| Reinicio del servidor sin pérdida (instantánea + comandos) | ✅ verificado (SQLite y PostgreSQL) |
| Copia de seguridad / restauración portable | ✅ verificado (prueba) |
| Administrador: configuración, transferencia, liberar país | ✅ implementado |
| Chat global, por guerra y privado entre países | ✅ implementado |
| Limpieza de partidas abandonadas y descarga de memoria | ✅ implementado |
| Docker Compose (app + PostgreSQL) | ⚠️ archivos escritos; la imagen no se pudo construir en el entorno de desarrollo (sin red para `npm ci` dentro del contenedor) |

### Mundo

| Funcionalidad | Estado |
|---|---|
| Mundo oficial: 47 países, continentes, islas, ríos navegables, montañas, desiertos, recursos | ✅ verificado |
| Movimiento coherente con la geografía: tierra y río dentro de cada masa, estrechos (11 en el mundo oficial) entre masas, sin flotas en países sin costa | ✅ verificado |
| Mundo aleatorio con semilla (40–70 países), reproducible | ✅ verificado (varias semillas) |
| Provincias contiguas, adyacencias simétricas, sin celdas huérfanas | ✅ verificado |
| Países desiguales (gigantes, microestados petroleros) | ✅ verificado |
| Historia ficticia que afecta al estado inicial (régimen, deuda, rivalidades, reclamaciones, tratados) | ✅ implementado |

### Simulación

| Funcionalidad | Estado |
|---|---|
| Economía sectorial, mercados de materias primas, comercio por gravedad | ✅ implementado; estable a 3 años simulados |
| Impuestos con elasticidades y Laffer; presupuesto; libro contable | ✅ verificado |
| Deuda, prima de riesgo, calificación, emisión monetaria, default, reestructuración | ✅ implementado |
| Tipo de cambio, reservas, paridades, crisis cambiarias | ✅ implementado |
| Privatización y nacionalización con parámetros (porcentaje, método de venta, compradores admitidos, regulación posterior) | ✅ implementado |
| Leyes por categoría (40), trámite parlamentario o decreto | ✅ implementado |
| Partidos, elecciones, sistemas electorales, coaliciones | ✅ implementado |
| Grupos sociales, protestas, huelgas, golpes, separatismo | ✅ implementado |
| Árbol tecnológico desde 1990 (84 tecnologías), requisitos, difusión, tecnologías futuras inciertas | ✅ verificado |
| Diplomacia asíncrona (propuestas pendientes con jugadores desconectados), tratados con obligaciones, organizaciones, sanciones | ✅ verificado |
| Ejército: 11 tipos de unidad, movimiento, suministro, combate terrestre, aéreo y naval, bloqueos, desembarcos | ✅ implementado |
| Ocupación ≠ soberanía; la soberanía solo cambia por tratado | ✅ verificado |
| Guerras entre humanos: pendiente → preparación → activa ↔ congelada; sin pérdida territorial desconectado | ✅ verificado |
| Independencias con Estado completo e identificador persistente; unificaciones | ✅ verificado (independencia) |
| Colapso estatal: un Estado fallido durante meses se fragmenta en sucesores completos | ✅ verificado (prueba directa y emergente) |
| Eventos y decisiones emergentes (protestas, separatismo, crisis bancaria, hiperinflación, corrupción, juntas…) | ✅ implementado |
| IA por perfiles con puntuación e información imperfecta | ✅ implementado |
| Niebla de guerra en las vistas | ✅ implementado |
| Proyección a 24 meses con incertidumbre | ✅ implementado |

### Interfaz

| Funcionalidad | Estado |
|---|---|
| Menú (Nueva partida, Unirse con código, Continuar, Configuración, Información) | ✅ verificado (navegador) |
| Mapa con 14 capas, zoom y arrastre, selección, órdenes con clic derecho | ✅ verificado (navegador) |
| 19 paneles de gobierno (resumen, economía, presupuesto, impuestos, defensa, diplomacia, tecnología, leyes…) | ✅ verificado (navegador, sin errores de página) |
| Noticias, notificaciones, decisiones, tutorial, sala de guerra | ✅ implementado |

## 4. Hoja de ruta (pendiente)

Lo siguiente **no está implementado**:

1. **Anexión unilateral y Estados títeres.** Hoy la soberanía cambia por tratado de paz, unificación, independencia, colapso estatal o capitulación de la IA.
2. **Espionaje activo** (operaciones encubiertas, sabotaje, contrainteligencia). La inteligencia actual solo reduce el error de las estimaciones y mejora el reconocimiento en combate.
3. **Armas nucleares y disuasión.** Solo existe la energía nuclear como tecnología y sector.
4. **Pandemias, catástrofes naturales detalladas y refugiados como flujo propio.** Hoy hay eventos genéricos de desastre y migración económica.
5. **Mercado de armas** entre países.
6. **Historial de mapas** (reproducción visual de fronteras a lo largo del tiempo).
7. **Balance a largo plazo.** `scripts/long-run.ts` simula 10 años sin jugadores, sin valores inválidos. Con la calibración actual, el PIB mundial crece +1,4 %/año, la inflación mediana es estable (~5 %), los mercados de materias primas tienen equilibrio y hay ~350 adopciones tecnológicas en la década. Pendiente: corridas de 30 años, crecimiento de los países pobres algo bajo (~0,5–1 %) y gasto público de la IA que sube del 17 al 22 % del PIB.
8. **Pruebas de interfaz más amplias:** flujos de dos navegadores simultáneos y guerra entre humanos desde la interfaz.
9. **Escalado horizontal.** Cada partida vive en un único proceso; para varios servidores haría falta asignar cada partida a un nodo.
10. **Internacionalización** (hoy todo está en español).

## 5. Fases

1. ✅ Modelo de datos, calendario, comandos, rejilla hexagonal.
2. ✅ Generador de mundos y mundo oficial.
3. ✅ Motor de simulación con todos los subsistemas y sus pruebas.
4. ✅ Servidor multijugador, persistencia, recuperación.
5. ✅ Cliente: menú, sala de espera, mapa, paneles.
6. ⏳ Equilibrio a largo plazo, puntos 1–5 de la hoja de ruta, despliegue de referencia.
