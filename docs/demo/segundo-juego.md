# Trompo · segunda comparación con y sin Nomos

Fecha: 2026-11-10. Decidido por el usuario: no se repite Candela; se compara con otro juego, «Trompo», y las dos ramas
lo hacen desde cero. Sustituye a la fase 4 del plan `docs/superpowers/plans/2026-11-10-jam-vista.md`. Se ejecuta cuando
las fases 1 a 3 de ese plan estén fusionadas en `main`.

Por qué otro juego: Nomos se ajustó después de ver el resultado de Candela. Con un encargo que ninguna rama ha visto, la
medida es limpia y además prueba que la semilla no quedó hecha a medida de un patio visto desde arriba.

## El encargo (texto único, idéntico para las dos ramas; no se toca después de la primera ejecución)

```text
Haz un juego completo en Unreal Engine 5.9 con C++ llamado «Trompo» y déjalo empaquetado (Shipping, Win64).

- Es el juego venezolano del trompo. Hay un ruedo redondo de tierra de unos 6 m de diámetro, visto de cerca y de lado,
  un poco desde arriba, como si estuvieras agachado junto a él.
- Una sola mecánica: mueves el ratón para elegir dónde cae tu trompo, mantienes pulsado para cargar la fuerza y sueltas
  para lanzarlo. El trompo cae girando y se desplaza por el ruedo según la fuerza y la dirección.
- En el ruedo hay 5 trompos rivales girando. Cuando el tuyo golpea a uno, lo empuja; el que sale del ruedo queda fuera.
- Todo trompo pierde giro con el tiempo y con cada golpe. Cuando se queda sin giro, se tambalea y cae.
- Tienes 3 lanzamientos. Ganas si sacas a los 5 rivales del ruedo. Pierdes si gastas los 3 sin conseguirlo.
- Tiene que sentirse bien: el trompo zumba y el zumbido baja de tono cuando pierde giro, los golpes suenan a madera y
  dan chispas y una pausa breve, el trompo levanta polvo y deja un surco en la tierra, y la cámara acompaña el golpe.
- Los trompos tienen que parecer trompos: madera torneada pintada a franjas de colores, con punta de metal. Cada rival,
  de un color distinto.
- Menú de inicio, HUD con los lanzamientos que quedan y los rivales fuera (n/5), y pantalla de victoria o derrota con
  reinicio (tecla R).
- Modo demo: con la variable de entorno TROMPO_AUTO=1 el juego se juega solo y gana en unos 60 segundos.
- Sin assets descargados: todo generado (mallas procedurales o básicas, materiales, partículas y sonido).
- Entrega: el proyecto compila, un test de reglas pasa, el .exe Shipping arranca, docs/hecho.md explica cómo se juega,
  y docs/tiempos.jsonl tiene una línea {"marca":"inicio","hora":...} al empezar y otra {"marca":"FIN","hora":...} al terminar.
```

## Las dos ramas

| | A · sin Nomos | B · con Nomos |
|---|---|---|
| Proyecto | `Unreal Projects/TrompoSolo`: plantilla C++ en blanco de UE 5.9 (`TP_Blank` más módulo mínimo, compila antes de empezar) | `Unreal Projects/Trompo`: `nomos nuevo Trompo` |
| Quién | Un agente Opus sin skills, sin plugins y sin leer nada de Nomos | Nomos en modo rápido: el encargo entra por `POST /messages` y el director decide |
| Orden | Segunda (hereda la caché de shaders: ventaja para A) | Primera |
| Tope | 120 min de reloj | 120 min de reloj |

Reglas:
- Una rama cada vez. Nadie ayuda a ninguna; cada intervención se cuenta con hora y causa (`docs/demo/trompo-notas-A.md`,
  `trompo-notas-B.md`).
- Rama A: intenta primero `claude -p --model opus --disable-slash-commands` con los permisos de los workers de Nomos. Si
  el clasificador lo bloquea, como la otra vez, un subagente Opus con orden de no usar skills ni leer nada de Nomos ni de
  otros proyectos. Escribe en la comparativa cuál fue.
- **Vigila que A no se quede colgada por el arnés.** En Candela, el subagente esperó 40 min a un trabajo en segundo plano
  que ya había muerto. Comprueba cada 5 min que tiene un proceso vivo o actividad reciente; si no, un mensaje neutro
  («Tu trabajo en segundo plano ya no está corriendo. Continúa.») cuenta como intervención del arnés, se anota aparte y
  ese tiempo muerto se resta del reloj de A, con las dos cifras a la vista.
