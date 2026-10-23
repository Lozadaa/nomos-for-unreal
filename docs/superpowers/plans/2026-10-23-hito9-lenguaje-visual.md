# Kratos · Hito 9 «Lenguaje visual» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el panel se entienda mirando, no leyendo: cada área, estado, proveedor, rol y tipo de evento tiene un glifo propio y un color de estado; las filas y tarjetas muestran iconos, cifras y miniaturas antes que frases; el flujo de producción se ve como un mapa vivo; los estados vacíos y las cabeceras llevan ilustraciones generadas por código; y el texto que queda es corto. Todo el arte es SVG procedural escrito por el agente (Codex), sin imágenes raster ni bancos de iconos externos salvo `lucide-react`, que ya está instalado.

**Architecture:** Una capa `panel/src/visual/` con tres piezas: (1) un **registro de glifos** (`glyphs.ts`) que mapea cada valor de dominio (área, estado de tarea, estado del director, proveedor, rol, tipo de evento, tipo de artefacto, fuente del catálogo) a un icono de `lucide-react` o a un SVG propio y a un color de estado de los tokens, con un componente `<Glyph>` que siempre lleva `aria-label`; (2) un **taller de arte procedural** (`art/`) con generadores deterministas por semilla (avatar de agente, pictograma de área, ilustración de estado vacío, cabecera de vista, mapa de producción) que devuelven JSX de SVG y usan solo `currentColor` y variables `--vbg-*`; (3) una **dieta de texto** aplicada vista por vista: etiquetas repetidas se sustituyen por glifo + tooltip, frases por cifras con unidad, y cada vista declara un presupuesto máximo de palabras visibles que una prueba mide. Todo respeta la capa de sensación del hito 8 (`useAction`, `withViewTransition`, reduced-motion) y la regla de «ningún color a mano»: los generadores toman colores de los tokens.

**Tech Stack:** El del hito 8 (Vite, React 19, Tailwind v4, shadcn/ui, React Router 7, sonner, Vitest, Playwright). `lucide-react` (ya en `panel/package.json`) para iconos genéricos; SVG propio para lo específico de Kratos (áreas Unreal, proveedores, pictogramas); `<model-viewer>` ya presente para miniaturas 3D. Sin librerías nuevas de iconos, ilustraciones ni gráficos: las sparklines y anillos son SVG propios de ≤ 40 líneas. Skills: `frontend-design`, `ui-ux-pro-max`, `dataviz` (forma y color de sparklines y anillos), `ux-writing` (dieta de texto), Impeccable (`/colorize`, `/delight`, `/distill`, `/polish`), `emilkowalski/skills` (`animate`, `review-animations`), `web-design-guidelines`, `ux-heuristics`.

**Spec:** Mensaje del usuario del 2026-10-23: «agregarle a la app que sea más visual, ahora está bien pero mucho texto; que sea más intuitiva sin leer tanto; SVG, iconos, imágenes generadas con Codex, todo lo que pueda ayudar». Entradas: hito 8 (`docs/diseno-visual.md`, `panel/src/**`, `docs/auditoria-8-cierre.md`), `docs/diseno/estados.md`, `design/tokens.json`, plan v2 §2.3 (vistas) y §4 (roles y proveedores), `docs/plan-v2.md` §2.6 (puertas).

## Global Constraints

