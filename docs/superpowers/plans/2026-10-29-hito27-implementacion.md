# Hito 27 · Director por evento: plan de implementación

> **For agentic workers:** ejecución nativa (superpowers:executing-plans) por el worker del hito; un commit por tarea.

**Goal:** `director.mode: "evento"` lanza sesiones cortas de director por evento, con brief ≤ 60 líneas y coste como run.
**Architecture:** `service/src/director.ts` concentra brief, tick de cola y handlers `director.wake`/`director.poll`; reutiliza
`orca.terminalCreate` (Orca o proceso), `startRun/finishRun`, `run.tokens` y el runner.
**Tech Stack:** Node ≥ 25 (node:sqlite, node:test), React + vitest en el panel.
**Spec:** `docs/superpowers/specs/2026-10-29-hito27-director-por-evento-design.md`

## Global Constraints
- Ponytail full, sin dependencias nuevas. Brief ≤ 60 líneas; `brief-director.md` ≤ 40; «Modo evento» de SKILL.md ≤ 10.
- `director: {mode: "sesion"|"evento", debounceSeconds: 60}`; por defecto `sesion`; jam → `evento`. Plazo 20 min.

## Review Focus
- Eventos que provoca el propio director (su `run.finished`, sus `command.*`) no lo vuelven a despertar → prueba en T2.
- Reinicio del servicio con director en marcha: `recoverDeadRuns` la cierra (sin tarea, no relanza) → cubierto por código existente.
- Run de director en `GET /runs/:id` (panel) no da 500 → prueba en T2.
- Prompt con comillas en el terminal de proceso → el brief va a archivo; el prompt no lleva comillas.
- Director no ocupa cupo de workers Claude → prueba en T2.

### Task 1: Brief del director
**Files:** Create `service/src/director.ts`, `skills/nomos/references/brief-director.md`, `tests/service/director-brief.test.ts`;
Modify `service/src/cli.ts` (orden `brief director`), `service/src/migrations.ts` + `db.ts` (columna `director.wake_seq`).
**Produces:** `wakeTypes: string[]`, `pendingWake(db): EventRow[]`, `renderDirectorBrief(db, dataDir): string`.
- [ ] Prueba: base con equipo (peer), jam, 20 tareas, Decisión, aprobación, mensaje sin responder y 30 eventos → contiene «Equipo»
  primero, «Día », el mensaje con su id, ≤ 10 eventos, 3 acciones con `nomos`; `split('\n').length <= 60`. Sin equipo no hay «Equipo».
- [ ] Implementar; CLI imprime; commit «Hito 27 T1: …».

### Task 2: Lanzamiento por evento
**Files:** Modify `director.ts` (`directorTick(ctx)`, `directorWake`, `directorPoll`), `config.ts` (validar `director`, rol `director` en
modelos), `runner.ts` (tick), `handlers/worker.ts` (registrar), `repo/runs.ts` (sin `requireTask` para rol director),
`scheduler-state.ts` (sin cupo), `routes/runs.ts`, `transcript.ts`, `adapters/process-terminal.ts` (terminal en la raíz con `process`),
SKILL.md, `panel/src/views/Produccion.tsx`; Test `tests/service/director-wake.test.ts`, `docs/aceptacion-hito27.md`.
- [ ] Pruebas con Orca falso en memoria: dos eventos en la ventana → un `director.wake`; con run activa no se encola otra; evento
  durante la sesión → despertar siguiente tras terminar; plazo vencido → run failed, terminal cerrado, error `orca:`; eventos propios
  no despiertan; run de director no cuenta en `reservations().usage.claude`.
- [ ] Implementar; panel; aceptación real; commit.

### Task 3: Jam por defecto y firma del chat
**Files:** `cli-director.ts` (jam init → `director.mode: "evento"`), `references/jam.md`, `chat.ts` (`from`), `panel/src/views/ChatParts.tsx`,
`Chat.tsx`; Tests `tests/cli-jam.test.ts`, `panel/src/views/Chat.visual.test.tsx`.
- [ ] Pruebas: jam init deja `director.mode`; burbuja de `origin: equipo` firma «Ana (UI)» y no «Tú». Implementar; commit.
