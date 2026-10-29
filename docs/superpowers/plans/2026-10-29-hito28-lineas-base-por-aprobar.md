# Hito 28 · Líneas base visuales por aprobar

> **For agentic workers:** worktree `C:/Users/richa/orca/workspaces/kratos/hito28-lineas-base` de `C:/Users/richa/Documents/nomos` (rama `hito28-lineas-base` desde `main`, que ya incluye los hitos 26, 30, 29 y 27). Ponytail full: el diff más corto que funciona, sin dependencias nuevas. Lee solo lo que vayas a tocar. No toques los servicios de los puertos 8780 y 8781. Pruebas con `npm test`, `npm run test:panel`, `npm run build`. Un commit por tarea. No fusiones en main. No hagas push.

**Por qué:** en Block Kings, 9 de las 16 comprobaciones fallidas fueron líneas base visuales equivocadas: la primera captura se convierte en referencia sin que nadie la mire y luego bloquea tareas correctas con vueltas de corrección.

**Goal:** una captura nueva entra como propuesta y solo juzga cuando el usuario la aprueba desde «Por aprobar». Hasta entonces las comprobaciones visuales informan sin fallar.

**Hechos comprobados (no los investigues de nuevo):**
- `service/src/checks/visual.ts` `compareBaseline`: sin línea base la crea y devuelve `skipped`; `visual: cambia` con revisión aprobada la sustituye (`baseline.replaced`, `references/maquina.md:47`). Rutas `docs/baseline/<check>-<mapa>-<captura>.png` (`references/evidencia.md`).
- Aprobaciones del hito 22: `nomos approval request|comment|approve|list`, eventos `approval.*`, tarjeta «Por aprobar» en el panel con imagen o vídeo.

---

## Tarea 1 · Propuesta en vez de línea base

**Archivos:** `visual.ts`, donde se emite `baseline.replaced`, `evidencia.md`, `maquina.md`.

- Una captura sin línea base aprobada se guarda como `docs/baseline/propuestas/<nombre>.png` y abre una aprobación «Línea base: <check> <mapa> <captura>» con la imagen. El resultado es `skipped` con resumen «Sin línea base aprobada; propuesta enviada». Al aprobar, se mueve a `docs/baseline/<nombre>.png` y pasa a juzgar. Rechazar la borra; la siguiente captura propone otra vez.
- `visual: cambia` con revisión aprobada ya no sustituye la línea base directamente: propone la nueva con el diff al lado y espera aprobación; mientras, no falla.
- Las líneas base existentes en `docs/baseline/` se consideran aprobadas (nada que migrar).

Acepta: pruebas de los tres caminos (sin base → propuesta; aprobada → juzga; `cambia` → propuesta con diff); e2e del panel con la tarjeta de línea base a 1366×768 en `docs/capturas-28/`.

## Tarea 2 · Panel y CLI

- La tarjeta «Por aprobar» de una línea base muestra la propuesta y, si existe, la actual y el diff, con «Aprobar» y «Rechazar». `nomos approval list` las distingue con el tipo `baseline`.

Acepta: prueba del componente y aceptación en KratosFabTest con `--data .nomos-hito28` y `NOMOS_MEMORY=off`: una comprobación `map` sin línea base deja la propuesta y la tarjeta; aprobar la convierte en base; `docs/aceptacion-hito28.md` ≤ 50 líneas.

## Cierre

Informe final en ≤ 20 líneas: tabla con tarea, commit, pruebas y capturas; lo que no se probó.
