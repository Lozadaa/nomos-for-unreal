# Trompo · con Nomos y sin Nomos (2026-11-10)

Encargo, rúbrica y umbral: `segundo-juego.md`, sin tocar. Unreal 5.9 MegaJam Preview, este PC, una rama cada vez.
Notas: `trompo-notas-A.md`, `trompo-notas-B.md`. Métricas de Nomos: `metricas-trompo-B.json`.

## Conclusión en diez líneas

1. **El umbral no se cumple, pero la diferencia se dio la vuelta.** B (Nomos) saca **23,5/30** y A (agente solo) **18/30**. Con
   Candela fue al revés: A 22, B 14.
2. Faltan 0,5 puntos para el 24 y 2,5 para la ventaja de 8 sobre A.
3. B gana en tiempo (30 min 54 s frente a 39 min 49 s), en acabado (0 fallos frente a 3) y en 6 de los 9 criterios del juez.
4. A gana en dos criterios: la mecánica se entiende algo mejor (barra de fuerza y avisos) y los trompos son más grandes y más trompos.
5. B hizo lo que pedía el encargo casi entero, pero con la cámara desde arriba (55°, la de la semilla), no «de cerca y de lado».
   A sí la puso baja y de lado.
6. El modo demo de B gana entre los 10 y los 20 s, no «en unos 60»; el de A, a los ~63 s, así que en la captura de los 58 s aún no ha
   ganado y los dos jueces le quitaron puntos por eso (criterios 1, 9 y 10).
7. Fallos de imagen: B tiene 1, en el segundo 0: la pantalla de carga de la semilla (fondo oscuro y un punto) no tiene
   nada que brille. A tiene 1, en el segundo 0: arranca en negro.
8. Las dos ramas tuvieron 0 intervenciones.
9. En modo rápido no corrió el lote de comprobaciones (ni `imagen` ni `acabado`): ningún criterio empezaba por `check:`. Lo
   que miró la imagen fue el worker, que sacó las tres capturas y escribió las líneas `VISTO`.
10. Nomos ya saca un juego mejor y más rápido que un buen agente solo, sin intervenciones, pero no con la ventaja de 8 puntos.

## Cómo se lanzó cada rama

| | A · sin Nomos | B · con Nomos |
|---|---|---|
| Proyecto | `Unreal Projects/TrompoSolo`: `TP_Blank` de UE 5.9 renombrado (el primer commit de `CandelaSolo`), compila en 96 s antes de empezar | `Unreal Projects/Trompo`: `nomos nuevo Trompo` desde `jam-vista` (= `main` cc424c2) |
| Quién | Subagente de Claude Code (`general-purpose`, `model: opus`) con el encargo y 4 reglas (sin skills ni subagentes, sin leer Nomos ni otros proyectos, terminar y cerrar, vigilar lo que lance en segundo plano). **No es `claude -p`**: el clasificador de permisos lo bloqueó otra vez («Create Unsafe Agents») | Nomos en modo rápido, director por evento; worker Opus y revisor Sonnet como procesos `claude` |
| Orden | Segunda | Primera |

## Medidas objetivas

| Medida | A | B | De dónde |
|---|---|---|---|
| Reloj de inicio a FIN | 39 min 49 s (15:45:19 → 16:25:08) | **30 min 54 s** (14:28:50 → 14:59:44) | `docs/tiempos.jsonl` |
| Primer `.exe` | ~38 min (16:23Z) | ~29 min (14:58Z) | fecha del `.exe` |
| Tiempo muerto del arnés | 0 | — | notas |
| Sesiones | 1 | al menos 3 (director, 1 worker, 1 revisor) | `metricas-trompo-B.json`, notas |
| Tokens | 246 k (cifra del subagente, no comparable) | 8,89 M de entrada con caché (director 0,36 M) | `nomos status`, informe del subagente |
| Intervenciones | 0 | 0 | notas |
| Fallos de acabado | 3 (HUD con Canvas ×2, sin pantalla de carga) y 1 aviso (fuente del motor) | **0** | `revisar_acabado.py` |
| Fallos de imagen (7 capturas, sin JSON) | 1 (segundo 0: negro) | 1 (segundo 0: la carga no tiene nada que brille) | `revisar_imagen.py` |
| El `.exe` aguanta 60 s | sí | sí | vídeo de 62 s |
| Test de reglas | pasa (informe del agente) | pasa (informe del worker) | automatización de Unreal |
| Código | 1690 líneas añadidas en `Source/` | 986 añadidas sobre la semilla | `git diff --stat` |

