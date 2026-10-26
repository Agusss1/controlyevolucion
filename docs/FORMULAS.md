# Fórmulas del motor de CYO

Este documento resume las ecuaciones que usa `simulation/src/engine`. El código manda: cuando el código y este texto no coincidan, vale el código. Los números son los coeficientes del código en el momento de escribir esto.

## Convenciones

- **Tiempo.** Un día simulado es `dt = 1/360` años, porque el calendario tiene 12 meses de 30 días. Las tasas están expresadas por año.
- **Ajuste gradual.** Casi todas las variables siguen la regla `approach(x, objetivo, dt, τ)`:
  `x ← x + (objetivo − x)·(1 − e^(−dt/τ))`, con `τ` en años. Así, ningún indicador salta de golpe: una ley o un impuesto empiezan a notarse en semanas o meses.
- **Determinismo.** Toda la aleatoriedad sale de un generador `sfc32` cuya semilla vive en el estado. Las mismas entradas (estado + comandos con su día y su orden) producen el mismo resultado.
- **Unidades.** El PIB real se mide en **UMI de 1990** (unidad monetaria internacional). Los valores nominales locales se calculan así: `PIB nominal = PIB real × nivel de precios × tipo de cambio base`.

## 1. Producción (`economy.ts › computeProduction`)

Hay 14 sectores. Cada provincia tiene su capital por sector. La producción potencial del sector `s` es una Cobb-Douglas:

```
Y_s = PTF_s · tec_s · (1 − cuotaEstatal_s · ineficienciaEstatal) · K_s^α_s · L_s^(1−α_s)
K_s = Σ_provincias capital_s · modificadorProvincia   (infraestructura, devastación, ocupación…)
```

- Los valores de `α` están en `data/sectors.ts`: petróleo y gas 0,85, minería 0,6, energía 0,7, telecomunicaciones 0,6, finanzas y tecnología 0,45, etc.
- **Sectores extractivos.** La producción no puede superar `reservas / 25 · (1 − límiteExtracción)`. Las reservas físicas de cada provincia bajan con lo que se extrae, de modo que **no aparecen recursos de la nada**.
- **Calibración.** Al crear el mundo, la PTF de cada país se fija para que el PIB inicial coincida con el diseñado (población × PIB per cápita).

**Producción efectiva** (`macroStep`):

```
Y_s,ef = Y_s · (1 + brecha · [0,2 si extractivo, 1 si no]) · (1 − 0,55·escasezEnergía)
                · (1 − 0,25·huelgas  [industria, transporte]) · (1 − 0,15·controlesPrecios·min(1, 3π))
                · (1 − 0,3·cansancioBélico)
```

## 2. Mercados de materias primas y comercio (`economy.ts › worldTrade`)

- **Mercados mundiales** de alimentos, petróleo, gas, carbón y minerales. Cada país ofrece su producción y demanda según sus sectores. El precio se ajusta con el exceso de demanda. La parte que cada importador consigue cubrir depende de su **accesibilidad relativa**, que reúne la distancia entre capitales, los tratados, los bloqueos, las sanciones y las barreras comerciales.
- **Manufacturas y servicios.** El comercio sigue un modelo de **gravedad**: `flujo_ab ∝ PIB_a·PIB_b·acceso_ab / distancia`. El sesgo exportador de cada país se calibra para que el saldo comercial de 1990 sea plausible.
- **Términos de intercambio.** La renta nacional es `Y + Σ (p/p₀ − 1)·(exportaciones − importaciones)`. Cuando el petróleo se encarece, el exportador gana renta y el importador la pierde.
- **Escasez.** Si falta energía, se sustituye entre combustibles. Lo que no se cubre aumenta `escasezEnergía`. Si faltan alimentos, aumenta `escasezAlimentos`, que eleva la pobreza, la inflación y el malestar.

## 3. Empleo, salarios, desigualdad y pobreza

