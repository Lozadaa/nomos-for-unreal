# Nomos · Hito 1a «diseño del panel» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar decidido y documentado el diseño visual del panel de Nomos antes de programarlo: brief, tokens, inventario de vistas y estados con su copy, tres maquetas comparadas a 1366×768 y 1920×1080, una dirección elegida y una página `/estilo` que muestra todos los componentes en todos sus estados. Todo en HTML y CSS estáticos con los tokens como única fuente de color, tipografía y sombra.

**Architecture:** Los tokens viven en `design/tokens.json` (fuente única) y se generan a `design/tokens.css` (variables CSS) con un script Node sin dependencias; las maquetas y `/estilo` solo usan esas variables. El hito 1b importará el mismo `tokens.json` al `ConfigProvider` de Ant Design. Las puertas de calidad del plan (auditoría Vercel, Impeccable, ux-heuristics, contraste AA, capturas) se aplican a la maqueta elegida y a `/estilo`.

**Tech Stack:** HTML + CSS estáticos, Node ≥ 25 para el generador de tokens y las pruebas (`node:test`), `design-preview-server` (skill local) para comparar maquetas, skills de diseño instaladas en el repo (`.claude/skills`): Impeccable, web-design-guidelines; ya instalados en el equipo: frontend-design (plugin), ui-ux-pro-max (plugin), ux-writing, design-preview-server, ux-heuristics (plugin wondelai).

**Spec:** `docs/plan-v2.md` §2 (2.1 brief, 2.2 tokens, 2.3 inventario de vistas y estados, 2.4 maquetas, 2.5 decisiones de componente, 2.6 puertas de calidad), §3.1 (skills del panel) y hito 1a de §6. Reglas heredadas de Noovo citadas en §2.1.

## Global Constraints

- Resoluciones objetivo: 1366×768 con barra lateral abierta y 1920×1080. Mínimo soportado 1280 px. Sin versión móvil.
- Tema claro: superficies blancas sobre gris suave, acento azul, profundidad por sombras en dos niveles. Prohibido: tarjetas dentro de tarjetas, degradados decorativos, iconos de relleno, logs técnicos en primer plano, «cargando» sin decir qué se espera.
- Reglas de Noovo que rigen aquí: toda pantalla con formulario cabe en 1366×768 con la barra lateral (título + primera fila + acción principal sin scroll); ningún desplegable cortado por barras fijas ni por la ventana; una línea reservada por campo para ayuda o error (CLS 0); párrafos explicativos fuera del formulario.
- Copy en español, revisado con `ux-writing`: frases cortas, sin jerga del coordinador en primer plano (nunca «outbox», «SSE», «worktree» en la interfaz; sí «espacio de trabajo», «conexión»).
- Ningún color, tamaño o sombra escrito a mano en maquetas o `/estilo`: todo por `var(--k-*)` de `design/tokens.css`. Una prueba lo comprueba.
- Contraste AA: texto normal ≥ 4.5:1 sobre su fondo; texto grande e iconos ≥ 3:1. Una prueba lo calcula.
- Sin dependencias npm. Sin frameworks en las maquetas (Ant Design llega en 1b; aquí solo se imitan sus proporciones: control de 32 px, radio 8).
- Cada tarea termina con `npm test` en verde y un commit (`docs:`, `feat:` o `test:`, en español).

## Review Focus

1. Texto sobre el color de acento (botón primario): el blanco sobre el azul elegido debe dar ≥ 4.5:1 o el azul se oscurece. (Prueba en Tarea 2.)
2. Tarjeta del Kanban con nombre de pack largo o con emoji (hay packs reales como «Nude_Tennis_Racket_🎾»): no debe romper la columna ni cortar sin elipsis. (Comprobación en Tarea 4 con ese texto en la maqueta.)
3. Franja del director en estado «Vigilante caído» debe distinguirse de «Nomos escuchando» sin depender solo del color (icono o texto). (Tarea 3 y 5.)
4. Columna del Kanban vacía y Catálogo sin indexar: estados vacíos con una acción, no un hueco. (Tarea 3 copy; Tarea 5 en `/estilo`.)
5. A 1366×768 con barra lateral de 248 px, el Drawer de tarea (720 px) no tapa la franja del director ni deja el Kanban ilegible debajo. (Captura en Tarea 4.)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `design/tokens.json` | Fuente única de tokens (colores, tipografía, radios, sombras, espaciado, estados) |
| `design/build-tokens.ts` | Genera `design/tokens.css` desde el JSON (`node design/build-tokens.ts`) |
| `design/tokens.css` | Variables CSS `--k-*` (generado; se versiona para que las maquetas abran sin paso previo) |
| `design/maquetas/a/index.html`, `b/index.html`, `c/index.html` | Tres direcciones del panel |
| `design/estilo.html` | Galería de componentes y estados (`/estilo`) |
| `docs/diseno/brief.md` | Brief del panel |
| `docs/diseno/estados.md` | Inventario de vistas × estados con copy |
| `docs/diseno-visual.md` | Dirección elegida, por qué, y reglas que de aquí en adelante rigen el panel |
| `docs/diseno/capturas-1a/` | Capturas de las tres maquetas y de `/estilo` a 1366×768 y 1920×1080 |
| `docs/diseno/auditoria-1a.md` | Resultado de las puertas de calidad |
| `docs/diseno/skills-instaladas.md` | Qué skills se instalaron en el repo, revisión y licencia |
| `tests/tokens.test.ts` | Tokens completos, CSS generado coherente, contraste AA, maquetas sin valores a mano |