## Juicio a ciegas (dos jueces Sonnet, sorteos independientes)

Cada juez vio siete capturas de cada `.exe` en modo demo (0, 3, 10, 20, 30, 45 y 58 s, sacadas del vídeo a 1280×720).
Clave revelada después: en los dos sorteos salió X = B, Y = A. El criterio 6 lo puntúo yo leyendo el código de sonido.

| # | Criterio | A (J1/J2) | B (J1/J2) | A | B | Motivo (resumido) |
|---|---|---|---|---|---|---|
| 1 | De menú a final | 1/1 | 2/2 | 1 | 2 | A: menú, pero sin final en 58 s. B: final visible, pero el menú no sale en ninguna captura |
| 2 | La mecánica se entiende | 2/3 | 2/2 | 2,5 | 2 | A: barra de fuerza, anillo y avisos. B: mira y arco, sin fuerza visible |
| 3 | Se lee a 1280×720 | 2/2 | 3/3 | 2 | 3 | B: ruedo entero con borde de piedras. A: borde tierra sobre tierra, rivales lejos |
| 4 | Parecen trompos | 3/3 | 2/2 | 3 | 2 | A: grandes, cúpula, franjas y punta. B: franjas y colores, pero pequeños |
| 5 | Chispas, polvo y surco | 1/2 | 2/3 | 1,5 | 2,5 | B: surcos marcados y polvo. A: surcos finos |
| 6 | Sonido (yo) | 2 | 2 | 2 | 2 | Los dos sintetizan zumbido que baja de tono y golpe de madera; ninguno tiene un sonido propio de final. No lo he oído |
| 7 | HUD y menú | 2/2 | 3/3 | 2 | 3 | B: fuente propia, tildes y paneles con forma. A: paneles rectangulares |
| 8 | Nada por defecto | 2/2 | 2/2 | 2 | 2 | B: fondo liso. A: cielo y terreno vacíos |
| 9 | Carga y final con reinicio | 1/1 | 2/2 | 1 | 2 | B: carga mínima y final con R. A: arranca en negro, sin final visible |
| 10 | Robustez | 1/1 | 3/3 | 1 | 3 | B gana y aguanta. A a los 58 s va 4/5 (gana a los ~63 s, fuera de las capturas) |
| | **Total** | | | **18** | **23,5** | Sin discrepancias de 2 puntos entre jueces |

Umbral de `segundo-juego.md`: B ≥ 24 y ≥ A + 8; mismo tiempo o menos que A; 0 intervenciones; 0 fallos de acabado y de imagen.
**Se cumple:** tiempo, intervenciones y acabado. **No se cumple:** la nota (23,5), la ventaja (+5,5) y los fallos de imagen (1).

## Causas de lo que faltó (de specs, commits y capturas)

1. **Cámara de la semilla.** El worker usó `EncuadrarEscena` con la inclinación por defecto (55°) y no la bajó a «de lado»,
   aunque el encargo lo pedía. La spec del director sí lo copiaba en `## Qué`; ningún criterio lo pedía con esas palabras.
2. **Demo demasiado corta.** B gana entre los 10 y los 20 s y deja la victoria 40 s «para la captura de los 45 s»: optimizó las tres
   capturas de `-Demo` (3, 20 y 45 s) en vez del «gana en unos 60 segundos» del encargo. En contra, los jueces no vieron el menú.
3. **Pantalla de carga de la semilla.** Un punto naranja de 28 px sobre fondo oscuro no pasa «algo brilla» de
   `revisar_imagen.py`: la semilla falla su propia medida en el segundo 0.
