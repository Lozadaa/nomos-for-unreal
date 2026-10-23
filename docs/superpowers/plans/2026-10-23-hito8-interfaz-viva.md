# Kratos · Hito 8 «Interfaz viva» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Este plan manda sobre la capa visual del panel.** Sustituye la dirección clara y Ant Design de `docs/plan-v2.md` §2 y del hito 1a, y las Tareas 6-10 del hito 1b (el panel React), que ahora se construyen según este documento. Las Tareas 1-5 del hito 1b (servicio) no cambian. Lo que el hito 1a dejó (brief, inventario de estados con copy, maquetas, página `/estilo`) sigue siendo referencia de contenido y estructura; sus tokens, su tema claro y su apariencia quedan descartados.

**Goal:** Un panel oscuro con la apariencia de Vercel que se sienta vivo: cada acción del usuario tiene una respuesta inmediata en la misma pantalla, nada se recarga en silencio, y cada cambio de vista o apertura de detalle se percibe como un movimiento continuo, no como un salto. Sin Next.js.

**Architecture:** SPA con Vite + React 19 + TypeScript. Componentes de shadcn/ui (Radix + Tailwind v4, el sistema abierto de Vercel) tematizados con los **tokens oficiales de Vercel** (`vercel-brand.css`, publicada en vercel.com/geist, con valores claro y oscuro mediante `light-dark()`), fuentes Geist Sans y Geist Mono. Una capa propia de «sensación» (`panel/src/feel/`) gobierna toda acción: estados pendiente/éxito/error en el control que se pulsó, actualizaciones optimistas con reversión, toasts con deshacer, y transiciones de vista con la View Transitions API a través de React Router 7 (`viewTransition`), con elemento compartido entre la fila y su detalle. El SSE del servicio alimenta el estado; las listas se reordenan con animación en lugar de parpadear.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind v4 (`@tailwindcss/vite`), shadcn/ui (CLI `npx shadcn@latest init` con Vite), `@fontsource-variable/geist` y `@fontsource-variable/geist-mono` (la versión de Google Fonts carece de glifos y features; la de Fontsource se autoaloja), React Router 7 (`<Link viewTransition>`, `useViewTransitionState`), `sonner` (toasts), Vitest + Testing Library, Playwright (e2e de transiciones). Sin librerías de animación: CSS, View Transitions y `requestAnimationFrame`. Skills: `emilkowalski/skills` (`emil-design-eng`, `find-animation-opportunities`, `animate`, `review-animations`, `break-ui`), Impeccable (`animate`, `polish`, `harden`), `web-design-guidelines`, `ux-writing`, `frontend-design`.

**Spec:** Mensaje del usuario del 2026-10-23 («odio las interfaces estáticas que no se sienten fluidas, cada acción tiene que tener una respuesta en la misma pantalla y si es una redirección se tiene que sentir, es muy importante cómo te sientes; olvida el tema de Jira; dark, tipo Vercel, sin Next»). Fuentes oficiales: vercel.com/geist (introducción, stack, tipografía, materiales), `https://vercel.com/geist/vercel-brand.css` (tokens), vercel.com/design.md. Entradas: hito 1b Tareas 1-5 (rutas y eventos), hito 0 (contrato), hito 1a `docs/diseno/estados.md` (copy e inventario de estados).

## Global Constraints