```
participaciónObjetivo = 0,62 + 0,08·tanh((PIBpc − 5)/10) − 0,12·(religiosidad − 0,5) − (62 − edadJubilación)·0,012 − 0,5·movilización
desempleoNatural = 0,035 + 0,06·rigidezLaboral + 0,05·salarioMínimo·(1 − informalidad) + 0,03·regulación
                   + 0,02·(1 − capAdmin/100) + 0,04·escasezEnergía
desempleoObjetivo = desempleoNatural − 0,45·brecha           (ley de Okun; τ = 0,4 + 1,2·rigidez)
```

- El trabajo se reasigna entre sectores hacia el mayor producto marginal (ajustado por la prima salarial), con `τ = 2,5 + 6·rigidez + 4·controles`.
- `salario = Σ(1−α)·Y / empleados · (1 + 0,08·sindicatos + 0,05·salarioMínimo)`
- Gini de mercado: `0,3 + 0,12·(informalidad − 0,2) + 0,08·(petróleo/PIB) ± controles − 0,06·sindicatos`. El Gini final resta la progresividad (`0,25·(0,5·tIngreso + 3·tPatrimonio)`), las transferencias (`0,9·transferencias/PIB`) y el acceso educativo.
- Pobreza: es una función logística de la mediana de ingresos (`PIBpc·(1−Gini)·0,85`, centrada en 2600 UMI). Suma `+0,5·desempleo − 1,2·transferencias + 0,4·escasezAlimentos`.
- Informalidad: `0,06 + 0,45·cargaLaboral + 0,16·regulación + 0,08·rigidez + 0,08·salarioMínimo − 0,3·capAdmin − 0,08·tanh(PIBpc/15000) + 0,1·corrupción`.

## 4. Demanda, dinero, inflación y tipo de cambio

**Brecha de producto** (demanda agregada, τ = 0,35):

```
brecha* = 0,5·impulsoFiscal + clamp(−0,4·(tasaReal − 0,02), ±0,06) + (confianza − 55)/700·(1 − 0,8·cuotaEstatal)
          + 0,5·Δ(exportaciones netas) − 0,1·estrésBancario − 0,12·escasezEnergía
```

`impulsoFiscal` es el déficit menos su media móvil: lo que mueve la demanda es el cambio del déficit, no su nivel.

**Banco central.** Con independencia > 0,5 aplica una regla de Taylor: `i = 0,02 + π + 0,5·(π − 0,03) + 0,5·brecha`. Sin independencia, la tasa la fija el gobierno con `setMonetary`.

**Dinero.** La masa monetaria crece con la tendencia del PIB y con la inflación. **Imprimir dinero** (financiar el Tesoro con la monetización permitida) la aumenta de forma directa.

**Inflación** (τ = 0,25):

```
π* = πₑ + 0,45·brecha + 0,65·(crecimientoMonetario − tendencia − πₑ) + 0,25·depreciación
     + empuje de alimentos y petróleo + 0,3·escasezAlimentos + 0,15·escasezEnergía
π* ← π*·(1 − 0,55·controlesPrecios)    si π* > 0
πₑ → indep·0,03 + (1 − indep)·π         (expectativas ancladas solo con banco central independiente)
```

**Balanza de pagos y tipo de cambio:**

```
cuentaCorriente = X − M − intereses de deuda externa − repatriación de utilidades + ayuda
cartera = aperturaCapital·clamp(2·(i − i_mundo − primaRiesgo), −0,08, 0,06)·Y − fuga por baja confianza
reservas += (CC + IED + cartera + préstamos externos)·(0,15 + 0,85·paridad)·dt
depreciación = (1 − paridad)·[(π − π_mundo) − 0,9·BdP/Y + 0,6 si reservas ≤ 2 % del PIB]
```

Con paridad fija y reservas por debajo del 2,5 % del PIB se produce una **crisis cambiaria**: devaluación del 40 %, golpe a la confianza y estrés bancario.

## 5. Inversión y crecimiento