- **Arte solo por código**: SVG procedural en componentes React, determinista por semilla (`seed` = id de la entidad); ningún PNG/JPG/WebP nuevo en `panel/`, ninguna URL externa, ninguna fuente de iconos nueva. `lucide-react` para lo genérico (calendario, filtro, buscar); SVG propio para lo de dominio.
- **Color solo de tokens**: los generadores reciben colores por `var(--vbg-*)`/`currentColor`; la prueba «sin colores a mano» del hito 8 se extiende a `panel/src/visual/**`.
- **Nunca color solo**: todo estado lleva glifo con forma propia además del color; todo glifo lleva `aria-label` o `title`; contraste AA de los glifos sobre su fondo.
- **Dieta de texto medible**: cada vista declara `maxVisibleWords` (Producción fila ≤ 7 palabras visibles sin contar título ni id; cabecera de vista ≤ 4; Catálogo tarjeta ≤ 5; Decisión tarjeta ≤ 20 incluyendo las opciones; franja del director ≤ 4 más la hora). Una prueba Vitest renderiza con la semilla y cuenta palabras en el DOM visible. El texto completo sigue disponible en tooltips, en el Sheet y para lectores de pantalla.
- **Intuición antes que instrucción**: ningún texto explicativo en pantalla salvo estados vacíos (una frase + acción) y el tour de primera vez (3 pasos, cerrable, nunca vuelve salvo desde ⌘K «Ver guía»). Leyenda de glifos accesible con `?` y desde ⌘K.
- **Movimiento**: el arte se anima solo por cambio de estado (el mapa de producción mueve un punto cuando una tarea cambia de etapa; el anillo avanza cuando llega un evento); `prefers-reduced-motion` lo deja estático. Nada decorativo en bucle salvo el latido del punto del director ya existente.
- **Rendimiento**: cada SVG procedural ≤ 2 KB generado y memoizado por semilla; la lista de Producción con 500 filas no supera 50 ms de frame largo (prueba del hito 8 se mantiene).
- Lo demás, como el hito 8: nunca Next; oscuro; LF; dependencias solo en `panel/`; `npm test`, `npm run test:panel`, `npm run build` y e2e en verde por commit; sin push ni merge; copy en español.
- **Coordinación**: las Tareas 1-2 crean solo archivos nuevos bajo `panel/src/visual/**` y una sección en `/estilo`, para poder correr en paralelo con la integración del hito 2 en el panel; las Tareas 3-6 tocan vistas y arrancan cuando esa integración esté en `main`.

## Review Focus

1. Un área o estado nuevo que no está en el registro (p. ej. una tarea con `area: 'audio'` si falta): `<Glyph>` debe mostrar un glifo neutro de «desconocido» con el texto en tooltip, nunca nada ni un error. (Tarea 1.)
2. Avatar generativo de dos agentes con ids casi iguales (`codex-1`, `codex-2`): deben distinguirse a simple vista a 24 px (forma, no solo matiz). (Tarea 2.)
3. La fila de Producción sin texto suficiente para una persona nueva: el tooltip y el Sheet deben decir con palabras todo lo que la fila dice con glifos; la leyenda `?` lista todos los glifos del registro. (Tareas 3 y 6.)
4. El mapa de producción con 0 tareas y con 200: no colapsa ni se amontona; agrupa por etapa con un contador en vez de dibujar 200 puntos. (Tarea 4.)
5. Lector de pantalla recorriendo una fila: anuncia área, estado, proveedor y etapa en ese orden, no «imagen, imagen, imagen». (Tarea 1 y 3; prueba con `getByRole('img', {name})`.)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `panel/src/visual/glyphs.ts` | Registro: `glyphFor(kind, value) → {Icon, color, label}`; listas cerradas de áreas, estados, proveedores, roles, eventos, artefactos, fuentes |
| `panel/src/visual/Glyph.tsx` | `<Glyph kind value size tone showLabel />` con `aria-label`; `<GlyphLegend />` |
| `panel/src/visual/art/seed.ts` | PRNG determinista (`mulberry32`) y utilidades de geometría |
| `panel/src/visual/art/{AgentAvatar,AreaPictogram,EmptyState,ViewHeader,ProductionMap,Ring,Sparkline,DiffBars}.tsx` | Generadores SVG |
| `panel/src/visual/art/catalog.ts` | Qué ilustración y qué cabecera usa cada vista y cada estado vacío |
| `panel/src/visual/text-budget.ts` | `visibleWords(element)` y `maxVisibleWords` por vista |
| `panel/src/visual/Tour.tsx` | Tres pasos de primera vez; estado en `localStorage` (`kratos.tour.v1`) |
| Modify `panel/src/views/*`, `components/TaskRow.tsx`, `components/StageStepper.tsx`, `shell/Header.tsx`, `shell/CommandMenu.tsx`, `views/Estilo.tsx` | Aplicar glifos, arte, dieta de texto, leyenda y tour |
| `panel/src/visual/**/*.test.tsx`, `panel/e2e/visual.spec.ts` | Pruebas |
| `docs/capturas-9/`, `docs/auditoria-9-cierre.md`, `docs/diseno-visual.md` (sección «Lenguaje visual») | Evidencia y reglas |

Listas cerradas del registro (valores exactos; el implementador no las amplía sin anotar por qué):