- **Nunca Next.js.** Vite + React Router 7.
- **Colores, radios, tipografía y espaciado solo desde los tokens** `--vbg-*` de Vercel mapeados a las variables de shadcn (`--background`, `--foreground`, `--card`, `--border`, `--ring`, `--primary`, `--muted`, `--destructive`…) en `panel/src/styles/theme.css`. Prohibido escribir un color en un componente (prueba lo comprueba). Tema oscuro por defecto; el claro existe por `light-dark()` pero no se entrega ni se prueba en este hito.
- **Apariencia Vercel**: superficies `surface-primary` (negro) y `surface-secondary`, texto `text-primary`/`text-secondary`, separación por **bordes de alfa blanco** (`border-subtle|default|strong`), **sin sombras** (Vercel no las usa: la elevación es borde más fondo secundario), radio 8 px (6 px en controles pequeños), Geist Sans para todo, Geist Mono para ids, rutas, comandos y cifras de tabla, azul solo para foco, enlaces y la acción primaria; el estado se comunica con **puntos de color** (`color-success|warning|error|info`) y texto, nunca con chips rellenos de colores de Jira.
- **Olvidar Jira**: no hay tablero de columnas. Producción es una lista viva de filas (como los despliegues de Vercel) con punto de estado, título, id mono, responsable, etapa y tiempo relativo; el detalle abre en un panel lateral (Sheet) y la etapa se muestra como un «stepper» horizontal dentro del detalle. Sin arrastrar y soltar.
- **Regla de sensación** (se aplica a toda acción y la verifica la Tarea 2): pulsar un control muestra su estado pendiente antes de 100 ms y lo mantiene visible al menos 300 ms aunque el servidor responda antes; la fila o cifra afectada cambia en el acto (optimista) y vuelve atrás con un toast si el servidor falla; todo éxito que mueva algo fuera de la vista deja un toast con la acción «Ver» o «Deshacer»; los errores se muestran junto al control que los causó; nada recarga la página ni muestra un spinner de pantalla completa; esperar más de 300 ms muestra esqueleto, no spinner.
- **Regla de movimiento**: cambio de vista = `startViewTransition` con crossfade de 180 ms y el elemento pulsado morfando hacia el encabezado del destino (`view-transition-name` compartido); abrir detalle = la fila se convierte en el encabezado del Sheet (220 ms, `cubic-bezier(.2,.8,.2,1)`); listas reordenan con animación (View Transitions por `view-transition-name` de fila, 260 ms); cifras cambian con «tick» de 300 ms; sin movimiento decorativo; `prefers-reduced-motion` reduce todo a fundidos de 80 ms sin desplazamiento. Duraciones: micro 120, estándar 180, panel 220, reordenar 260. Navegadores sin View Transitions (Firefox hoy): fundido CSS equivalente.
- Resoluciones 1366×768 y 1920×1080; mínimo 1280. Toda pantalla con formulario cabe sin scroll a 1366×768 (regla de Noovo); el compositor de peticiones se expande en el sitio, sin modal.
- Copy en español, de `docs/diseno/estados.md`, revisado con `ux-writing`.
- Rendimiento medido, no supuesto: INP < 200 ms en las acciones de la Tarea 2, transiciones sin frames perdidos en Chromium (`PerformanceObserver` de `long-animation-frame` sin entradas > 50 ms durante una transición), primera carga del panel < 250 KB de JS comprimido.
- `npm test` (Vitest + node:test), `npm run build`, e2e de Playwright y auditorías en verde al cerrar.

## Review Focus

1. Llega un evento SSE que mueve una fila mientras su transición de apertura está en curso: no debe animarse dos veces ni saltar; la segunda actualización espera a `transition.finished`. (Prueba en Tarea 2.)
2. Acción optimista que el servidor rechaza con 409 (decisión caducada): la fila vuelve a su estado, el toast dice por qué y ofrece «Recargar decisión», el foco vuelve al control. (Prueba en Tarea 2.)
3. Firefox o `startViewTransition` ausente: la navegación funciona con el fundido CSS y ninguna promesa queda sin resolver. (Prueba en Tarea 2 con `document.startViewTransition = undefined`.)
4. Cerrar el Sheet con `Esc` devuelve el foco a la fila que lo abrió, y con `Tab` el orden es encabezado → tabs → contenido. (Prueba e2e en Tarea 4.)
5. Lista de 500 filas de Actividad: la animación de reordenar se limita a las filas visibles (`content-visibility` o virtualización ligera) y el hilo principal no se bloquea > 50 ms. (Prueba en Tarea 5.)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `panel/` (Vite + React + TS + Tailwind v4 + shadcn) | La SPA; `panel/dist/` la sirve el servicio |
| `design/vendor/vercel-brand.css` + `design/vendor/LICENSE-NOTE.md` | Copia fijada de los tokens oficiales de Vercel con fecha y origen; si sus términos no permiten redistribuir, se copian solo los valores a `design/tokens.json` y se cita la fuente |
| `design/tokens.json` (v2) | Misma forma que en 1a, valores oscuros derivados de `--vbg-*`; `taskState` y `directorState` mapean a `success|warning|error|info|neutral` |
| `panel/src/styles/theme.css` | Variables de shadcn ← `--vbg-*`; fuentes; `color-scheme: dark` |
| `panel/src/feel/{useAction,toasts,transitions,motion}.ts` | La capa de sensación: hook de acción, política de toasts, envoltorios de View Transitions, tokens de movimiento |
| `panel/src/shell/{Header,Tabs,DirectorDot,CommandMenu}.tsx` | Cabecera tipo proyecto de Vercel, pestañas de vistas, punto vivo del director, ⌘K |
| `panel/src/views/*` | Producción (lista), Detalle (Sheet), Chat, Actividad, Entregas, Catálogo, Decisiones, Presupuesto, Capacidades, Estilo |
| `panel/src/components/*` | Fila de producción, stepper de etapa, esqueletos, cifra con tick, punto de estado, compositor |
| `panel/e2e/*.spec.ts` | Transiciones, foco, reduced motion, Firefox-fallback |
| `docs/diseno-visual.md` (reescrito) | La dirección vigente: oscura, Vercel, reglas de sensación y movimiento |
| `docs/capturas-8/`, `docs/auditoria-8-cierre.md` | Evidencia |

