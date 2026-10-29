# Hito 23 · Legible y con grafo

> **For agentic workers:** trabajas en un worktree de `C:/Users/richa/Documents/nomos` (rama `hito23-legible` desde `main`). Ponytail full: el diff más corto que funciona, sin dependencias nuevas, sin abstracciones. Lee solo lo que vayas a tocar (grep y rangos de `sed`, nunca archivos enteros grandes). No toques el servicio de Block Kings (puerto 8781) ni el del 8780. Pruebas con `npm test`, `npm run test:panel` y `npm run build`. Un commit por tarea. No fusiones en main: el orquestador revisa y fusiona.

**Petición del usuario (literal, 2026-10-29):** «en las descripciones de kratos solemos escupir mucha info que nadie lee, formatea bien en kratos los markdowns en todas las secciones … muestra la información mas visual y no des tantisimo detalle que en general somos mas visuales de comportamiento y de funcionalidad no tanto de código y tecnisismos por que eso te lo damos a ti, eres el dueño» y «Necesitamos tener configurado ponytail skill y graphify para TODOS los proyectos que hagamos con kratos».

**Goal:** todo texto que el panel enseña (specs, resúmenes de entrega, hallazgos de revisión, correcciones, Decisiones, Por aprobar, diario) cabe en una pantalla, habla de comportamiento y de lo que se ve, y pliega lo técnico. Cada juego dirigido por Nomos tiene su grafo de graphify al arrancar y los workers lo consultan antes de explorar; ponytail queda comprobado por `doctor`.

**Hechos comprobados (no los vuelvas a investigar):**
- Ponytail es un plugin de Claude Code activado en `~/.claude/settings.json` (`"ponytail@ponytail": true`) y su hook de SessionStart ya se dispara en los workers lanzados por Nomos (comprobado en transcripciones de workers de Block Kings). Falta solo que `doctor` lo compruebe y que el brief lo nombre.
- graphify está instalado como CLI en `C:/Users/richa/.local/bin/graphify` y como skill en `~/.claude/skills/graphify/SKILL.md` (comandos: `graphify <path> --no-viz`, `--update`, `graphify query "<pregunta>"`). Ningún proyecto tiene `graphify-out/`.
- El panel renderiza markdown en `panel/src/lib/markdown.tsx` (negrita, cursiva, código en línea, listas, tablas simples, enlaces a `/tareas/<id>`). Lo usan `TaskSheet.tsx`, `ChatParts.tsx`, `DecisionOptions.tsx`, `ApprovalCard.tsx`, `EntregasInformes.tsx`.
- Los briefs están en `skills/nomos/references/brief-worker.md`, `brief-revisor.md`, `brief-qa-visual.md`; la spec de tarea la escribe el director según `skills/nomos/SKILL.md` (sección «Petición de trabajo») con cinco encabezados; el diario según el plan del juego.
- Las skills por área se asignan en `service/src/skills.ts`; `nomos skills install` copia skills al juego desde `service/src/skills-install.ts`; `doctor` está en la CLI (`skills/nomos/scripts/nomos.ts`).

---

## Tarea 1 · Lo que escriben director y workers es corto y habla de comportamiento

**Archivos:** `skills/nomos/SKILL.md`, `skills/nomos/references/brief-worker.md`, `brief-revisor.md`, `brief-qa-visual.md`, `ciclo-tarea.md` (ejemplo de spec), y las pruebas de la skill en `skills/nomos/evals` si comprueban el formato.

Reglas a incorporar (texto normativo breve, con un ejemplo cada una):

| Texto | Regla |
|---|---|
| Spec de tarea | Las cinco secciones siguen. `## Qué` ≤ 2 frases de lo que el jugador o el usuario verá. `## Criterios de aceptación` ≤ 7 líneas, cada una comprobable y empieza por lo observable («El rival cae al suelo en < 0,5 s»). Rutas y nombres de clases solo en `## Alcance` y `## No tocar`. |
| `summary` de NOMOS_DONE | ≤ 280 caracteres, qué cambió para quien juega o mira. `focus` obligatorio si cambia algo visible: 2-4 frases de qué mirar. Lo técnico (commits, pruebas, cifras) va en `tests` y `commits`, no en el texto. |
| Hallazgos del revisor | Cada `note` ≤ 140 caracteres: qué falla y qué se esperaba, en términos de comportamiento. `file`/`line` llevan lo técnico. |
| Correcciones | Un archivo por corrección con tres líneas: **Qué se ve mal**, **Qué debería verse**, **Dónde** (rutas). |
| Decisiones | `reason` ≤ 1 frase, opciones con etiqueta de ≤ 5 palabras; la evidencia va en `evidence`, nunca en la pregunta. |
| Diario del juego | Una línea por evento, ≤ 160 caracteres, estado y no narración («J1.6 cerrada; build en Build/Windows-actual»). El detalle va a `.nomos/logs` o a la evidencia de la tarea. |

