# Candela · juego demo y comparación con y sin Nomos

Fecha: 2026-11-10. Decidido por el usuario: el juego demo es «Candela». Sirve para dos cosas: enseñar qué sale de Nomos
y medir, con el mismo encargo, la diferencia entre hacerlo con Nomos y sin Nomos.

## El encargo (texto único, idéntico para las dos ramas; no se toca después de la primera ejecución)

```text
Haz un juego completo en Unreal Engine 5.9 con C++ llamado «Candela» y déjalo empaquetado (Shipping, Win64).

- Eres una brasa en un patio de noche. Vista desde arriba, algo inclinada. Un solo patio cerrado de unos 30 × 30 m.
- Una sola mecánica: apuntas con el ratón, mantienes pulsado para cargar y sueltas para lanzarte en línea recta.
  Mientras dura el lanzamiento atraviesas sombras.
- Las sombras nacen en los bordes y caminan hacia ti. Atravesar una la revienta en chispas. Si una te toca cuando
  estás parada, te enfría.
- Tu calor baja solo con el tiempo y sube con cada sombra reventada. Con calor 0 pierdes.
- Hay 8 faroles apagados. Cada 5 sombras reventadas se enciende un farol. Con los 8 encendidos ganas.
- Cada farol encendido vuelve el patio más cálido y más claro: el final tiene que verse claramente distinto del principio.
- Tiene que sentirse bien: pausa breve al impactar, sacudida de cámara, estela, chispas, y sonido al lanzarte, al
  reventar una sombra, al encender un farol y al terminar.
- Menú de inicio, HUD con el calor y los faroles encendidos (n/8), y pantalla de victoria o derrota con reinicio (tecla R).
- Modo demo: con la variable de entorno CANDELA_AUTO=1 el juego se juega solo y gana en unos 60 segundos.
- Sin assets descargados: todo generado (mallas básicas o procedurales, materiales, partículas y sonido).
- Entrega: el proyecto compila, un test de reglas pasa, el .exe Shipping arranca, docs/hecho.md explica cómo se juega,
  y docs/tiempos.jsonl tiene una línea {"marca":"inicio","hora":...} al empezar y otra {"marca":"FIN","hora":...} al terminar.
```

## Las dos ramas

| | A · sin Nomos | B · con Nomos |
|---|---|---|
| Proyecto | `Unreal Projects/CandelaSolo`: plantilla C++ en blanco de UE 5.9 | `Unreal Projects/Candela`: `nomos nuevo Candela` |
| Quién | Un agente Opus (`claude -p --model opus`) sin skills, sin plugins y sin el `CLAUDE.md` de Nomos | Nomos en modo rápido: el encargo entra como mensaje y el director lo reparte |
| Modelo | Opus | Opus para implementar; lo demás, lo que Nomos trae por defecto |
| Orden | Segunda (hereda la caché de shaders: ventaja para A) | Primera |
| Tope | 120 min de reloj | 120 min de reloj |

Reglas de la comparación:
- Una rama cada vez: el PC tiene 31 GB de RAM y unos 7 libres.
- Nadie ayuda a ninguna rama. Cada intervención humana o del agente que dirige el experimento se cuenta.
- A no se empeora a propósito: mismo modelo, mismo encargo, mismo motor, mismos permisos.
- El comando exacto de cada rama queda escrito en `docs/demo/comparativa.md`.

## Qué se mide

Objetivo (sale de archivos, no de opinión):

| Medida | De dónde |
|---|---|
| Reloj de inicio a FIN | `docs/tiempos.jsonl` de cada proyecto |
| Tokens totales y de salida | transcripciones de Claude Code de cada sesión |
| Sesiones e intervenciones | `nomos metricas` en B; 1 sesión en A; intervenciones anotadas a mano |
| Fallos de acabado | `revisar_acabado.py <proyecto>` en los dos |
| El `.exe` arranca y aguanta 60 s | `captura_empaquetado.ps1` en los dos |
| Tests que pasan | automatización de Unreal en los dos |

Calidad, por un juez que no sabe cuál es cuál (0 no está · 1 mal · 2 bien · 3 muy bien):

| # | Criterio |
|---|---|
| 1 | Se puede jugar de menú a final con el `.exe` |
| 2 | La mecánica se siente: carga, lanzamiento, pausa de impacto y sacudida |
| 3 | Se lee a 1280×720: se distinguen la brasa, las sombras y los faroles |
| 4 | Arco visual: el patio del final se ve claramente distinto del principio |
| 5 | Estela y chispas |
| 6 | Sonido en los cuatro momentos |
| 7 | HUD y menú: tipografía propia, nítida y con tildes |
| 8 | Nada por defecto del motor: sin material de cuadros, sin fuente de depuración, sin cubos estirados |
| 9 | Pantalla de carga y pantalla de final con reinicio |
| 10 | Robustez: el modo demo gana, el test pasa y no hay caída en 60 s |

El juez recibe de cada juego las mismas cinco capturas del `.exe` en modo demo (segundos 0, 3, 15, 30 y 55), etiquetadas
X e Y al azar, y esta tabla. El criterio 6 lo puntúa quien dirige el experimento con el `.exe`, porque las capturas no suenan.

## Qué cuenta como «gran diferencia»

- B saca al menos 24 de 30 y al menos 8 puntos más que A.
- B termina en el mismo tiempo o menos que A, con 0 intervenciones.
- B tiene 0 fallos de acabado.

Si no se cumple, no se maquilla: la diferencia que falte es un hallazgo sobre Nomos. Se arregla en Nomos una sola vez
(tope 90 min), se repite solo B y el informe enseña las dos pasadas de B.

## Entregables

- `docs/demo/comparativa.md`: tablas, comandos, capturas y conclusión en diez líneas.
- `Escritorio/Candela-demo/`: vídeo de cada rama (60 s del `.exe` en modo demo), vídeo lado a lado, las diez capturas
  y una copia de la comparativa.
- Acceso directo en el Escritorio a `Candela.exe` de la rama B.