---

### Task 1: Base visual: stack, tokens de Vercel y fuentes

**Files:** Create `panel/` (scaffold), `design/vendor/vercel-brand.css`, `design/vendor/LICENSE-NOTE.md`, `panel/src/styles/theme.css`; Modify `design/tokens.json`, `design/build-tokens.ts`, `tests/tokens.test.ts`.

**Interfaces:**
- `theme.css`: `:root { color-scheme: dark; --background: var(--vbg-surface-primary); --card: var(--vbg-surface-secondary); --foreground: var(--vbg-text-primary); --muted-foreground: var(--vbg-text-secondary); --border: var(--vbg-border-default); --input: var(--vbg-border-strong); --ring: var(--vbg-focus); --primary: var(--vbg-color-info); --destructive: var(--vbg-color-error); --radius: var(--vbg-radius); }` más `--k-success|warning|error|info` ← `--vbg-color-*` y `--k-font-sans|mono`.
- `tokens.json` v2: conserva las claves de 1a; `color.*` se rellena con los valores oscuros de `vercel-brand.css` (`surface-primary oklch(0 0 0)`, `surface-secondary oklch(0.027 0 0)`, `text-primary oklch(0.946 0 0)`, `text-secondary oklch(0.706 0 0)`, bordes `oklch(1 0 0 / .13|.14|.54)`, `focus oklch(71.7% 0.1648 250.794)`, `info oklch(57.61% 0.2321 258.23)`, `success oklch(73.1% 0.2158 148.29)`, `warning oklch(77.21% 0.1991 64.28)`, `error oklch(62.56% 0.2234 23.03)`); `shadow` pasa a `{}` con nota «Vercel no usa sombras»; `font.sans = "Geist Variable"`, `font.mono = "Geist Mono Variable"`; `radius.sm = 6`, `radius.md = 8`; `space` = la escala `--vbg-space-*`.
- Fuentes: `import "@fontsource-variable/geist"` y `import "@fontsource-variable/geist-mono"` en `main.tsx`.

- [ ] Pruebas: contraste AA en oscuro (`text-primary` sobre `surface-primary` ≥ 4.5, `text-secondary` ≥ 4.5, puntos de estado ≥ 3 sobre `surface-primary`); `tokens.css` generado contiene los valores oklch; ningún archivo bajo `panel/src` contiene `#[0-9a-f]{3,8}`, `rgb(`, `oklch(` ni `box-shadow:` (salvo `theme.css`).
- [ ] Scaffold: `npm create vite@latest panel -- --template react-ts`, Tailwind v4, `npx shadcn@latest init` (base color neutral, CSS variables), añadir `button sheet tabs badge skeleton tooltip command dropdown-menu input textarea toggle-group sonner`; configurar `vite.config.ts` con `base: "/"` y `build.outDir = "dist"`; el servicio sirve `panel/dist` (hito 1b Tarea 6, parte servidor).
- [ ] Descargar `vercel-brand.css` con fecha a `design/vendor/`, leer sus términos en vercel.com/geist (sección de uso de marca) y escribir `LICENSE-NOTE.md`; si no permite redistribución, dejar solo `tokens.json` con los valores y un enlace.
- [ ] `npm test` y `npm run build` en verde; commit `feat: base visual oscura con tokens de Vercel y fuentes Geist`.

### Task 2: La capa de sensación

**Files:** Create `panel/src/feel/useAction.ts`, `toasts.ts`, `transitions.ts`, `motion.ts`; Test `panel/src/feel/*.test.ts`.