---

### Task 1: Instalar las skills de diseño en el repo

**Files:**
- Create: `.claude/skills/` (contenido instalado), `docs/diseno/skills-instaladas.md`

- [ ] **Step 1:** Desde la raíz del repo: `npx impeccable install` (elige Claude Code) y `npx skills add vercel-labs/agent-skills --skill web-design-guidelines --agent claude-code`. Leer los `SKILL.md` instalados antes de usarlos.
- [ ] **Step 2:** Comprobar que ya están disponibles en el equipo: plugin `frontend-design`, plugin `ui-ux-pro-max`, skills locales `ux-writing` y `design-preview-server`, plugin `wondelai/skills` (`ux-heuristics`). Si `ux-heuristics` no responde a la invocación, instalar `/plugin marketplace add wondelai/skills` → plugin `ux-design`.
- [ ] **Step 3:** Escribir `docs/diseno/skills-instaladas.md`: tabla skill · origen · revisión o versión · licencia · para qué puerta se usa. Añadir `.claude/skills/*/node_modules/` al `.gitignore` si aparece.
- [ ] **Step 4: Commit** `docs: skills de diseño instaladas y registradas`.

---

### Task 2: Tokens

**Files:**
- Create: `design/tokens.json`, `design/build-tokens.ts`, `design/tokens.css`
- Test: `tests/tokens.test.ts`

**Interfaces:**
- Produces: `design/tokens.json` con esta forma y estos valores (decisiones del plan; el implementador no los cambia salvo que la prueba de contraste falle, y entonces oscurece el color hasta pasar y anota el valor final en `docs/diseno-visual.md`):

```json
{
  "color": {
    "primary": "#1F5EDB", "primaryHover": "#1A4FBA", "primaryText": "#FFFFFF",
    "bgLayout": "#F3F5F9", "bgContainer": "#FFFFFF", "bgSubtle": "#F7F8FB",
    "text": "#111827", "textSecondary": "#4B5563", "textTertiary": "#6B7280", "border": "#E5E7EB",
    "success": "#1E8E3E", "warning": "#B7791F", "error": "#C62828", "info": "#1F5EDB", "neutral": "#6B7280", "purple": "#6D4AFF"
  },
  "font": { "sans": "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif", "mono": "'JetBrains Mono', Consolas, monospace" },
  "size": { "xs": 12, "sm": 13, "md": 14, "lg": 16, "xl": 20, "xxl": 24 },
  "radius": { "sm": 6, "md": 8, "lg": 12 },
  "shadow": { "1": "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)", "2": "0 8px 24px rgba(16,24,40,.12)" },
  "space": [4, 8, 12, 16, 24, 32, 48],
  "layout": { "sidebar": 248, "sidebarCollapsed": 64, "header": 64, "drawer": 720, "control": 32 },
  "taskState": {
    "pendiente": "neutral", "preparada": "info", "implementando": "primary", "revisando": "purple", "probando": "warning",
    "integrando": "info", "cerrando": "warning", "done": "success", "bloqueada": "error", "decision": "warning"
  },
  "directorState": {
    "esperando": "neutral", "escuchando": "success", "atendiendo": "primary", "vigilanteCaido": "warning", "desconectado": "error"
  }
}
```

  Las fuentes IBM Plex Sans y JetBrains Mono se cargan desde Google Fonts solo en las maquetas y `/estilo` (una etiqueta `<link>`); el panel real decidirá en 1b si las empaqueta. Si no cargan, el fallback del sistema debe verse correcto.

- `design/build-tokens.ts`: lee el JSON y escribe `tokens.css` con `:root { --k-color-primary: #1F5EDB; … --k-size-md: 14px; --k-radius-md: 8px; --k-shadow-1: …; --k-space-3: 16px; --k-layout-sidebar: 248px; }` y una clase por estado: `.k-state-pendiente { --k-state: var(--k-color-neutral); }` y `.k-director-escuchando { --k-state: var(--k-color-success); }`.
- Exporta también `contrast(hexA: string, hexB: string): number` (relación WCAG 2.x) para la prueba.

