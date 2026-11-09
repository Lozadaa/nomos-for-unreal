---
name: ue-oficio
description: 'Oficio de Unreal Engine 5.8 (con las diferencias del 5.9 MegaJam Preview) para un worker sin GUI: trampas de la API de Python, escala e importación de mallas, cámara y pawn, luz y exposición, PCG, diagnóstico de crashes y cómo leer el JSON de escena que acompaña cada captura. Triggers: "nomos ue py", "importar malla", "cámara", "pawn", "exposición", "niebla", "PCG", "crash de Unreal", cualquier tarea de Nomos que toque Content/ o el editor. No usar para UI (ue-umg-ui) ni para aprobar capturas de UI (ue-visual-qa).'
license: MIT
metadata:
  version: 0.1.0
---

# Oficio de Unreal 5.8

Lo que un agente tarda horas en redescubrir en Unreal 5.8. Lee la referencia del tema antes de escribir el script, no
después de que falle. Marcas: **[probado]** se vio pasar en UE 5.8 (en Nomos o en el harness de origen); **[fuente]**
leído del código del motor o de la documentación; **[plan]** receta publicada sin prueba propia.

Origen: lecciones publicadas en `per-simmons/unreal-agent-harness` (jun 2026, macOS, MCP de Epic), reescritas y
filtradas para Windows y para cómo trabaja Nomos (editor caliente por archivos, `-game` para capturas). Lo probado en
Nomos lo dice expresamente.

Si el proyecto usa el **5.9 MegaJam Preview** (`EngineAssociation` 5.9, inestable según Epic, solo en copia del juego), lee
antes [ue59-preview](references/ue59-preview.md): lo probado aquí es de 5.8.3 y lo que 5.9 cambia o deja sin confirmar
está allí con su fuente.

## Las diez que más tiempo ahorran

1. **Mide antes de colocar.** Tras importar o generar una malla, lee sus límites: un ×100 (cm frente a m) o un ×10
   (glTF/IA) es el error más común y da «se ve la sombra pero no el objeto». [probado] → [importar](references/importar.md)
2. **Subsistemas, no librerías viejas.** `unreal.get_editor_subsystem(unreal.EditorActorSubsystem)` y compañía;
   `EditorLevelLibrary` está en desuso. [fuente] → [python-ue58](references/python-ue58.md)
3. **`unreal.Rotator(roll, pitch, yaw)`.** Por posición el orden es ese; pásalos con nombre. [fuente]
4. **Un set parcial pisa lo que no mandas.** Mover sin escala la deja en 1; un Rotator sin roll lo pone a 0. Lee el
   transform actual y escribe el completo. [probado]
5. **`set_editor_property` no siempre basta.** Si la propiedad tiene setter o recalcula algo, llama a la función
   (p. ej. `set_static_mesh`, `set_asset` de Niagara). [probado]
6. **Una sola cámara activa por pawn**, con la lente fuera de los límites de su malla y offsets relativos al pawn.
   [fuente] → [camara-pawn](references/camara-pawn.md)
7. **Exposición manual antes de juzgar una captura** (PPV sin límites, `AEM_Manual`, el bias como único dial). Un bias
   de 10 quema la imagen a blanco. [probado] → [iluminacion](references/iluminacion.md)
8. **Magenta o lavado en el primer arranque = shaders compilando**, no arte roto. Repite la captura. [probado]
9. **PCG de uno en uno** y cuenta instancias al acabar: «sin errores» con 0 instancias es el fallo silencioso
   habitual. [probado] → [pcg](references/pcg.md)
10. **Si Unreal cae, lee el informe del crash antes de relanzar**, y que no quede ningún `CrashReportClient` del
    worktree vivo. [probado] → [diagnostico](references/diagnostico.md)

## Escena junto a cada captura

Cada captura de `-game` que hace Nomos (comprobación `map`, vistas extra) deja `<captura>.png.json`: cámara (posición
en cm, rotación pitch/yaw/roll, FOV), tamaño de la imagen, pawn y hasta 40 actores visibles con `pos`, `tam` (límites en
cm), `base_z` (altura de la base), `dist` a la cámara y `px` (píxel en la imagen). [probado en Nomos, UE 5.8.3]

Úsalo para afirmar con números lo que en la imagen solo se intuye:
- Flota: `base_z` del objeto por encima de la `base_z + tam[2]` del suelo que tiene debajo.
- Escala: `tam` fuera de lo que pide la spec (un árbol de 4000 cm, una taza de 2 cm).
- Encuadre: el actor que importa no aparece en la lista o su `px` cae en un borde.

## Referencias

- [python-ue58](references/python-ue58.md): firmas, subsistemas, importación, lo que no existe en 5.8.
- [importar](references/importar.md): Blender → UE, escala, pivote, materiales, texturas, decals.
- [camara-pawn](references/camara-pawn.md): cámara, SpringArm, posesión, PlayerStart, input.
- [iluminacion](references/iluminacion.md): exposición, sol, cielo, niebla, postproceso para capturas.
- [pcg](references/pcg.md): grafos PCG desde un agente, gramática de edificios, trampas.
- [diagnostico](references/diagnostico.md): crashes, procesos huérfanos, flags de arranque, PIE.
- [ue59-preview](references/ue59-preview.md): qué cambia en el 5.9 MegaJam Preview (Python, MCP, PCG), qué queda sin confirmar, fuentes.