```
tasaAhorro = 0,12 + 0,12·tanh(PIBpc/12000) + 0,05·(confianza − 50)/50 − 0,1·(generosidadPensiones − 0,4)
invPrivada = ahorro·(0,55 + 0,6·confianza)·(1 − 0,6·tSociedades)·(1 − primaRiesgo·3)·(1 − 0,6·estrésBancario)
             ·(1 − 0,5·controles)·Y·(1 − cuotaEstatal) + IED
invPública empresarial = 0,6·excedenteEmpresasEstatales·(1 − ineficiencia) + 0,3·subsidios
```

- La inversión privada va a los sectores según su rendimiento esperado: `α·Y/K · señalPrecio^1,2 · (1+margen) · (1 − 0,45·topePrecio) · (1 − 0,8·cuotaEstatal) · (1+subsidio)`.
- El capital neto de cada sector cambia en `(inversión − depreciación·K)·dt`.
- La **PTF** crece a la tasa
  `0,004 + 0,012·(capHumano − 0,5) + 0,006·(infra − 0,5) + 0,012·brechaFrontera·apertura·(0,4 + aperturaIED)·capHumano − 0,008·corrupción − 0,005·regulación − 0,006·controles + 0,004·(indepJudicial − 0,5) − 0,01·cansancioBélico`.
  Así, los países pobres con apertura y capital humano convergen; la corrupción y la guerra los frenan.

## 6. Fiscalidad (`fiscal.ts`)

Cada impuesto recauda `tasa × base × cumplimiento × e^(−elasticidad·tasa)`. Ese último factor recoge la evasión, la contracción de la base y la informalidad, y produce una **curva de Laffer**: subir una tasa ya alta puede recaudar menos.

| Impuesto | Base | Elasticidad |
|---|---|---|
| IVA | consumo nominal · (1 − 0,7·informalidad) | 2,2 |
| Renta personal | masa salarial formal | 2,0 |
| Cotizaciones | masa salarial formal | 2,2 |
| Sociedades | beneficios privados (½ de la renta del capital no estatal) | 2,6 |
| Patrimonio | 3·PIB·0,55 (riqueza estimada) | 12 |
| Aranceles | importaciones · (0,7 + 0,3·cumplimiento) | 1,6 |
| Derechos de exportación | exportaciones de materias primas | 2,0 |
| Especiales | 9 % del consumo | 2,0 |
| Provinciales | 1,5·PIB·urbanización | 3,0 |

- `cumplimiento = clamp(0,45 + 0,5·capAdmin − 0,25·corrupción, 0,2, 0,97)`.
- **Rentas de recursos:** `valor extractivo · α · (0,15 + 0,6·cuotaEstatal) · (0,6 + 0,4·cumplimiento)`.
- **Dividendos de empresas públicas:** se calculan sobre los sectores no extractivos.
- **Gasto:** la ley de presupuesto fija cada partida en % del PIB. Si hay atrasos con proveedores, el gasto se recorta hasta un 50 %.
- **Saldo:** `ingresos − gasto − intereses`, y el Tesoro suma `saldo·dt`. Cuando el Tesoro cae por debajo de un colchón del 0,5 % del PIB, se cubre en este orden: (1) monetización, si el banco central no es independiente; (2) deuda, si los mercados están abiertos y la regla fiscal lo permite; (3) **atrasos**, que se registran en el libro como gasto extraordinario.
- **Identidad contable** que verifican las pruebas: `Tesoro = inicial + ingresos − gasto − intereses + préstamos − amortizaciones + emisión + extraordinario`.
- **Prima de riesgo** (objetivo):
  `0,008 + 0,06·max(0, deuda/PIB − 0,6) + 0,5·max(0, déficit − 0,03) + 0,06·min(1, 2·(π − 0,15)) + 0,2·default + 0,025·historialDefaults − 0,04·min(1, 4·reservas/PIB) + 0,04·(1 − estabilidad) + 0,05·cansancioBélico`.
  Con prima ≥ 0,25 los mercados se cierran. La calificación va de AAA (< 1 %) a CCC; en default es D.
- **Default y reestructuración.** El default corta el acceso al crédito y paga solo la mitad de los intereses internos. Reestructurar con una quita reduce la deuda y deja un historial que encarece la deuda futura.

## 7. Población (`population.ts`)