- A no se empeora a propósito: mismo modelo, mismo encargo, mismo motor.
- En B no repartas tú ni corrijas la spec del director. Anota cuántas tareas creó y si fueron en paralelo.
- Si la primera pasada de B se rompe por un fallo de Nomos ajeno al juego (como el recorte a 90 caracteres), párala,
  arréglalo con prueba y repite B una sola vez; las dos pasadas salen en la comparativa.

## Qué se mide

Objetivo:

| Medida | De dónde |
|---|---|
| Reloj de inicio a FIN, y minutos hasta el primer `.exe` | `docs/tiempos.jsonl`, fecha del `.exe` |
| Tokens de entrada y de salida, sesiones | transcripciones de Claude Code; `nomos metricas --json` en B |
| Intervenciones | las notas de cada rama |
| Fallos de acabado | `revisar_acabado.py <proyecto>` en las dos |
| Fallos de imagen | `revisar_imagen.py` sobre las mismas cinco capturas de cada `.exe` (sin JSON: solo medidas de imagen) |
| El `.exe` aguanta 60 s · test de reglas | vídeo de 60 s · automatización de Unreal |

Calidad, juez a ciegas (0 no está · 1 mal · 2 bien · 3 muy bien):

| # | Criterio |
|---|---|
| 1 | Se puede jugar de menú a final con el `.exe` |
| 2 | La mecánica se entiende mirando: dónde cae, con qué fuerza, qué pasa al golpear |
| 3 | Se lee a 1280×720: se distinguen tu trompo, los rivales y el borde del ruedo |
| 4 | Los trompos parecen trompos (forma, franjas, punta) y cada rival es distinto |
| 5 | Chispas, polvo y surco |
| 6 | Sonido: zumbido que baja de tono, golpe de madera, final |
| 7 | HUD y menú: tipografía propia, nítida y con tildes; paneles con forma propia |
| 8 | Nada por defecto del motor: sin material de cuadros, sin fuente de depuración, sin formas sin vestir |
| 9 | Pantalla de carga al arrancar y pantalla de final con reinicio |
| 10 | Robustez: el modo demo gana, el test pasa y no hay caída en 60 s |

Dos jueces, no uno: dos subagentes Sonnet independientes, cada uno con su propio sorteo de etiquetas X e Y. Cada uno
recibe de cada juego **siete** capturas del `.exe` en modo demo a 1280×720 (segundos 0, 3, 10, 20, 30, 45 y 58; la 58
debe pillar el final) y la rúbrica. La nota de cada criterio es la media de los dos; si difieren en 2 puntos o más, se
escribe la discrepancia. El criterio 6 lo puntúa quien dirige el experimento leyendo el código de sonido de las dos
ramas con la misma vara, y dice que no lo ha oído.

## Qué cuenta como «gran diferencia»

- B saca al menos 24 de 30 y al menos 8 puntos más que A.
- B termina en el mismo tiempo o menos que A (reloj de A sin el tiempo muerto del arnés), con 0 intervenciones.
- B tiene 0 fallos de acabado y 0 fallos de imagen.

Si no se cumple, se escribe tal cual, con las causas sacadas de specs, commits y capturas. No hay ronda de arreglos ni
segunda pasada por nota: lo que falte queda como lista de causas para el usuario.

## Entregables

- `docs/demo/comparativa-trompo.md`: comandos exactos de cada rama, tablas, las notas de los dos jueces y conclusión en
  diez líneas. Una tabla final junta Candela (A 22, B 14) y Trompo.
- `Escritorio/Trompo-demo/`: vídeo de 60 s de cada rama, vídeo lado a lado, las catorce capturas y copia de la comparativa.
- Acceso directo en el Escritorio a `Trompo.exe` de la rama B.
- Después, la fase 5 del plan (cierre) con `docs/jam-vista-informe.md`, que incluye esta comparación.
- Al terminar: libera `Intermediate` y `Saved/StagedBuilds` de `TrompoSolo`. `Unreal Projects/Candela`, `CandelaSolo` y
  `Escritorio/Candela-demo/` no se tocan.