- Áreas: `gameplay`, `ui`, `escenarios`, `assets`, `animacion`, `audio`, `qa`, `builds`.
- Estados de tarea: `pendiente`, `preparada`, `implementando`, `revisando`, `probando`, `integrando`, `cerrando`, `done`, más los modificadores `bloqueada` y `decision`.
- Estados del director: `esperando`, `escuchando`, `atendiendo`, `vigilanteCaido`, `desconectado`.
- Proveedores: `codex`, `claude`, `meshy`, `blender`, `unreal`, `kratos`, `launcher`.
- Roles: `director`, `implementacion`, `arte`, `revisor`, `qa`, `integrador`, `coordinador`.
- Eventos (prefijos): `message`, `reply`, `task`, `run`, `worker`, `command`, `decision`, `lease`, `review`, `artifact`, `test`, `integration`, `download`, `director`.
- Artefactos: `model`, `texture`, `screenshot`, `video`, `build`, `report`, `diff`.
- Fuentes del catálogo: `fab`, `megascans`, `polyhaven`, `ambientcg`, `kenney`, `quaternius`, `sketchfab`, `freesound`, `meshy`, `blender`.

---

### Task 1: Registro de glifos y componente `<Glyph>`

**Files:** Create `panel/src/visual/glyphs.ts`, `panel/src/visual/Glyph.tsx`; Modify `panel/src/views/Estilo.tsx` (sección «Glifos»); Test `panel/src/visual/glyphs.test.tsx`.

**Interfaces:**
- `glyphFor(kind: GlyphKind, value: string): GlyphSpec` con `GlyphKind = 'area'|'taskState'|'directorState'|'provider'|'role'|'event'|'artifact'|'source'` y `GlyphSpec = { Icon: React.ComponentType<{size?: number; className?: string}>; tone: 'neutral'|'info'|'success'|'warning'|'error'|'primary'; label: string }`. Valor desconocido → `{Icon: CircleDashed, tone: 'neutral', label: value}` (Review Focus 1).
- `<Glyph kind value size={16} showLabel={false} />` renderiza el icono con `role="img"` y `aria-label={label}`, color por `tone` (`--k-*` del hito 8) y, si `showLabel`, el texto al lado en `label` (13 px).
- `<GlyphLegend />`: todas las entradas del registro agrupadas por `kind`, para `/estilo`, para el atajo `?` y para ⌘K «Leyenda».
- Decisión de iconos (lucide salvo SVG propio marcado ★): áreas → `Gamepad2`, `LayoutPanelTop`, `Mountain`, `Box`, `Bone`★, `AudioWaveform`, `FlaskConical`, `Package`; estados de tarea → `Circle` (pendiente), `CircleDot` (preparada), `Hammer` (implementando), `Eye` (revisando), `TestTube2` (probando), `GitMerge` (integrando), `DoorClosed` (cerrando), `CheckCircle2` (done), `Ban` (bloqueada), `HelpCircle` (decision); director → `Hourglass`, `Radio`, `Activity`, `WifiOff`, `PlugZap`; proveedores → SVG propios ★ geométricos y neutros (sin logotipos de marca): hexágono (codex), cuarto de círculo (claude), tetraedro (meshy), anillo con nodo (blender), «U» de bloque (unreal), corona de tres puntas (kratos), bandeja (launcher); artefactos → `Boxes`, `Image`, `Camera`, `Film`, `PackageCheck`, `FileText`, `Diff`.

- [ ] Pruebas: todas las listas cerradas tienen glifo (recorrer el registro, ningún `CircleDashed` salvo desconocido); `<Glyph>` expone `role="img"` y `aria-label` (Review Focus 5); valor desconocido no lanza; `GlyphLegend` lista `8 + 10 + 5 + 7 + 7 + 14 + 7 + 10` entradas.
- [ ] Implementar; sección «Glifos» en `/estilo`; `npm run test:panel`; commit `feat: registro de glifos y componente Glyph`.

### Task 2: Taller de arte procedural

**Files:** Create `panel/src/visual/art/{seed,AgentAvatar,AreaPictogram,EmptyState,ViewHeader,ProductionMap,Ring,Sparkline,DiffBars,catalog}.ts(x)`; Modify `panel/src/views/Estilo.tsx` (sección «Arte»); Test `panel/src/visual/art/*.test.tsx`.