Hay tres cohortes (jóvenes, adultos, mayores). La natalidad baja con el PIB per cápita y la educación. La mortalidad baja con el gasto en salud y la tecnología, y sube con la guerra, el hambre y la pobreza. La población se reparte entre provincias según la urbanización y la devastación. La **migración** entre dos países fluye cuando la diferencia de atractivo supera 0,3. El atractivo es `ln(PIBpc) + estabilidad/40 − 1,5·guerra − 4·desempleo − 3·escasezAlimentos`. El flujo se escala por las leyes de emigración e inmigración, la distancia entre capitales, la opinión mutua y los acuerdos migratorios (×1,8).

## 8. Política (`politics.ts`)

Hay diez grupos sociales: trabajadores, agricultores, empresarios, clase media, empleados públicos, jubilados, jóvenes, militares, religiosos y minorías. Cada grupo tiene un tamaño, una satisfacción y un grado de radicalización. La satisfacción tiende a un objetivo que depende de la economía (salarios, desempleo, inflación, pobreza), de las leyes (cada opción favorece o perjudica a ciertos grupos) y de la represión.

```
peso_g = tamaño_g · (democracia + (1 − democracia)·élite_g)
aprobación = Σ peso_g·satisfacción_g / Σ peso_g                         (τ = 0,15)
legitimidad* = baseRégimen + 15·(estadoDeDerecho − 50)/50 + 10·tanh(8·crecimiento)·(1 − 0,6·dem)
               + 15·(aprobación − 50)/50·(1 − 0,5·dem) − 4·decretos − 25·represión − 15·guerraPerdida
               + 5 (elecciones recientes en democracia) − 10·corrupción
estabilidad* = 10 + 0,35·aprobación + 0,35·legitimidad + 15·seguridad − 30·radicalización − 25·protestas
               − 15·separatismo − 15·cansancioBélico − 10·escasezAlimentos − 8·fatigaReformista
riesgoGolpe = 0,6·(45 − satMilitares)/45 + 0,5·(50 − legitimidad)/50 + 0,2·(1 − dem) − 0,5 (democracia consolidada)
capitalPolítico += dt·(6 + 10·(aprobación − 45)/50 + 6·(legitimidad − 50)/50)
```

- **Protestas:** `1,6·descontento·libertadReunión·(1 − 0,6·represión) + 0,4·radicalización`.
- **Malestar provincial:** en provincias de minorías crece con la falta de derechos de minorías, la insatisfacción del grupo y la ocupación. Baja con la autonomía y la seguridad. El separatismo sostenido puede desembocar en **independencia** (ver §12).
- **Elecciones:** el voto de cada partido depende de la distancia ideológica a cada grupo en el espacio político multidimensional y del desempeño del gobierno. Los escaños se reparten por el sistema electoral vigente (proporcional, mayoritario o mixto) y luego se forma gobierno por coalición.
- **Leyes:** en democracia, un proyecto se debate 20 días (45 si es constitucional, que exige 2/3) y se vota según la posición de cada partido. En autocracias se decreta, pero gobernar por decreto erosiona la legitimidad. Toda reforma consume capital político, y su implementación tarda.

## 9. Tecnología (`tech.ts`)

```
puntos = 45·(cienciaReal)^0,6·(0,4 + capHumano)·(1 + bonusInvestigación) + 6·capHumano + 0,6·producciónSectorTecnológico
         + Σ socios científicos · cuota · puntos del socio
coste = costeBase · varianza_país · difusión · adelanto
difusión = clamp(1 − 0,72·adopciónMundial^0,8·(0,5 + 0,5·apertura) − 0,04·socios − 0,08·aperturaIED·adopción, 0,15, 1)
adelanto = 1 + 0,09·max(0, añoMadurez − añoActual − 2)
```

- Se investigan las dos primeras tecnologías de la cola (65 % y 35 % de los puntos).
- Los requisitos son obligatorios.
- Las tecnologías posteriores a 2026 tienen una varianza de coste de 0,6 a 1,8 y un descubrimiento final probabilístico. Ninguna tecnología tiene fecha fija.