Acepta: los briefs y SKILL.md incorporan las reglas con un ejemplo cada una; las evals o pruebas existentes de la skill siguen en verde; `docs/` de Nomos documenta las reglas en una tabla de ≤ 12 filas (sin párrafos).

## Tarea 2 · El panel enseña poco y pliega lo técnico

**Archivos:** `panel/src/lib/markdown.tsx` y su test, `panel/src/views/TaskSheet.tsx`, `ChatParts.tsx`, `DecisionOptions.tsx`, `ApprovalCard.tsx`, `EntregasInformes.tsx`, e2e en `panel/e2e`.

- `markdown.tsx` admite además `## encabezado` (título de sección pequeño), `- [ ]`/`- [x]` (icono de check) y bloques ``` (plegados por defecto bajo «Detalle técnico», con el número de líneas).
- La spec en `TaskSheet` se muestra por secciones: `Qué` y `Criterios de aceptación` abiertos; `Por qué`, `Alcance` y `No tocar` plegados con el recuento de líneas.
- Cualquier texto largo (resumen, hallazgo, Decisión, mensaje del chat) se recorta a 6 líneas con «Mostrar todo»; los uuids y las rutas largas se siguen sustituyendo por el título o el nombre del archivo.
- Los hallazgos del revisor salen como filas con chip de severidad, la nota y, en tooltip, archivo y línea.
- Nada de esto añade dependencias ni cambia el contrato del servicio.

Acepta: pruebas del panel y de la raíz en verde; e2e nueva con una spec larga (las cinco secciones, criterios de 12 líneas y un bloque de código) y capturas en `docs/capturas-23/` a 1366×768 y 1920×1080 donde la ficha cabe sin desplazamiento vertical en la primera pantalla y lo técnico está plegado.

## Tarea 3 · graphify y ponytail en cada juego

**Archivos:** `skills/nomos/scripts/nomos.ts` (`doctor`, `start`), `service/src/` donde corran los pasos de arranque e integración, `brief-worker.md`, `brief-revisor.md`, `references/maquina.md` o una referencia nueva de ≤ 40 líneas, pruebas en `tests/`.

- `doctor` lista «graphify» (CLI en PATH o `~/.local/bin/graphify`) y «ponytail» (clave `ponytail@ponytail` en `~/.claude/settings.json` → `enabledPlugins`); imprescindible graphify, aviso ponytail.
- `nomos start`: si el juego no tiene `graphify-out/`, lanza `graphify <juego> --no-viz` en segundo plano sobre `Source/`, `Config/`, `docs/` y `Content/**/*.{json,ini,md}` (nunca binarios `.uasset`/`.umap`); añade `graphify-out/` al `.gitignore` del juego junto a `.nomos/`. Tras cada integración en main, `graphify <juego> --update --no-viz` encolado como comando del servicio (reutiliza la cola `commands`; no abre otro proceso si hay uno en marcha).
- Brief de worker y revisor: primera orden de exploración «`graphify query "<tu pregunta>"` antes de leer archivos; ponytail full está activo: el diff más corto que funciona». Si `graphify-out/` no existe aún, el brief lo dice y el worker sigue sin él.
- Config: `graphify: {enabled: true}` en `config.json` con `false` para apagarlo.

Acepta: pruebas `node:test` de `doctor` (con y sin graphify en PATH) y del arranque (crea `graphify-out/` con un fake del binario, respeta `enabled:false`, no duplica el proceso); aceptación real en `C:\Users\richa\Documents\Unreal Projects\KratosFabTest` con `--data .nomos-hito23` y puerto libre: `doctor` lista las dos filas, `start` deja `graphify-out/` y `graphify query "qué hace el personaje"` responde. Documento `docs/aceptacion-hito23.md` en formato tabla, ≤ 60 líneas.

## Cierre

Informe final al orquestador en ≤ 20 líneas: tabla con tarea, commit, pruebas y capturas; una línea con lo que no se probó. Sin narrar el proceso.