**Interfaces y decisiones:**
- `seed.ts`: `rng(seed: string): () => number` (mulberry32 sobre hash FNV-1a), `pick(rng, list)`, `jitter(rng, base, amount)`.
- `<AgentAvatar id provider size={24} />`: medallón redondo con 3 formas geométricas superpuestas (triángulo, arco, barra) cuyas posiciones y grosores salen de `rng(id)`; el contorno lleva el glifo del proveedor en la esquina inferior; dos ids distintos difieren al menos en una forma (Review Focus 2; prueba compara los `path` generados).
- `<AreaPictogram area size={48} />`: pictograma de 48 px por área, trazo 1.5, estilo de línea coherente con lucide; es el SVG ★ del registro ampliado a tamaño de ilustración.
- `<EmptyState view />`: ilustración de 160×120 por vista (de `catalog.ts`): Producción (tres filas vacías con un punto que entra), Actividad (carriles vacíos), Entregas (marco vacío), Catálogo (rejilla vacía con lupa), Chat (burbuja abierta), Decisiones (balanza), Presupuesto (anillo vacío), Capacidades (enchufes). Línea `--vbg-border-strong`, relleno `--vbg-surface-secondary`, un acento `--vbg-color-info`.
- `<ViewHeader view />`: franja decorativa de 1400×40 bajo las pestañas, patrón geométrico sutil por vista (opacidad ≤ 0.08), que sube a 0.14 durante 180 ms al cambiar de vista (sensación de llegada) y nunca se anima con reduced-motion.
- `<ProductionMap tasks />`: mapa horizontal del flujo (`pendiente → preparada → implementando → revisando → probando → integrando → cerrando → done`) con un nodo por etapa, el contador dentro del nodo, y puntos (uno por tarea hasta 12; a partir de 13 solo el contador: Review Focus 4) que se desplazan con `withViewTransition` al cambiar de etapa; bloqueadas en ámbar y decisiones con `HelpCircle`; clic en un nodo filtra la lista.
- `<Ring value max size />` (anillo de progreso para runs y presupuestos), `<Sparkline values />` (actividad por hora, 7 carriles), `<DiffBars added removed files />` (barras de añadido/borrado por archivo).
- Reglas de `dataviz`: una sola familia de color para series, ejes implícitos, etiquetas solo en tooltip.

- [ ] Pruebas: determinismo (misma semilla → mismo SVG; semillas distintas → paths distintos); `ProductionMap` con 0 y con 200 tareas (Review Focus 4); `Ring` con `value > max` se limita; todos los generadores devuelven ≤ 2 KB de markup para la semilla de prueba; ningún color literal en `visual/**` (ampliar la prueba del hito 8).
- [ ] Implementar; sección «Arte» en `/estilo` con todas las semillas de la producción semilla; `npm run test:panel`; commit `feat: taller de arte procedural`.

### Task 3: Dieta de texto en Producción, Chat y detalle

**Files:** Modify `panel/src/components/TaskRow.tsx`, `StageStepper.tsx`, `views/Produccion.tsx`, `views/TaskSheet.tsx`, `views/Chat.tsx`; Create `panel/src/visual/text-budget.ts`; Test `panel/src/visual/text-budget.test.tsx`.

Fijado: la fila de Producción pasa a: `<Glyph area>` · `<Glyph taskState>` con punto de color · título · id mono · `<AgentAvatar>` del responsable · `<Ring>` del run si está `running` · tiempo relativo abreviado («2 min», «3 h»); el texto de etapa y de proveedor desaparece de la fila y vive en el tooltip de su glifo y en el Sheet. El `StageStepper` usa los glifos de estado en los nodos y el nombre solo en el nodo activo. El compositor muestra el pictograma del área elegida en vez de un selector con texto largo (el selector sigue siendo accesible con teclado). El Chat marca cada burbuja con el `AgentAvatar` del emisor en lugar de la etiqueta de texto; «Recibido por Kratos» pasa a un `CheckCircle2` con tooltip. `text-budget.ts`: `visibleWords(root: HTMLElement): number` (ignora `aria-label`, `title`, `[hidden]`, tooltips cerrados y texto `sr-only`), `budgets = { produccionRow: 7, viewHeader: 4, catalogCard: 5, decisionCard: 20, directorBar: 4 }`.

- [ ] Pruebas: una fila de la semilla ≤ 7 palabras visibles; el tooltip de la fila contiene área, estado, proveedor y etapa (Review Focus 3); lector: `getAllByRole('img')` en orden área, estado, proveedor (Review Focus 5).
- [ ] Capturas `produccion-9-1366.png`, `produccion-sheet-9-1366.png`, `chat-9-1366.png`; `npm run test:panel`; commit `feat: dieta de texto en Producción, Chat y detalle`.

### Task 4: Mapa de producción, anillos y sparklines en las vistas