## 10. Ejército y combate (`military.ts`)

**Poder terrestre de una unidad:**

```
poder = base(ataque|defensa) · fuerza · (0,3 + 0,7·equipo) · (0,35 + 0,65·organización) · (0,55 + 0,45·moral)
        · (0,5 + 0,5·entrenamiento) · (1 + 0,5·experiencia) · (0,25 + 0,75·suministro) · (1 − 0,4·fatiga)
        · tecnología · doctrina · max(0,3, 1 − penalizaciónBlindados) · (0,7 + 0,6·calidadMando)
```

- **Defensa:** se multiplica por `1 + terreno + 0,3·rugosidad + río (0,3) o estrecho (0,5) + 0,45·atrincheramiento + 0,15·fortificación + ciudad + 0,6 si es desembarco`.
- **Aire:** la superioridad (proporción de cazas) reparte el apoyo cercano.
- También cuentan el reconocimiento (inteligencia y fuerzas especiales) y el apoyo naval en costas con dominio 1,5:1.
- **Pérdidas diarias:** el defensor pierde `0,012·ratio^0,75·ruido` y el atacante `0,011·ratio^(−0,75)·ruido` (×1,5 en desembarcos).
- **Suministro:** se traza por provincias controladas desde la capital y los puertos. Los bloqueos y las interdicciones navales lo cortan.
- **Ocupación:** la ocupación cambia el **control** de la provincia, no su **soberanía**. La soberanía solo cambia con un tratado de paz (cesiones), una unificación, una independencia o, para países de IA, la capitulación tras 60 días totalmente ocupados.

## 11. Guerras sincronizadas entre humanos

| Estado | Condición |
|---|---|
| `pending` | Declarada contra un humano que no está conectado. |
| `preparing` | Todos los humanos obligados están conectados; dura `warPrepDays`. |
| `active` | Combate normal. |
| `frozen` | Un humano obligado se desconectó y venció la gracia (`warGraceSeconds`). |
| `ceasefire` / `ended` | Por tratado. |

`humansMayLoseTerritory(defensor)` es falso si el defensor es humano y está desconectado: sus batallas se congelan y no pierde provincias.

## 12. Nuevos Estados

- **Independencia:** el separatismo alto y sostenido, o una decisión de evento, crea un país completo. Recibe un **identificador nuevo y persistente**, bandera, capital, gobierno, partidos, economía (con el capital de sus provincias), deuda proporcional, ejército inicial y relaciones heredadas.
- **Unificación:** se hace por tratado. El Estado mayor absorbe al menor y conserva su identificador; recibe provincias, unidades, equipo, Tesoro y deudas.
- Los países desaparecidos se conservan en el historial y su identificador no se reutiliza.

## 13. Inteligencia artificial (`ai.ts`)

- Cada país sin humano conectado tiene un **perfil** (`balanced`, `trader`, `nationalist`, `hegemon`, `defensive`, `developmental`, `aggressive`, `scientific`, `pacifist`, `socialist`…) con pesos de comercio, agresión, gasto y otros.
- Las decisiones se toman por **puntuación** de opciones: presupuesto, impuestos, investigación, reclutamiento, propuestas diplomáticas, guerra y paz. Las restricciones son las mismas que para un humano.
- La IA ve el mundo con **información imperfecta**: `estimación = valor·(1 ± 0,35·(1 − inteligencia)·(1 − 0,5·libertadPrensa))`. El error es estable durante cada mes.
- **Propuestas.** La puntuación base es `opinión/40 + (confianza − 50)/60`, más términos según el tipo (por ejemplo, una alianza requiere un rival común). Se acepta si la puntuación es mayor que 0.

## 14. Niebla de guerra (`view.ts`)

Cada jugador recibe una vista filtrada. Los datos de su propio país son exactos. Los de otros países son estimaciones (como en §13), y las unidades ajenas solo se ven en las provincias propias y vecinas, en las zonas marítimas adyacentes y alrededor de las unidades propias y aliadas, siempre con el nombre y la orden ocultos. Un observador sin país (en la sala de espera) ve las estimaciones públicas.