**Interfaces:**
- `useAction<T>(run: () => Promise<T>, opts: { optimistic?: () => () => void; success?: (t: T) => ToastSpec | void; error?: (e) => ToastSpec; minPendingMs?: number (300) }): { pending: boolean; error: Error | null; fire: () => Promise<void> }` — aplica `optimistic()` al instante y guarda su función de reversión; marca `pending` ≤ 100 ms después de `fire`; mantiene `pending` ≥ `minPendingMs`; en error llama a la reversión y a `toasts.error` con la acción `retry`; devuelve el foco al elemento activo al terminar.
- `toasts`: `success(spec)`, `error(spec)`, `info(spec)` sobre `sonner`, con `ToastSpec = { title: string; description?: string; action?: { label: 'Ver' | 'Deshacer' | 'Reintentar' | 'Recargar decisión'; onClick } }`; política: un toast por acción, 4 s, apilados abajo a la derecha, sin toasts de éxito cuando el resultado ya es visible en pantalla.
- `transitions`: `withViewTransition(update: () => void | Promise<void>): Promise<void>` — usa `document.startViewTransition` si existe, si no aplica la clase `.fallback-fade` 180 ms; `nameFor(entity: 'task'|'decision'|'asset', id): string` para `view-transition-name`; `queueWhileTransitioning(fn)` que retrasa `fn` hasta `transition.finished` (Review Focus 1).
- `motion.ts`: `durations = { micro: 120, standard: 180, panel: 220, reorder: 260 }`, `easing = 'cubic-bezier(.2,.8,.2,1)'`, `reducedMotion()` (lee `matchMedia('(prefers-reduced-motion: reduce)')`).
- CSS en `theme.css`: `::view-transition-old(root)`/`new(root)` con `animation-duration: 180ms`; `@media (prefers-reduced-motion: reduce) { ::view-transition-group(*) { animation-duration: 80ms; } }`.

- [ ] Pruebas (Vitest, temporizadores falsos): `pending` visible ≥ 300 ms con respuesta en 20 ms; reversión en error y toast con «Reintentar»; `withViewTransition` sin `startViewTransition` resuelve y aplica el fallback (Review Focus 3); `queueWhileTransitioning` ejecuta tras `finished` (Review Focus 1); 409 → toast «Recargar decisión» y foco restaurado (Review Focus 2).
- [ ] Commit `feat: capa de sensación: acciones optimistas, toasts y transiciones`.

### Task 3: Shell tipo Vercel

**Files:** Create `panel/src/shell/{Header,Tabs,DirectorDot,CommandMenu}.tsx`, `panel/src/App.tsx` (rutas con React Router 7).

Fijado: cabecera de 56 px (`surface-primary`, borde inferior `border-subtle`) con marca «Kratos» a la izquierda, nombre del proyecto (del `.uproject`) como título, el **punto vivo del director** (verde latiendo suave 2 s cuando `listener`, ámbar fijo «vigilante caído», rojo «desconectado», gris «esperando») con texto al lado y tooltip con «Última confirmación», y ⌘K a la derecha; debajo una fila de pestañas de 40 px (Producción · Actividad · Entregas · Catálogo · Chat · Decisiones · Presupuesto · Capacidades · Estilo) con indicador deslizante bajo la activa (180 ms) y `<Link viewTransition>`; sin barra lateral. Contenido con `max-width: 1400px` centrado, padding `--vbg-space-6`. ⌘K abre `Command` con vistas, tareas por título y acciones (Nueva petición, Indexar, Pausar); `Esc` cierra y devuelve el foco; no se abre si el foco está en un `textarea`.

- [ ] Pruebas: `DirectorDot` muestra color y texto por estado; `Tabs` marca la activa por ruta; ⌘K no abre dentro de un `textarea`.
- [ ] Capturas `shell-1366.png`, `shell-1920.png`. Commit `feat: shell oscuro tipo Vercel con pestañas, punto del director y ⌘K`.

### Task 4: Producción como lista viva y detalle con elemento compartido

**Files:** Create `panel/src/views/Produccion.tsx`, `panel/src/views/TaskSheet.tsx`, `panel/src/components/{TaskRow,StageStepper,StatusDot,Composer,Skeletons}.tsx`.

Fijado: lista de filas de 48 px (`TaskRow`: punto de estado, título, id mono de 7 caracteres, responsable y proveedor, etapa en texto, tiempo relativo «hace 2 min» que se actualiza), agrupadas por etapa con cabeceras de sección en mayúsculas pequeñas (`label`), filtro por etapa como `ToggleGroup` y búsqueda; **compositor** arriba, de una línea que se expande al enfocar (título → descripción → área → «Enviar a Kratos»), con `useAction`: la fila nueva aparece optimista en «pendiente» con punto pulsante y pasa a su estado real al llegar el evento; `TaskSheet` (ancho 720 px, desde la derecha, 220 ms) con `view-transition-name` compartido entre la fila y el encabezado del Sheet, pestañas Resumen · Chat · Cambios · Pruebas · Assets · Timeline, `StageStepper` horizontal con la etapa actual resaltada y el motivo de bloqueo o decisión debajo, y acciones (`Pedir cambios`, `Resolver decisión`) con `useAction`; cambios por SSE reordenan la lista con animación.