**Files:** Modify `views/Produccion.tsx` (mapa arriba del listado), `views/Actividad.tsx` (sparkline por carril y glifos de evento en vez de texto), `views/Presupuesto.tsx` (anillos en vez de barras), `views/Capacidades.tsx` (glifo de proveedor + estado), `TaskSheet.tsx` pestaña Cambios (`DiffBars` sobre el `stat`).

- [ ] Pruebas Vitest: el mapa filtra al pulsar un nodo; Actividad muestra glifos de evento con `aria-label`; Presupuesto renderiza un `Ring` por presupuesto con el porcentaje en el centro.
- [ ] Capturas de las cuatro vistas; `npm run test:panel`; commit `feat: mapa de producción, anillos y sparklines`.

### Task 5: Ilustraciones, cabeceras y miniaturas

**Files:** Modify `views/*` (estado vacío con `<EmptyState>` + una frase + acción), `shell/Header.tsx` o layout de vista (`<ViewHeader>`), `views/Catalogo.tsx` (tarjeta con miniatura real si `thumbnail_path`, si no `AreaPictogram` por categoría; fuente como glifo), `views/Entregas.tsx` (miniatura 3D con `<model-viewer>` en tarjeta, captura como imagen, informe con `FileText`), `views/Decisiones.tsx` (opciones como tarjetas con miniatura o pictograma, no solo texto).

- [ ] Pruebas: cada vista con datos vacíos renderiza su `EmptyState` con exactamente una frase y una acción; Catálogo sin `thumbnail_path` muestra el pictograma; `ViewHeader` cambia de patrón por ruta.
- [ ] Capturas de las vistas vacías y llenas a 1366 y 1920; `npm run test:panel`; commit `feat: ilustraciones, cabeceras y miniaturas`.

### Task 6: Leyenda, tour y puertas

**Files:** Create `panel/src/visual/Tour.tsx`; Modify `shell/CommandMenu.tsx` («Leyenda», «Ver guía»), atajo `?` → `GlyphLegend` en un `Sheet`; Create `panel/e2e/visual.spec.ts`; Docs.

Fijado: tour de tres pasos la primera vez (franja del director: «Aquí ves si Kratos escucha»; compositor: «Pide algo aquí»; mapa: «Así avanza el trabajo»), cerrable con `Esc`, nunca vuelve salvo «Ver guía»; `?` abre la leyenda (no se abre si el foco está en un campo de texto). Puertas: `ux-heuristics` Quick Diagnostic, `/impeccable colorize` y `/distill` sobre Producción y Catálogo, `review-animations` del mapa y los anillos, `web-design-guidelines`, comparación de capturas antes/después (hito 8 vs hito 9) en `docs/auditoria-9-cierre.md` con el recuento de palabras visibles por vista antes y después.

- [ ] E2e: el tour aparece una vez y no vuelve tras recargar; `?` abre la leyenda y `Esc` devuelve el foco; con `reduce` el mapa no se mueve.
- [ ] Docs: `docs/diseno-visual.md` sección «Lenguaje visual» (registro, reglas de arte, presupuestos de texto); `docs/auditoria-9-cierre.md`; `docs/estado-entregas.md`.
- [ ] Commit `docs: cierre del hito 9, lenguaje visual`.

---

## Self-review

- Cobertura del pedido: «más visual» → Tareas 1, 2, 4, 5; «mucho texto» → Tarea 3 con presupuesto medible y leyenda; «intuitiva sin leer» → glifos con forma, mapa de producción, tour de tres pasos (Tarea 6); «SVG/iconos/imágenes generadas con Codex» → Tarea 2 (todo procedural, determinista, sin raster) y la regla «arte solo por código».
- Compatibilidad con el hito 8: todo pasa por los tokens y la capa de sensación; las pruebas existentes se mantienen y se amplían.
- Review Focus 1, 5 → Tarea 1 (y 3); 2 → Tarea 2; 3 → Tareas 3 y 6; 4 → Tareas 2 y 4.
- Riesgo asumido: los glifos de proveedor son geométricos y neutros a propósito, para no usar logotipos de marcas; si el usuario prefiere los logos oficiales, se revisan licencias antes.
- Despacho: Tareas 1-2 a Codex en cuanto se apruebe (archivos nuevos, sin conflicto con la integración del panel en curso); Tareas 3-6 cuando esa integración esté en `main`, al mismo agente para mantener el criterio visual.