- [ ] **Step 1: Escribir las pruebas**

```ts
test("tokens.json tiene todas las claves y 10 estados de tarea y 5 del director", () => { /* claves de arriba; Object.keys(taskState).length === 10; directorState 5 */ });
test("tokens.css generado coincide con el JSON", () => { /* ejecutar build; el CSS contiene --k-color-primary: #1F5EDB y --k-layout-drawer: 720px */ });
test("contraste AA", () => {
  assert.ok(contrast(color.text, color.bgContainer) >= 4.5);
  assert.ok(contrast(color.textSecondary, color.bgContainer) >= 4.5);
  assert.ok(contrast(color.primaryText, color.primary) >= 4.5);
  for (const k of ["success","warning","error","info","purple","neutral"]) assert.ok(contrast(color[k], color.bgContainer) >= 3);
});
test("las maquetas y /estilo no llevan colores ni sombras a mano", () => { /* para cada html en design/: ningún #RRGGBB ni rgba( fuera de tokens.css; permitido en <link> de fuentes */ });
```

- [ ] **Step 2: Ejecutar `npm test`**. Esperado: fallos por archivos inexistentes.
- [ ] **Step 3: Escribir `tokens.json`, `build-tokens.ts`, generar `tokens.css`**.
- [ ] **Step 4: Ejecutar `npm test`**. Esperado: verde (la prueba de maquetas pasa trivialmente hasta la Tarea 4).
- [ ] **Step 5: Commit** `feat: tokens de diseño del panel y generador de variables CSS`.

---

### Task 3: Brief e inventario de estados

**Files:**
- Create: `docs/diseno/brief.md`, `docs/diseno/estados.md`

- [ ] **Step 1: Escribir `brief.md`** con exactamente estas secciones: Propósito (sala de control que se mira mucho y se teclea poco), Usuario y pantalla (una persona, escritorio, 1366×768 con barra lateral y 1920×1080, mínimo 1280), Tono (claro, sombras en dos niveles, IBM Plex Sans + JetBrains Mono para logs/IDs/rutas), Reglas heredadas (las cuatro de Noovo), Antipatrones (los cinco). Una página; sin párrafos de relleno.
- [ ] **Step 2: Escribir `estados.md`**: una tabla por vista de §2.3 del plan v2 (Franja del director, Producción, Actividad, Entregas, Catálogo, Chat + detalle, Decisiones, Presupuesto, Capacidades, `/estilo`) con columnas Estado · Qué se ve · Copy exacto · Acción disponible. Copy fijado para la franja: `Servicio activo · esperando a Nomos`, `Nomos escuchando`, `Nomos atendiendo N mensajes`, `Vigilante caído · N mensajes en espera`, `Servicio desconectado` (coincide con el hito 0). Estados vacíos siempre con acción: Kanban vacío → «Escribe la primera petición a Nomos» + botón «Nueva petición»; Catálogo sin indexar → «Aún no se ha indexado nada» + botón «Indexar ahora».
- [ ] **Step 3: Pasar `ux-writing`** sobre todo el copy de `estados.md` y aplicar sus correcciones.
- [ ] **Step 4: Commit** `docs: brief del panel e inventario de vistas y estados`.

---

### Task 4: Tres maquetas comparadas

**Files:**
- Create: `design/maquetas/a/index.html`, `design/maquetas/b/index.html`, `design/maquetas/c/index.html`, `docs/diseno/capturas-1a/*.png`, `docs/diseno-visual.md`

Cada maqueta muestra la misma pantalla con datos realistas (usar nombres reales de la semilla futura: packs «Advanced Cel Shader Lite», «Free_Tennisball», «Nude_Tennis_Racket_🎾»; tareas «Importar pack Fab a cuarentena», «HUD de vida y maná», «Habilidad Meteorito»): barra lateral (248 px) con las 9 vistas, franja del director en estado `atendiendo`, Kanban de 8 columnas con 12 tarjetas (una `bloqueada`, una `decision`, una en `cerrando` con fallo), Drawer de tarea abierto (720 px) con las pestañas Resumen · Chat · Cambios · Pruebas · Assets · Timeline, y un panel de Catálogo con 6 entradas (una con licencia desconocida, una con `is_ai_forbidden`). Solo CSS; interacción nula salvo `:hover`.

Las tres direcciones difieren en un eje cada una y lo demás se mantiene:
- **A · Sala de control densa**: Kanban como protagonista, tarjetas compactas (56 px de alto, una línea de meta), sombra 1 en todo, barra lateral siempre abierta.
- **B · Tarjetas con aire**: tarjetas de 88 px con dos líneas de meta y avatar del responsable, sombra 2 en Drawer y tarjetas activas, barra lateral colapsable a 64 px.
- **C · Actividad protagonista**: carriles de Actividad en la mitad superior (Nomos, Codex, Claude Code, Meshy, Blender, Unreal, builds) y Kanban compacto debajo; franja del director integrada en la cabecera.