4. **El lote no corrió.** En modo rápido, sin criterios `check:`, la tarea va de revisión a integración sin `imagen` ni
   `acabado` (aun así salió con 0 fallos de acabado).
5. **Trompos pequeños.** Con todo el ruedo en cuadro desde arriba, los trompos miden ~40 px: se leen, pero un juez echó
   en falta la punta y el detalle que A sí enseña de cerca.

## Candela y Trompo

| Juego | A (sin Nomos) | B (con Nomos) | Reloj A | Reloj B | Intervenciones A / B | Acabado A / B |
|---|---|---|---|---|---|---|
| Candela (B2) | 22 | 14 | 63 min (≈23 sin el atasco) | 39 min | 1 / 2 | 4 / 0 |
| Trompo | 18 | **23,5** | 39 min 49 s | **30 min 54 s** | 0 / 0 | 3 / **0** |

Nomos se cambió después de ver Candela (fases 1-3 de `jam-vista`); Trompo es un encargo que ninguna rama había visto.
Límites: una pasada por rama, dos jueces que solo ven siete capturas, sonido sin oír, nadie lo ha jugado con ratón.

## Archivos

- `Escritorio/Trompo-demo/`: `Trompo-A.mp4`, `Trompo-B.mp4`, `Trompo-lado-a-lado.mp4` (A a la izquierda), las catorce capturas
  y esta comparativa.
- `Escritorio/Trompo (con Nomos).lnk` → `Unreal Projects/Trompo/Empaquetado/Windows/Trompo.exe`.

## 30 min más con Nomos (B v2)

Encargo del usuario tras ver las dos ramas: «te doy 30min mas de desarrollo con nomos para que lo completes y mejores
que sea el loop completo mejorado», con la lista de mejoras del coordinador por `POST /messages`. Sin jueces esta vez: el
juicio es mío, mirando las siete capturas nuevas (`Escritorio/Trompo-demo/Trompo-B-v2-*.png`).

| | B v2 |
|---|---|
| Tiempo | `inicio-2` 17:49:23 → `FIN-2` 18:11:13: **21 min 50 s**. Cerrado e integrado 18:27 (15 min de aprobación automática) |
| Tareas del director | 1 («Trompo: bucle completo redondo», 8 criterios con las frases del mensaje) |
| Intervenciones | 0 |
| Fallos de acabado | 0 |
| Fallos de imagen (7 capturas del `.exe`) | 1: el segundo 0 sale **negro** (antes enseñaba la pantalla de carga) |

Qué mejoró, mirando las capturas: la cámara está baja y de lado, junto al ruedo, y tu trompo se ve grande, torneado, a
franjas y con punta de metal. Hay tres lanzamientos en la partida demo (3 → 2 → 0) y gana en el último, con chispas, hacia
los 45 s. Los rivales que salen quedan tumbados fuera del borde de piedras. El panel de «¡Ganaste!» va arriba y no tapa el
ruedo. Los surcos son marcados y la mira enseña dónde cae con un arco de vuelo.

Qué no: el arranque vuelve a ser negro en el segundo 0, y el menú no aparece en ninguna captura (la demo lo salta enseguida).
El fondo detrás del ruedo es una franja gris plana. La fuerza no se ve en ninguna captura, el brillo de barniz apenas se
nota y el «cuello» de los trompos no se distingue. Tampoco se ve el momento de celebración antes del panel: a los 45 s aún
no hay panel y a los 58 s ya está. No lo ha jugado nadie con ratón ni se ha oído.

Archivos: `Trompo-B-v2.mp4`, `Trompo-B-v2-{0,3,10,20,30,45,58}.png`, `Trompo-antes-despues.mp4` (B de antes a la
izquierda, B v2 a la derecha). El acceso directo `Escritorio/Trompo (con Nomos).lnk` sigue apuntando a
`Unreal Projects/Trompo/Empaquetado/Windows/Trompo.exe`, que ahora es el v2.