- [ ] Pruebas Vitest: fila optimista y sustitución por evento; filtro; `StageStepper` marca `bloqueada` sin perder la etapa. E2e Playwright: abrir y cerrar el Sheet mantiene el foco (Review Focus 4); `startViewTransition` se invoca al navegar (espía); con `reduce` no hay desplazamiento.
- [ ] Capturas `produccion-1366.png`, `produccion-sheet-1366.png`, `composer-1366.png`, `-1920`. Commit `feat: Producción como lista viva con detalle y compositor`.

### Task 5: El resto de vistas con la misma sensación

**Files:** Create `panel/src/views/{Chat,Actividad,Entregas,Catalogo,Decisiones,Presupuesto,Capacidades,Estilo}.tsx` y componentes necesarios.

Fijado: Chat como conversación con compositor fijo abajo (`Ctrl+Enter`), burbuja optimista «Enviado» que pasa a «Recibido por Kratos» y la respuesta aparece con fundido; Actividad con carriles en grid y eventos como puntos con etiqueta al pasar el ratón, filtro por tarea, nuevas entradas entran con fundido y el carril no salta (Review Focus 5 con `content-visibility: auto`); Entregas como rejilla de tarjetas oscuras (borde `subtle`, al pasar el ratón `strong`), visor GLB `<model-viewer>` con fondo `surface-secondary`; Catálogo como rejilla con filtros segmentados, aviso de licencia como punto ámbar y «IA prohibida» como etiqueta de texto, «Preparar para Unreal» con `useAction`; Decisiones como bandeja con navegación `j`/`k`, opciones como botones secundarios y la elegida resaltada al instante; Presupuesto con cifras grandes en Geist Mono que hacen tick y barras finas; Capacidades como filas con punto de estado y acción; Estilo como galería de todo lo anterior en todos sus estados.

- [ ] Pruebas Vitest por vista (una por comportamiento de sensación: optimista, tick, reorden). Capturas de las ocho vistas a ambas resoluciones.
- [ ] Commit `feat: vistas con la capa de sensación`.

### Task 6: Puertas de sensación, auditoría y cierre

- [ ] `find-animation-opportunities` sobre el panel → aplicar solo lo que sea respuesta a una acción o cambio de estado; `review-animations` y `break-ui` (Emil); `/impeccable animate` y `polish`; `web-design-guidelines`; `ux-heuristics`.
- [ ] Medir: INP de las cinco acciones principales (`web-vitals` en dev, o `PerformanceObserver`), frames largos durante transiciones, tamaño del bundle. Anotar cifras reales.
- [ ] E2e Playwright en Chromium y Firefox (fallback), con y sin `reduce`.
- [ ] Reescribir `docs/diseno-visual.md` con la dirección vigente y las reglas de sensación y movimiento; `docs/auditoria-8-cierre.md`; capturas en `docs/capturas-8/`; `docs/estado-entregas.md`.
- [ ] Commit `docs: cierre del hito 8, interfaz viva`.

---

## Self-review

- Cobertura del pedido: «cada acción tiene respuesta en la misma pantalla» → Regla de sensación + Tarea 2 (`useAction`) aplicada en Tareas 4-5; «si es una redirección se tiene que sentir» → Regla de movimiento + `withViewTransition` + elemento compartido fila→Sheet (Tareas 2-4); «olvida Jira» → lista viva y stepper, sin columnas ni chips; «dark tipo Vercel» → tokens oficiales de Vercel, bordes sin sombras, Geist, shell con pestañas (Tareas 1 y 3); «sin Next» → Global Constraints.
- Lo que cambia respecto a planes anteriores queda dicho en la nota inicial; el hito 1b Tareas 6-10 se ejecuta con este plan como especificación visual y de sensación.
- Review Focus 1-3 → Tarea 2; 4 → Tarea 4; 5 → Tarea 5.
- Riesgo asumido: `vercel-brand.css` es material de marca de Vercel; la Tarea 1 verifica sus términos antes de versionarlo y, si no procede, solo se copian valores con cita. `@vercel/geistcn` aparece en la documentación de Vercel pero no estaba publicado en npm el 2026-10-23; si se publica, se evalúa sustituir componentes de shadcn por los suyos sin tocar la capa de sensación.
