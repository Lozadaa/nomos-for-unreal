# Kratos · Hito 7 «endurecimiento y acabado» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Se refina antes de despachar con los hitos 0-6 en `main` y un recorrido completo ya hecho una vez.

**Goal:** Que el recorrido completo (petición → tareas → workers → assets → Unreal → pruebas → integración → DONE) sea estable ante fallos, reintentos y límites, que el panel esté acabado según las puertas de diseño del plan, y que una entrega se ejecute fuera del editor con su recorrido registrado.

**Architecture:** Endurecimiento del servicio (reintentos con reconciliación, límites de ciclos, presupuesto y concurrencia, separación de fallo de conexión / ejecución fallida / cancelación pedida / confirmada, capacidades ausentes visibles), observabilidad mínima (log estructurado por evento, `kratos doctor`), empaquetado y recorrido del ejecutable (UAT + arranque + capturas), regresión visual con Screenshot Comparison, Insights para rendimiento, y acabado del panel: `Ctrl+K`, pase de motion con las skills de Emil, `/impeccable harden` y `polish`, auditoría final y documentación de cierre.

**Tech Stack:** Lo anterior más `RunUAT BuildCookRun`, Screenshot Comparison Tool, Unreal Insights (trace y resumen), `emilkowalski/skills` (`emil-design-eng`, `review-animations`), Impeccable, `web-design-guidelines`, Playwright para e2e del panel sobre la semilla (única dependencia nueva, solo en `panel/`).

**Spec:** `docs/plan-v2.md` §2.5 (paleta de comandos), §2.6 (motion, harden), §3.8 (QA, build, entrega), §11 del plan v1 («Fiabilidad requerida desde el inicio»), hito 7 de §6, pruebas 3, 9, 14 del plan v1 §13 y 15-18, 24, 25 del v2.

## Global Constraints

- Separar y mostrar como estados distintos: fallo de conexión, ejecución fallida, cancelación solicitada, cancelación confirmada, capacidad ausente.
- Límites configurables en `.kratos/config.json` con valores por defecto: 3 ciclos de corrección por run, concurrencia por proveedor, presupuestos; al agotarse, Decisión con evidencia, nunca bucle.
- Reintentos solo tras reconciliar con el proveedor (Meshy, Orca, editor): nunca repetir a ciegas una creación remota que pudo cobrarse.
- Motion solo en cambios de estado (tarjeta que cambia de columna, franja del director); reduced-motion respetado; nada decorativo.
- `npm test`, `npm run build`, e2e del panel sobre `kratos seed` y skillsmith ≥ 95 en verde al cerrar; `docs/auditoria-7-cierre.md` y `docs/estado-entregas.md` completos.

## Review Focus

1. El servicio se reinicia con un `worker.poll` en marcha: al arrancar, los comandos `running` sin latido vuelven a `pending` una vez y se registran como `recovered`; nunca se duplica un worktree. (Tarea 1.)
2. Orca no está abierto: `kratos doctor` lo dice, Capacidades marca `roto` con la acción «Abrir Orca», y los `worker.start` esperan en vez de fallar tres veces. (Tarea 1.)
3. Captura de regresión visual con variación de render (tiempo, exposición): tolerancia configurable y espera de estabilización; un cambio real de UI sí falla. (Tarea 3.)
4. Paquete que arranca pero se cierra a los 5 s: el recorrido registra el log y el `TestRun build` falla con la causa, no aprueba por «salida cero». (Tarea 3.)
5. `Ctrl+K` con el foco dentro de un `TextArea`: no abre la paleta mientras se escribe; `Esc` cierra y devuelve el foco. (Tarea 4.)

---

### Task 1: Fiabilidad
- Recuperación al arranque (Review Focus 1), reconciliación por adaptador antes de reintentar, límites y Decisiones al agotarse, estados de fallo separados en eventos y panel, `kratos doctor` (comprueba Node, Orca, motor, MCP, Meshy, Blender, Git, token, puerto) con salida en tabla, log estructurado JSONL en `.kratos/logs/` con rotación diaria. Pruebas por cada caso. Commit.

### Task 2: Pruebas e2e del panel
- Playwright en `panel/e2e/` sobre `kratos start` + `kratos seed`: 10 vistas cargan, SSE reconecta tras `kratos stop`/`start` sin duplicar (prueba 3), teclado recorre Kanban/Drawer/Catálogo (prueba 24), 401 sin token (prueba 15), Decisión resuelta sin repetir contexto (prueba 20). Commit.

### Task 3: Entrega y calidad del juego
- `build` completo: `RunUAT BuildCookRun` → arranque del ejecutable fuera del editor → recorrido guionado (entrada, mapa, 3 acciones, salida) con capturas y log → `TestRun build` (prueba 14; Review Focus 4). Regresión visual con Screenshot Comparison y tolerancias (Review Focus 3). Insights: trace de 30 s en PIE y resumen (FPS medio, memoria, assets más pesados) como artefacto `report`. Gauntlet queda documentado como siguiente paso, no se integra. Commit.

### Task 4: Acabado del panel
- `Ctrl+K` (Review Focus 5): abrir vista, tarea por título, acción «Nueva petición», «Indexar», «Pausar». Pase de motion: `find-animation-opportunities` → `animate` solo en cambios de estado → `review-animations`; `/impeccable harden` (overflow, textos largos, i18n básica, errores) y `polish`; auditoría final `web-design-guidelines` sin errores de accesibilidad; `ux-heuristics`; capturas finales de las 10 vistas a ambas resoluciones en `docs/capturas-7/`. Commit.

### Task 5: Cierre del MVP
- `docs/auditoria-7-cierre.md` (puertas, hallazgos, pendientes), `docs/estado-entregas.md` con la tabla de los 8 hitos y las 35 pruebas (pasada / no pasada / no aplicable con evidencia), README actualizado con instalación y uso de `/kratos`, skillsmith ≥ 95, recorrido completo grabado en `docs/recorrido-mvp.md` con tiempos. Commit `docs: cierre del MVP de Kratos`.

## Self-review
- Cobertura: plan v1 §11 fiabilidad → Tarea 1; §3.8 build/Insights/regresión → Tarea 3; §2.5-2.6 acabado y motion → Tarea 4; pruebas 3, 9 (job Meshy sobrevive a recarga: cubierto por reconciliación de Tarea 1 y e2e), 14, 15-18, 20, 24, 25 → Tareas 2-5.
- Review Focus 1, 2 → Tarea 1; 3, 4 → Tarea 3; 5 → Tarea 4.
- Fuera, como dice el plan v2 §9: multiusuario, más hosts/GPU, streaming del editor, modo oscuro (tokens preparados), Gauntlet integrado.
