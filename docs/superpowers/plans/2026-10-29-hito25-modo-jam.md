# Hito 25 · Modo jam

> **For agentic workers:** worktree de `C:/Users/richa/Documents/nomos` (rama `hito25-modo-jam` desde `main`, que ya incluye los hitos 23 y 24). Ponytail full: el diff más corto que funciona, sin dependencias nuevas. Lee solo lo que vayas a tocar con grep y rangos de `sed`. No toques los servicios de los puertos 8780 y 8781. Pruebas con `npm test`, `npm run test:panel`, `npm run build`. Un commit por tarea. No fusiones en main.

**Por qué:** en Block Kings el 44 % del trabajo fue fuera del plan porque J1 se cerró sin que nadie lo jugara, el plan tenía 30 tareas para un juego completo y las lecciones quedaron en archivos del repo que caducan con el proyecto (Second Brain recibió 446 registros de sesión y 0 notas de conocimiento). La game jam necesita lo contrario: alcance mínimo, algo jugable cada día aprobado por el usuario, y que lo aprendido quede en la memoria compartida.

**Goal:** `nomos jam` deja un juego nuevo con plan de jam, cierre de hito que exige aprobación del usuario sobre una build jugable, y una nota de aprendizaje en Second Brain al cerrar cada hito.

**Hechos comprobados (no los investigues de nuevo):**
- «Por aprobar» existe desde el hito 22: `nomos approval request|comment|approve|list`, eventos `approval.*`, guarda `approval_pending` en `task integrate`.
- Second Brain se escribe desde la CLI con `"C:/Python314/python.exe" -X utf8 "C:/Users/richa/Documents/SecondBrain/.system/brain.py" --cwd "<juego>" capture --title "<título>" --source "<fuente>" --kind learning --evidence observed --body-file <archivo>`; devuelve la ruta de la nota. Solo stdlib, sin red. Si falla, no debe bloquear el cierre.
- Las specs del director llevan cinco encabezados fijos; la plantilla está en `skills/nomos/references/ciclo-tarea.md`.
- El plan de Block Kings (`docs/plan.md` del juego) es el contraejemplo: 7 hitos, 30 tareas.

---

## Tarea 1 · `nomos jam init` y plan de jam

**Archivos:** CLI, `skills/nomos/SKILL.md`, `skills/nomos/references/jam.md` (nuevo, ≤ 60 líneas).

- `nomos jam init --data .nomos --tema "<tema>" --dias <n>` escribe `docs/plan-jam.md` en el juego con esta estructura fija y nada más: **Idea en una frase**, **Una mecánica**, **Una arena**, **Qué se ve el día 1 / mitad / último día** (tres filas), **Recortes si falta tiempo** (lista de 5), **Hitos** = uno por día con una tarea de cierre jugable cada uno. Marca `config.json` con `jam: {enabled: true, days: n, start: <fecha>}`.
- SKILL.md: con `jam.enabled`, el director crea como máximo las tareas del día en curso y la de cierre; ninguna tarea nueva fuera del plan de jam sin una Decisión del usuario que la acepte.

Acepta: prueba `node:test` de `jam init` (archivo y config) y de que un segundo `init` no sobrescribe sin `--force`.

## Tarea 2 · Cierre con build jugable aprobada

**Archivos:** servicio (cierre de tareas marcadas como cierre de hito), CLI, panel (tarjeta de aprobación ya existente).

- Una tarea con `role: cierre` o título que empieza por «Cierre» no pasa a `done` si no existe una aprobación del usuario (`approval.approved`) posterior a su último commit y con build estampada (`nomos build stamp`). Hasta entonces, `task.closing_blocked` con motivo «Falta tu aprobación sobre la build jugable» y el panel lo enseña en «Por aprobar» con el vídeo o la captura.
- Con `jam.enabled`, además, cada hito que lleve más de 24 h sin aprobación abre una Decisión «Hoy no hay build jugable aprobada» con las opciones «Recortar» (señala la lista de recortes del plan) y «Seguir».

Acepta: pruebas del servicio para las dos reglas; e2e del panel con la tarjeta bloqueada y captura a 1366×768 en `docs/capturas-25/`.

## Tarea 3 · Lecciones a Second Brain al cerrar cada hito

**Archivos:** servicio (`finalize.run` de las tareas de cierre), `skills/nomos/references/cierre.md`, `brief-worker.md`.

- El informe de cierre de hito (`docs/produccion/J<n>.md` o equivalente) termina con una sección `## Lecciones` de 1 a 5 líneas, cada una reutilizable en otro juego (qué falló, qué funcionó, qué regla sale). El brief del worker de cierre lo exige; sin esa sección, el cierre devuelve `closing_blocked` «Faltan las lecciones».
- Al pasar la tarea de cierre a `done`, el servicio llama a `brain.py capture` con `kind learning`, `evidence observed`, título «<Juego> · <hito>: lecciones», fuente con la ruta del informe y el commit, y el cuerpo con las líneas. La ruta devuelta se guarda como artefacto de la tarea («Memoria guardada») y se emite `memory.saved`. Si la llamada falla, `command.failed` con la causa y la tarea cierra igual.
- Configurable con `memory: {enabled: true, command: [...]}` en `config.json`, con el comando de arriba por defecto.

Acepta: prueba con un fake de `brain.py` que comprueba los argumentos y el artefacto; prueba del bloqueo sin sección; aceptación real en KratosFabTest con `--data .nomos-hito25`: cerrar una tarea de cierre con lecciones y ver la nota en `C:/Users/richa/Documents/SecondBrain/profiles/personal/knowledge/` (borrarla después con su ruta); `docs/aceptacion-hito25.md` en tabla, ≤ 60 líneas.

## Cierre

Informe final en ≤ 20 líneas: tabla con tarea, commit, pruebas y capturas; una línea con lo que no se probó.