- [ ] **Step 1: Cargar las skills** `frontend-design` y `ui-ux-pro-max` (patrón dashboard) antes de maquetar; leer `brief.md` y `estados.md`.
- [ ] **Step 2: Escribir las tres maquetas** usando solo `var(--k-*)`.
- [ ] **Step 3: Compararlas** con `design-preview-server` a 1366×768 y 1920×1080; guardar capturas `a-1366.png`, `a-1920.png`, `b-…`, `c-…` en `docs/diseno/capturas-1a/`. Comprobar en cada una: título + primera fila + acción principal del formulario de nueva petición visibles sin scroll a 1366×768; Drawer no tapa la franja; nombre con emoji no rompe la columna.
- [ ] **Step 4: Elegir una dirección** y escribir `docs/diseno-visual.md`: la elegida, tres razones, qué se toma prestado de las otras dos, y las reglas de aquí en adelante (densidades, sombras, dónde va la franja, anchos). Si ninguna cumple la regla de 1366×768, se corrige la elegida hasta que cumpla y se recaptura.
- [ ] **Step 5: Ejecutar `npm test`** (la prueba de «sin colores a mano» ahora muerde). Esperado: verde.
- [ ] **Step 6: Commit** `feat: tres maquetas del panel y dirección visual elegida`.

---

### Task 5: Página `/estilo`

**Files:**
- Create: `design/estilo.html`
- Capturas: `docs/diseno/capturas-1a/estilo-1366.png`, `estilo-1920.png`

Contenido, en este orden y con la dirección elegida: tokens (muestras de color con su nombre y valor, escala tipográfica, radios, las dos sombras, espaciado); botones (primario, secundario, fantasma, peligro; normal, hover, foco, deshabilitado, cargando); campos (texto, área, selector; normal, foco, error con su línea reservada, ayuda); las 10 tarjetas de estado del Kanban; los 5 estados de la franja del director; tabla del Catálogo con fila normal, licencia desconocida e `is_ai_forbidden`; Drawer vacío y con contenido; estados vacíos de Kanban y Catálogo con su botón; toast y Decisión con dos opciones.

- [ ] **Step 1: Escribir `estilo.html`** con un índice lateral fijo y anclas por sección; solo `var(--k-*)`.
- [ ] **Step 2: Capturas** a 1366×768 y 1920×1080.
- [ ] **Step 3: Ejecutar `npm test`**. Esperado: verde.
- [ ] **Step 4: Commit** `feat: página /estilo con todos los componentes y estados`.

---

### Task 6: Puertas de calidad del hito

**Files:**
- Create: `docs/diseno/auditoria-1a.md`

- [ ] **Step 1:** Auditoría `web-design-guidelines` sobre la maqueta elegida y `estilo.html`; anotar hallazgos archivo:línea y corregir los de accesibilidad.
- [ ] **Step 2:** `/impeccable critique` sobre la maqueta elegida; aplicar lo que no contradiga el brief; después `/impeccable polish`.
- [ ] **Step 3:** `ux-heuristics` Quick Diagnostic sobre la maqueta elegida (tablero, Drawer, Catálogo).
- [ ] **Step 4:** Recorrido con teclado en `estilo.html`: foco visible en botones y campos; orden de tabulación lógico. Anotar.
- [ ] **Step 5:** Escribir `auditoria-1a.md`: tabla puerta · herramienta · hallazgos · corregidos · pendientes, y enlaces a las capturas finales. Recapturar lo que cambió.
- [ ] **Step 6:** `npm test` en verde. Commit `docs: auditoría de diseño del hito 1a`.

---

## Self-review (hecho al escribir el plan)

- Cobertura del spec: §2.1 → Tarea 3; §2.2 → Tarea 2; §2.3 → Tareas 3 y 5; §2.4 → Tarea 4; §2.5 (decisiones de componente) se respetan en maquetas y `/estilo` (Kanban sin arrastrar, carriles en grid, Drawer para logs); §2.6 → Tarea 6 (motion y Emil quedan para el hito 7, como dice el plan); §3.1 → Tarea 1. Criterio de salida del hito: maqueta legible a ambas resoluciones y los estados de §2.3 dibujados → Tareas 4 y 5.
- Consistencia: nombres de tokens `--k-*`, clases `.k-state-*` y `.k-director-*`, copy de la franja idéntico al del hito 0.
- Review Focus: 1 → prueba de contraste (Tarea 2); 2 y 5 → comprobaciones de la Tarea 4; 3 → copy e icono en Tareas 3 y 5; 4 → Tareas 3 y 5.
- Proporción: el plan fija valores, estructura y comprobaciones; la composición visual la hace el implementador con las skills indicadas.
