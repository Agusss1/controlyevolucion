# CYO

Simulador geopolítico multijugador y persistente ambientado en un **mundo ficticio**, Vereth, que empieza el **1 de enero de 1990**. No hay turnos. El reloj lo lleva el servidor: **1 hora real equivale a 6 meses simulados** (1 día de juego = 20 s). Cada jugador gobierna un país y lo administra de forma asíncrona. Los países sin jugador los gobierna una IA local, sin APIs de pago.

No aparece ningún país real. Las naciones, culturas, religiones, monedas, organizaciones e historias son ficticias. 1990 se usa solo como referencia tecnológica.

- Diseño, modelo de datos, fases y hoja de ruta: [PLAN.md](PLAN.md)
- Fórmulas del motor: [docs/FORMULAS.md](docs/FORMULAS.md)
- Atlas del mundo oficial, generado desde el código: [docs/MUNDO_OFICIAL.md](docs/MUNDO_OFICIAL.md)

## Requisitos

- **Node.js 22.5 o superior**. SQLite se usa a través del módulo nativo `node:sqlite`.
- Opcional: **PostgreSQL 14 o superior** para producción. Sin `DATABASE_URL`, el servidor usa SQLite en `data/cyo.sqlite`.
- Opcional: Docker y Docker Compose.

## Puesta en marcha

### Opción A: un solo proceso (lo más simple para jugar con amigos)

```bash
npm install
npm run build          # compila el cliente en client/dist
npm start              # servidor en http://localhost:3000 (sirve también el cliente)
```

### Opción B: Docker Compose con PostgreSQL

```bash
docker compose up --build    # http://localhost:3000
```

### Desarrollo (recarga en caliente)

```bash
npm install
npm run dev:server     # API + Socket.IO en :3000
npm run dev:client     # Vite en :5173 (reenvía /api y /socket.io a :3000)
```

## Cómo jugar con otras personas

1. Quien organiza la partida abre el juego y elige **Nueva partida**. Puede elegir el mundo oficial o uno aleatorio con semilla, el máximo de jugadores, la privacidad y el modo del reloj.
2. En la **sala de espera** aparece un **código** de 6 caracteres. Los demás entran con **Unirse con código**.
3. Cada jugador elige un país libre (dos jugadores no pueden tener el mismo) y marca **Estoy listo**. El administrador pulsa **Comenzar partida**.
4. Al crear o unirse a una partida, el juego guarda la sesión en el navegador. Dentro de la partida, el menú ofrece un **código de recuperación**. Con ese código se recupera el mismo país desde otro dispositivo (**Continuar partida → Recuperar en este dispositivo**).

Para que otras personas se conecten desde fuera de tu red, el puerto 3000 tiene que ser accesible: redirección de puertos en el router, un VPS, o un túnel como `cloudflared` o `ngrok`. Define `PUBLIC_URL` para que los enlaces de invitación muestren la dirección correcta.

### El reloj

| Modo | Comportamiento |
|---|---|
| `when_online` (por defecto) | El tiempo corre solo mientras haya al menos un jugador conectado. |
| `always` | Corre siempre. Tras un reinicio del servidor recupera como máximo `MAX_CATCHUP_DAYS` días. |
| `paused` | Lo pausa el administrador. |

Los comandos llevan un identificador único y se aplican una sola vez aunque el cliente los reenvíe al reconectarse. El país de un jugador desconectado conserva sus políticas y sigue simulándose: la economía y la política avanzan, pero la IA no toma decisiones por él.

### Guerras entre jugadores

Una declaración de guerra contra un humano queda **pendiente** hasta que todos los humanos obligados estén conectados. Después pasa por un periodo de **preparación** (`warPrepDays`) y se activa. Si un participante humano se desconecta, el frente se **congela** cuando termina la gracia (`warGraceSeconds`). Un humano desconectado nunca pierde territorio. Los aliados humanos deciden si acuden a la llamada a las armas.

## Variables de entorno (servidor)

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Escucha HTTP. |
| `DATABASE_URL` | — | `postgres://usuario:clave@host/base`. Si falta, se usa SQLite. |
| `SQLITE_PATH` | `data/cyo.sqlite` | Archivo SQLite. |
| `MS_PER_DAY` | `20000` | Milisegundos por día de juego. **No lo cambies en partidas reales**: solo existe para pruebas. |
| `SNAPSHOT_EVERY_DAYS` | `10` | Frecuencia de las instantáneas completas. Entre una y otra se guardan los comandos. |
| `UNLOAD_AFTER_MINUTES` | `15` | Descarga de memoria las partidas sin jugadores. |
| `PURGE_LOBBY_AFTER_DAYS` | `14` | Borra las salas de espera abandonadas. |
| `MAX_CATCHUP_DAYS` | `180` | Tope de días de recuperación en modo `always`. |
| `CLIENT_DIST` | `client/dist` | Carpeta del cliente compilado. |
| `PUBLIC_URL` | — | Dirección pública para los enlaces de invitación. |
| `LOG_LEVEL` | `info` | Nivel de registro de Fastify (`silent` lo desactiva). |

Los valores exactos por defecto están en `server/src/config.ts`.

## Copias de seguridad

```bash
npm run backup --workspace server                          # backups/cyo-AAAAMMDD-HHMMSS.json.gz
npm run backup --workspace server -- --restore archivo.json.gz
```

La copia es portable entre SQLite y PostgreSQL. Por cada partida guarda la fila de la partida, los jugadores (solo hashes de token), el mapa, la última instantánea y los comandos posteriores. Es lo mismo que usa la recuperación tras una caída. Con PostgreSQL también sirve `pg_dump`.

## Pruebas

```bash
npm test                 # vitest: mundo, simulación y servidor (incluye PostgreSQL si está disponible)
npm run typecheck
node tests/e2e/ui-smoke.mjs http://127.0.0.1:3000 capturas/   # humo de la interfaz con Playwright (servidor ya iniciado)
```

La prueba de PostgreSQL usa `TEST_DATABASE_URL` (por defecto `postgresql://cyo:cyo@localhost/cyo_test`). Si no hay servidor disponible, se omite y lo avisa en la salida.

## Mundos

```bash
npm run world:official   # regenera geodata/official/vereth-1990.json.gz (+ .sha256)
npm run world:preview -- mapa.png [semilla]   # PNG del mapa (oficial, o aleatorio con esa semilla)
npm run docs:world       # regenera docs/MUNDO_OFICIAL.md
npx tsx scripts/long-run.ts 10 [semilla]   # corrida larga sin jugadores con indicadores anuales
```

El mundo oficial (47 países, semilla `CYO-VERETH-1990`) y los mundos aleatorios usan el mismo generador y el mismo motor. La misma semilla con las mismas entradas produce exactamente el mismo mundo, y hay pruebas que lo verifican.

## Estructura

```
shared/       tipos, calendario, protocolo, esquema de comandos (zod), rejilla hexagonal
simulation/   motor determinista: economía, fiscalidad, población, política, leyes, tecnología,
              diplomacia, ejército, guerras, eventos, IA, vistas con niebla de guerra; generador de mundos
server/       Fastify + Socket.IO, partidas en memoria, persistencia (PostgreSQL/SQLite), reloj, copias
client/       React + Vite + Tailwind + Zustand + TanStack Query; mapa en canvas
geodata/      mundo oficial precompilado
tests/        pruebas (vitest) y humo de interfaz (Playwright)
docs/         fórmulas y atlas del mundo oficial
scripts/      generación y vista previa de mundos
```
