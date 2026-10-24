# Plan de desarrollo de Nomos · v2 (diseño, skills y pipeline completo)

Revisión del plan del 22 de octubre de 2026 (`nomos-unreal-ai-plan.md`). Conserva la arquitectura, roles, ciclo de tareas e integraciones de v1 y añade lo que faltaba:

- el diseño del panel como fase con entregables y puertas de calidad;
- el stack de skills y herramientas de **todo el pipeline** (panel web, editor Unreal, gameplay, arte 3D, personajes y animación, mundo, VFX, audio, UI/UX de videojuegos, QA, build y entrega), con lo que ya tienes instalado separado de lo que hay que instalar o desarrollar;
- el enrutado de skills por rol de Nomos;
- un módulo de catálogo de assets con la política «buscar antes de generar», la política de autonomía, y ajustes de seguridad, presupuesto, decisiones y datos semilla.

Lo que no se menciona aquí sigue como en v1. Todo es plan, no implementación probada. Las cifras de popularidad de skills varían según el directorio consultado y no se citan como dato.

## 0. Veredicto sobre v1

Lo que está bien y se mantiene:

- La experiencia de uso (invocar `/nomos`, director persistente, panel como lugar de operación) es coherente con el patrón del dojo ya probado (`serve.py` + `vigila.py` + Monitor rearmado).
- DONE exige evidencia y cierre de recursos; Nomos no concede DONE por el mensaje final de un worker. Es la decisión más importante del plan.
- Idempotencia, outbox, reconciliación antes de reintentar trabajos pagos y retención propia de assets de Meshy: cubre los fallos caros.
- Paralelismo específico de Unreal (reservas por asset, un escritor por editor, cola de PIE/importación) es realista.
- Hitos ordenados por riesgo y catorce pruebas de aceptación verificables.

Lo que falta y motiva v2:

1. El diseño es un adjetivo («Ant Design claro, acento azul»), no una fase. Sin brief, tokens, inventario de estados, maquetas ni aceptación visual. Repite el error ya corregido en Noovo («muy blanco y demasiado plano»).
2. No hay stack de skills: ni para construir el panel ni para los workers. En tu equipo ya hay 27 skills `ue-*`, un pack completo de Blender y skills de UI de videojuegos; el plan no las usa.
3. No hay módulo de assets: v1 genera con Meshy pero nunca pregunta qué ya tienes en Fab ni cómo extraerlo e integrarlo en Unreal. Gasta créditos antes de buscar.
4. Faltan vistas que la propia lógica exige: estado del director, bandeja de decisiones, presupuesto, capacidades, catálogo.
5. El servicio HTTP local no define autenticación.
6. El panel no puede diseñarse ni probarse sin Unreal, Meshy y Codex funcionando: hace falta una producción semilla.
7. Componentes sin decisión (Kanban, carriles, visor GLB, chat) y skill `/nomos` sin estructura ni criterio de calidad.

## 1. Qué cambia respecto a v1

| Área | v1 | v2 | Por qué |
|---|---|---|---|
| Diseño del panel | Un párrafo | Hito 1a: brief, tokens, inventario de estados, maquetas comparadas, `/estilo` | Evitar el panel plano y rehacerlo tarde |
| Skills | No aparecen | §3 catálogo por etapa del pipeline; §4 enrutado por rol en `start_worker` | Las skills son parte del producto |
| Assets | Meshy genera | §5.6 catálogo local, extracción de tu biblioteca Fab en tres niveles e importación a Unreal; política buscar → Fab propio → CC0 → generar | Tienes muchos assets en Fab: hay que poder sacarlos e integrarlos |
| Autonomía | Implícita | §5.7 política explícita: qué hace solo, qué pasa por Decisión | Lo pediste en el contexto del ecosistema |
| Vistas | 4 | 10 (+ director, Decisiones, Presupuesto, Capacidades, Catálogo, `/estilo`) | Las exige la lógica de v1 |
| Seguridad | Secretos fuera del navegador | + bind 127.0.0.1, token por arranque, CORS, CSP | Servicio con acceso a Git y procesos |
| Datos | «Datos de prueba» | `seed` determinista | Diseñar y probar sin integraciones |
| Componentes | A componer | §2.5 cerrado | Menos código y dependencias |
| Unreal MCP | «Capacidades del editor mediante MCP» | Un solo MCP: el oficial de Epic; alternativas evaluadas y no adoptadas | Evitar herramientas duplicadas |
| Skill Nomos | Comandos listados | Estructura tipo dojo + skillsmith ≥ 95 | Nacer con la calidad del dojo |

## 2. Diseño del panel como fase

> **Actualización 2026-10-23.** La dirección visual de esta sección (tema claro, Ant Design, Kanban) queda sustituida por el plan `docs/superpowers/plans/2026-10-23-hito8-interfaz-viva.md`: panel oscuro con la apariencia de Vercel (tokens oficiales `vercel-brand.css`, shadcn/ui, Geist), sin Next.js, sin tablero tipo Jira, y con una capa de «sensación» obligatoria: toda acción responde en la misma pantalla y toda redirección se percibe mediante View Transitions. El inventario de vistas y estados (§2.3), la decisión de no arrastrar y soltar y las puertas de calidad (§2.6) siguen vigentes; los tokens, el tema claro y la elección de Ant Design no.

### 2.1 Brief (una página, hito 1a)

- Propósito: sala de control de una producción Unreal dirigida por IA. Se mira mucho y se teclea poco.
- Usuario y pantalla: una persona, escritorio. Objetivo 1366×768 con barra lateral abierta y 1920×1080. Mínimo 1280 px; sin móvil en v1.
- Tono: claro, superficies blancas sobre gris suave, acento azul, profundidad por sombras en dos niveles, tipografía elegida a propósito (decisión del brief, no default), monoespaciada para logs, IDs y rutas.
- Reglas heredadas de Noovo (confirmadas por ti el 2026-10-19 y 2026-10-20): nada «muy blanco y demasiado plano»; toda pantalla con formulario cabe en 1366×768 con barra lateral (título + primera fila + acción principal sin scroll); ningún desplegable cortado; una línea reservada por campo para ayuda o error (CLS 0).
- Antipatrones: tarjetas dentro de tarjetas, degradados decorativos, iconos de relleno, logs técnicos en primer plano, «cargando» sin decir qué se espera.

### 2.2 Tokens (Ant Design `ConfigProvider`)

Un archivo `theme.ts` mostrado en `/estilo`: `colorPrimary`, `colorBgLayout`, `colorBgContainer`, `borderRadius`, dos sombras, familias de texto y código, escala tipográfica de 5 tamaños, estados semánticos para los 10 estados de tarjeta y los 5 del director. Ant Design X v2 hereda el tema si pasa la comprobación de compatibilidad.

### 2.3 Inventario de vistas y estados

| Vista | Qué muestra | Estados a diseñar |
|---|---|---|
| Franja del director (siempre visible) | Servicio · listener · última recepción confirmada · trabajo en curso; Pausar/Reanudar | Conectado, escuchando, trabajando, listener expirado (rearmando), desconectado |
| Producción (Kanban) | 8 columnas de v1; tarjeta con responsable, dependencias, run, worktree, skills cargadas, última actividad, pruebas | Vacío, bloqueada, esperando decisión, Cerrando con fallo |
| Actividad (carriles) | Nomos, Codex, Claude Code, Meshy, Blender, Unreal, builds; filtro por tarea/run; causa → efecto | Vacío, sin resultados, hueco por desconexión |
| Entregas (galería) | Modelos, texturas, capturas, vídeos, antes/después, builds; visor GLB | Job en progreso, enlace vencido con copia propia, importación fallida |
| Catálogo (nueva) | Assets propios e indexados: origen, estado, licencia, miniatura, compatibilidad; «Preparar para Unreal» crea tarea | Sin indexar, indexando, licencia desconocida, instalado en proyecto |
| Chat + detalle de tarea | Chat central; Drawer con Resumen, Chat, Cambios, Pruebas, Assets, Timeline; «Pedir cambios al responsable» | No confirmado, pendiente, continuación tras DONE |
| Decisiones (nueva) | Bloqueos con evidencia y opciones; cierra con elección registrada | Vacía, N pendientes, caducada por cambio de contexto |
| Presupuesto (nueva) | Gasto por tarea y proveedor (créditos Meshy, tokens, minutos de build); límites | Sin límite, agotado |
| Capacidades (nueva) | Adaptadores y skills detectados y comprobados por workspace | Ausente, detectado, comprobado, roto |
| `/estilo` (desarrollo) | Tokens y todos los componentes en todos sus estados | Galería de referencia; sustituye a Storybook |

### 2.4 Maquetas antes de código

Dos o tres direcciones HTML (tablero + franja + tarjeta abierta + catálogo) comparadas con `design-preview-server` a 1366×768 y 1920×1080. Se elige una y se documenta en `docs/diseno-visual.md`. Opcional: `html_to_figma` para conservarla en Figma.

### 2.5 Decisiones de componente

| Pieza | Decisión | Se descarta y cuándo revisarlo |
|---|---|---|
| Kanban | `Card` por columna, sin arrastrar: las tarjetas cambian por eventos del coordinador; nadie se salta la evidencia moviéndolas | dnd-kit, si surge reordenar prioridad a mano |
| Carriles de actividad | Grid CSS; `Timeline` de antd solo dentro del Drawer | Gantt, si hace falta zoom temporal |
| Visor GLB | `<model-viewer>` (una etiqueta) | three.js, si se necesita A/B sincronizado |
| Chat | Ant Design X v2 si compila con antd v6; si no, `Card` + `Input.TextArea` | Librería externa |
| Logs | `Drawer` con `<pre>` monoespaciado y filtro | xterm.js, solo si hay que interactuar |
| Catálogo | `Table` + `Image.PreviewGroup` + filtros; búsqueda con SQLite FTS5 | Embeddings, cuando FTS no baste |
| Paleta de comandos | `Ctrl+K` en hito 7 | — |
| Gráficos | Cifras + `Progress`; sin librería | Recharts, cuando haya histórico |

### 2.6 Puertas de calidad de diseño (cada hito desde 1a)

1. Auditoría `web-design-guidelines` sobre los archivos tocados.
2. `/impeccable critique` antes de cerrar la vista; `/impeccable polish` al final del hito; `/impeccable harden` en hito 7.
3. `ux-heuristics` Quick Diagnostic por pantalla nueva.
4. Capturas 1366×768 con barra lateral y 1920×1080 en `docs/capturas-<hito>/`.
5. Contraste AA, foco visible, orden de tabulación en Kanban, Drawer y Catálogo.
6. Copy de estados vacíos, errores y bloqueos con `ux-writing`.
7. Motion solo en cambios de estado; pase con `emil-design-eng` / `review-animations` en hito 7.

## 3. Skills y herramientas de todo el pipeline

Criterios: adopción amplia, repositorio público con licencia leída, y aportación distinta entre sí. Procedimiento de instalación: el del catálogo del jam (`docs/third-party-skills.md`): copia de inspección, revisión fijada, carpeta completa, `LICENSE.upstream`, sin ejecutar instaladores sin leerlos. Las skills del panel van al repositorio de Nomos; las de producción, al repositorio de cada juego (o al workspace de integración de Nomos). No se instalan todas a la vez: cada hito activa las de su etapa.

Estados: **instalado** (ya en `~/.claude/skills` o como plugin en tu equipo), **instalar** (existe, fijar revisión), **desarrollar** (propuesta propia), **evaluado, no adoptado**, **no verificado**.

### 3.1 Panel web de Nomos (diseño y UI)

| Skill | Fuente | Para qué | Estado | Cuándo |
|---|---|---|---|---|
| frontend-design | Anthropic, plugin oficial | Dirección estética inicial; evita los looks genéricos de IA | Instalado | 1a |
| ui-ux-pro-max | davila7 | Paletas, pares tipográficos, patrones de dashboard | Instalado | 1a |
| frontend-design-studio | Local | Del brief a páginas con identidad consistente | Instalado | 1a-1b |
| Impeccable | pbakaus/impeccable, Apache 2.0 | `init`, `shape`, `critique`, `audit`, `polish`, `harden`, `onboard`, `clarify`, `animate` | Instalar: `npx impeccable install` en la raíz del repo de Nomos | Desde 1b |
| web-design-guidelines | vercel-labs/agent-skills | Auditoría de accesibilidad/UX/UI (descarga reglas de GitHub en cada uso) | Instalar: `npx skills add vercel-labs/agent-skills --skill web-design-guidelines --agent claude-code` | Cada puerta |
| antd (oficial) | ant-design/antd-skill, MIT | API y tokens de antd v6 sin red; `ant-design` cubre Ant Design X v2 | Instalar: `npx skills add ant-design/antd-skill` | Desde 1b |
| emilkowalski/skills | Emil Kowalski, MIT | `emil-design-eng`, `animate`, `find-animation-opportunities`, `review-animations`, `break-ui` | Adoptado en Noovo; instalar igual: `npx skills@latest add emilkowalski/skills` | 7 |
| ux-heuristics, microinteractions | wondelai/skills (plugin `ux-design`) | Quick Diagnostic; microinteracciones con propósito | Usado en Noovo; `/plugin marketplace add wondelai/skills` | Cada pantalla |
| form-design | El que ya usas en Noovo (verificar repo exacto; candidato público owl-listener/designer-skills) | Formulario de tarea y Capacidades | Verificar e instalar | 2 |
| ux-writing | Local | Copy de estados en español | Instalado | Cada puerta |
| design-preview-server | Local | Comparar maquetas | Instalado | 1a |
| dataviz | Built-in | Si Presupuesto o Actividad llegan a necesitar gráficos | Disponible | Solo si §2.5 se revisa |
| Figma MCP | Oficial | Conservar la maqueta elegida | Conectado | 1a, opcional |
| superpowers | Anthropic plugin | brainstorming → writing-plans → TDD → verification | Instalado | Todo |
| skillsmith | `npx @lozadaa/skillsmith` | Calidad de la skill `/nomos` | Lo usaste en el dojo | Antes de 2 y al cerrar |

Descartadas: Taste y Hallmark (landing pages), `canvas-design`/`algorithmic-art`, `ui-skills` (solapa con ui-ux-pro-max y antd-skill). Si el panel queda soso, `/impeccable bolder` antes que otra skill.

### 3.2 Conexión y operación del editor Unreal

| Pieza | Fuente | Para qué | Estado | Notas |
|---|---|---|---|---|
| Unreal Engine MCP (plugin de Claude Code: `unreal-mcp`, `unreal-skill`, `create-toolset`) | EpicGames/unreal-engine-skills-for-claude-code-plugin, MIT | Operar el editor: actores, Blueprints, materiales, Niagara, Sequencer, UMG, animación, pruebas; crear toolsets propios (los de Epic son módulos Python registrados con `toolset_registry.tool_call`); registrar skills dentro del motor (`AgentSkillToolset`) | Lado motor ya instalado: tu UE 5.8.3 trae `ModelContextProtocol`, `ToolsetRegistry` y 27 toolsets (`EditorToolset` con `import_asset`, `find_assets`, `move`, `duplicate`, `get_metadata_tags`, `import_file` de mallas; `SemanticSearchToolset`; `MetaHumanGenerator`; `UMGToolSet`; `NiagaraToolsets`; `PCGToolset`; `GASToolsets`; `AutomationTestToolset`; `SequencerAnimMixerToolset`; `StateTreeToolset`). Falta instalar el plugin de Claude Code | Habilitar `ModelContextProtocol` y `AllToolsets`, `ModelContextProtocol.StartServer` y `GenerateClientConfig ClaudeCode`; experimental. El hook del README exige Git Bash en Windows |
| Python Editor Scripting + UAT | Epic | Respaldo cuando MCP no cubra una operación; empaquetado | Disponible con el motor | Capacidades muestra qué vía está activa |
| ue-project-context | quodsoler (local) | `.agents/ue-project-context.md` por workspace: versión, módulos, plugins, convenciones | Instalado | Primera skill que carga todo worker |
| Flopperam/Aura MCP, sam-david/unreal-mcp | Comunidad | Herramientas alternativas (widget_inspect/edit, 127 tools) | Evaluado, no adoptado | Un solo MCP de Unreal en v1; reevaluar solo si el oficial no cubre una operación concreta |
| ue5-mcp (ibrews) | Comunidad | Manual de operaciones y lector de Blueprints | Evaluado | Solo como lectura de referencia; no suministra servidor |
| Awesome Unreal AI Tools | Índice | Mantener el inventario | Referencia | No es integración |

### 3.3 Gameplay, C++ y Blueprints

| Skill | Fuente | Para qué | Estado |
|---|---|---|---|
| ue-cpp-foundations, ue-gameplay-framework, ue-actor-component-architecture, ue-module-build-system, ue-data-assets-tables, ue-serialization-savegames | quodsoler (local, 27 skills `ue-*`) | Base de cualquier tarea de implementación | Instalado |
| ue-input-system, ue-character-movement, ue-physics-collision, ue-ai-navigation, ue-state-trees, ue-mass-entity, ue-networking-replication, ue-async-threading, ue-game-features, ue-editor-tools | quodsoler | Sistemas según la tarea | Instalado |
| ue-gameplay-abilities (GAS) | quodsoler | Habilidades reutilizables: coste, daño, estados, animación, VFX y pruebas en una sola tarea | Instalado |
| unreal-gas, unreal-blueprint-codegen, unreal-best-practices | maystudios/claude-skills, MIT | Complementos: generar Widget Blueprints desde C++ de editor; GAS avanzado | Instalar solo si GAS o codegen entran en el juego |
| game-developer | Jeffallan/claude-skills | Generalista multiengine | Evaluado, no adoptado (ejemplos Unity) |

### 3.4 Arte 3D, generación y preparación de assets

| Pieza | Fuente | Para qué | Estado | Notas |
|---|---|---|---|---|
| Meshy MCP oficial | `@meshy-ai/meshy-mcp-server` (meshy-dev/meshy-mcp-server) | `meshy_text_to_3d`, `meshy_image_to_3d`, `meshy_remesh`, `meshy_retexture`, `meshy_rig`, `meshy_animate`, text-to-motion, `meshy_list_tasks`, `meshy_cancel_task`, `meshy_download_model` (24 herramientas) | Instalar; `MESHY_API_KEY` en el servicio, no en el navegador | Devuelve task id; el adaptador de v1 §8 reconcilia con `meshy_get_task_status`. Retención de 3 días: copiar siempre |
| Blender MCP | Conectado en tu equipo | Ejecutar las skills de Blender | Conectado | — |
| Pack Blender | Local: blender-director, blender-modeler, retopology, uv-workflow, texture-workflow, materials, asset-optimization, lod-pipeline, collision-proxy, export-pipeline, unreal-export, qa-review, lookdev, rendering, lighting, sculpting, hard-surface, prop-artist, character-artist, creature-artist, vehicle-artist, environment-artist, vegetation-artist, set-dressing, scene-assembly, geometry-nodes, procedural-modeling, physics-sim, cloth-sim, hair-groom, rigging, animation, vfx-fx, compositing, camera-cinematography | Preparar lo que llega de Meshy/Fab/CC0: escala, pivote, LOD, UCX, materiales, FBX para Unreal; QA con capturas | Instalado | `blender-director` enruta al resto; `unreal-export` es la salida estándar |
| Estilos y moods | Local: lowpoly-style, stylized-style, hand-painted-style, pixel-art-style, realistic-style, isometric-style, cartoon-style, anime-style, voxel-style, retro-8bit/16bit, psx-horror-style y ~25 más; genre-* | Dirección artística por juego; el brief del juego fija uno y Nomos lo pasa a cada worker de arte | Instalado | Consistencia: un estilo por workspace, en `ue-project-context` |
| ue-asset-intake | Propuesta del jam | Procedencia, licencia, escala, colisión, presupuesto de polígonos | Desarrollar (esqueleto existe) | Se convierte en el contrato de «Preparar para Unreal» del Catálogo |
| ue-materials-rendering | quodsoler | Materiales e instancias en Unreal | Instalado | — |
| Substance 3D Sampler, ComfyUI | Adobe / comunidad | Texturas y concept art con API | Evaluado, fase posterior | Solo si el estilo del juego lo exige; ComfyUI tiene API HTTP |

Fuentes de assets (se indexan en el Catálogo, §5.6):

| Fuente | Qué aporta | Integración | Licencia |
|---|---|---|---|
| Fab (tu biblioteca) | Compras, packs, personajes, VFX, escenarios, Megascans | Extracción en tres niveles e importación a Unreal, detallado en §5.6 | Por asset, con `is_ai_forbidden` registrado; no permite redistribuir ni entrenar IA |
| Poly Haven | Modelos, HDRI, texturas | API pública; fuente gratuita preferida | CC0 |
| ambientCG | Materiales PBR | API pública `api/v3/assets` | CC0 |
| Kenney, Quaternius | Kits UI/objetos/audio; personajes y escenarios estilizados | Descarga y catálogo | Revisar por pack |
| Sketchfab, BlenderKit, itch.io | Variedad; materiales para Blender; packs indie | Según disponibilidad y licencia por item | Por item |
| 3D Asset Server | Búsqueda unificada en 23 fuentes con licencia por resultado | Conector experimental del Catálogo | Apache-2.0 (el servidor) |
| Mixamo | Animaciones base y autorig humanoide | Archivos exportados a mano; sin automatización | Adobe |

### 3.5 Personajes y animación

| Pieza | Fuente | Para qué | Estado | Notas |
|---|---|---|---|---|
| Meshy rig / animate / text-to-motion | Meshy MCP | Rigging y clips de 2-10 s para criaturas y héroes | Con Meshy | Créditos por clip: pasa por Presupuesto |
| ue-animation-system | quodsoler | AnimInstance, montages, notifies, blend spaces, root motion, IK Retargeter | Instalado | — |
| rigging, animation, hair-groom, cloth-sim | Pack Blender | Ajustes de esqueleto y simulaciones antes de exportar | Instalado | — |
| Motion Matching + Game Animation Sample | Epic | Locomoción sin transiciones manuales | Disponible con el motor | Punto de partida para juegos de personaje |
| MetaHuman: toolset `MetaHumanGenerator` + Character Python API | Epic (en tu UE 5.8.3: plugins MetaHumanCharacter, Animator, Crowd, LiveLink y el toolset) | El toolset ya expone create, set_body_shape, set_skin_tone, set_eye_color, begin/end_edit y finalize; la Python API (`MetaHumanCharacterEditorSubsystem`, scripts de ejemplo en `Engine/Plugins/MetaHuman/MetaHumanCharacter/Content/Python/`) cubre esculpir, conformar y auto-rig | Instalado con el motor; toolset propio con `create-toolset` solo para lo que el oficial no cubra | Gap conocido en 5.8.0 (`RemoveBodyRig` no expuesto; comprobar en tu 5.8.3). Partes del flujo dependen de servicios en la nube de Epic |
| MetaHuman Animator | Epic | Facial y diálogos | Fase posterior | Python/Blueprints |
| DeepMotion | API REST bajo solicitud | Vídeo → animación | Evaluado, fase posterior | Conector propio cuando haya acceso |
| Cascadeur, Rokoko Vision | Herramientas de escritorio | Pulir ataques; captura con cámara | Fuera de automatización: paso manual documentado | Nomos crea la tarea y espera el archivo |

### 3.6 Mundo, VFX y audio

| Pieza | Fuente | Para qué | Estado |
|---|---|---|---|
| ue-procedural-generation (PCG), ue-world-level-streaming | quodsoler | Arenas y escenarios por semilla; streaming | Instalado |
| environment-artist, set-dressing, vegetation-artist, scene-assembly | Pack Blender | Kits modulares y composición | Instalado |
| ue-niagara-effects, vfx-fx, lighting | quodsoler / pack Blender | Fuego, hielo, impactos; iluminación | Instalado |
| ue-sequencer-cinematics, camera-cinematography | quodsoler / pack Blender | Cinemáticas, tráiler con Movie Render Queue | Instalado |
| ue-audio-system | quodsoler | MetaSounds, atenuación, buses, Quartz | Instalado |
| elevenlabs/skills (sound-effects, TTS) | ElevenLabs, oficial | Voces y efectos por descripción; WAV 48 kHz | Instalar: `npx skills add elevenlabs/skills`; clave en el servicio | 
| Freesound, Sonniss GDC | Bibliotecas | Efectos comunes sin gastar créditos | Indexar en Catálogo con licencia |
| Houdini Engine, Suno/AIVA, FMOD, Convai, NVIDIA ACE | Terceros | Mundos procedurales avanzados, música adaptativa, NPC conversacionales | Fuera de v1 (ver §9) |

### 3.7 UI/UX de videojuegos (UMG y Common UI)

| Pieza | Fuente | Para qué | Estado |
|---|---|---|---|
| ue-ui-umg-slate | quodsoler | Ciclo de widgets, BindWidget, foco/input, Common UI, MVVM, animación UMG | Instalado |
| game-ui-design | Local | Menús, HUD, opciones, diálogo, dificultad; análisis de 15+ juegos; skills `genre-*` por género | Instalado |
| game-ui-ux | gamedev-skills/awesome-gamedev-agent-skills, Apache-2.0 | Escala, anclajes, safe areas, navegación con mando, HUD por eventos (neutral de motor) | Instalar |
| ux-writing | Local | Textos de UI del juego | Instalado |
| game-ui-art-director | **Desarrollar** (nueva) | Fija por juego tipografía, paleta, espaciado, iconografía y jerarquía coherentes con el estilo 3D elegido; escribe `docs/ui-direction.md`; todo worker de UI la lee primero | — |
| ue-umg-ui | Propuesta del jam (**desarrollar**; absorbe «umg-screen-builder» y «ui-interaction-polish» del contexto) | Pantallas concretas: estados, widgets, navegación, hover/pressed/disabled, sonidos y transiciones | Esqueleto existe |
| ue-visual-qa | Propuesta del jam (**desarrollar**; absorbe «screenshot-ui-review» y «hud-readability-audit») | Captura real en PIE a 1280×720 y 1920×1080, contraste, escalado, superposiciones, foco, recorrido con mando; informe con fallos concretos | Esqueleto existe |
| Skill registrada en Unreal | `unreal-skill` de Epic (`AgentSkillToolset`) | Que la dirección de UI viaje con el proyecto como UAsset/Python | Opcional, hito 5 |

Ciclo obligatorio de toda tarea de UI (lo verifica el coordinador, no el worker): crear widget → PIE → captura con la UI visible → `ue-visual-qa` → corregir → repetir hasta criterios. Nada se declara terminado sin la captura final en Entregas. Figma queda como origen opcional de maquetas; el sistema de diseño del juego vive en `docs/ui-direction.md` y en widgets/estilos compartidos.

### 3.8 QA, rendimiento, build y entrega

| Pieza | Fuente | Para qué | Estado |
|---|---|---|---|
| ue-testing-debugging | quodsoler | Automation Framework, Functional Tests, CQTest, Insights, depuración visual | Instalado |
| Screenshot Comparison Tool, Data Validation | Epic | Regresión visual con tolerancias; validación de assets | Disponible con el motor |
| Gauntlet | Epic | Sesiones de prueba automatizadas, varios clientes | Fase posterior (hito 7+) |
| Unreal Insights, RenderDoc | Epic / comunidad | FPS, memoria, LOD, texturas | Insights en hito 7; RenderDoc manual |
| unreal-packaging | gamedev-skills | Cook/package, `RunUAT BuildCookRun`, DataValidation | Instalar |
| ue-test-package, ue-submission, ue-jam-director | Propuestas del jam | Smoke tests + paquete; créditos, reglas y entrega; alcance y recortes | Desarrollar (esqueletos existen) |
| game-jam | gamedev-skills | Alcance, vertical slice, margen de entrega | Instalar; se usa con `ue-jam-director` |
| `scripts/package-win64.ps1` | Jam | Empaquetado Win64 | Existe; adaptar |
| Git + LFS para binarios | — | Revertir cambios de los workers sin perder trabajo | Decidir LFS o Perforce por tamaño; `.gitattributes` del jam |

No verificado: el pack «Unreal Engine Skills de Buckley Builds (62 skills, Ultra Dynamic Sky/Weather)» no aparece en ninguna fuente consultada; no se adopta hasta tener repositorio y licencia.

## 4. Enrutado de skills por rol de Nomos

`start_worker` lleva el campo `skills` (lista que el worker carga al arrancar en su worktree) y `style` (estilo artístico del workspace). Capacidades muestra qué skills tiene disponible cada workspace; el primer evento del worker confirma las cargadas.

| Rol / tipo de tarea | Skills | Evidencia adicional |
|---|---|---|
| Implementación C++/Blueprint | ue-project-context, ue-cpp-foundations, ue-gameplay-framework, ue-module-build-system + la skill del sistema (input, movement, GAS, state-trees…) | Compilación y pruebas de v1 §9 |
| Habilidad jugable («Crea Meteorito») | ue-gameplay-abilities, ue-niagara-effects, ue-animation-system, ue-audio-system, ue-ui-umg-slate (si hay carta o HUD) | Prueba funcional de la habilidad, captura del VFX, coste/daño verificados |
| UI del juego | game-ui-art-director (lee `docs/ui-direction.md`), ue-ui-umg-slate, game-ui-design, game-ui-ux, ue-umg-ui, ux-writing, ue-visual-qa | Ciclo §3.7 completo con capturas |
| Arte: buscar o generar asset | Catálogo (§5.6) → blender-director → estilo del workspace → asset-optimization, collision-proxy, lod-pipeline, unreal-export, qa-review, ue-asset-intake | Procedencia, licencia, escala, pivote, colisión, importación comprobada |
| Personaje y animación | Meshy rig/animate o toolset MetaHuman (si 5.8+), rigging, ue-animation-system (retarget) | Clip reproducido en PIE; retarget sin deformaciones en captura |
| Nivel y mundo | environment-artist, set-dressing, ue-procedural-generation, ue-world-level-streaming, lighting | Carga, recorrido, semilla, rendimiento |
| Audio | ue-audio-system, elevenlabs/skills, Catálogo (Freesound/Sonniss) | Reproducción real en PIE |
| QA Unreal | ue-testing-debugging, ue-visual-qa, ue-test-package, unreal-packaging | Informe por commit, mapa, configuración |
| Revisor | code-review, superpowers:requesting-code-review, architect-review en cambios de arquitectura | Observaciones ligadas a una revisión |
| Alcance (game jam) | ue-jam-director, game-jam | Brief, recortes y siguiente entrega jugable |
| Panel de Nomos | §3.1 según la puerta | §2.6 |

## 5. Ajustes de arquitectura

### 5.1 Seguridad del servicio local

Escucha solo en `127.0.0.1`; token aleatorio por arranque que la skill pasa una vez en la URL de apertura y el panel guarda en `sessionStorage`; toda petición y el SSE lo llevan en cabecera; sin token, 401. CORS cerrado al origen del panel; CSP sin scripts externos. Las claves (Meshy, ElevenLabs) viven en el servicio y el almacén seguro del sistema. Cada comando que lanza procesos o toca Git registra quién lo pidió.

### 5.2 Presupuesto como entidad

`Budget` por workspace y por tarea (créditos Meshy, tokens por proveedor, créditos ElevenLabs, minutos de build) y `Spend` atómico por run/job. `request_asset_job` y `start_worker` comprueban antes de ejecutar; agotado, Nomos crea una Decisión.

### 5.3 Decisión como entidad

`Decision` con tarea, motivo, evidencia, opciones propuestas, elegida, quién y cuándo. Caduca si cambia el contexto (nuevo commit, job terminado) y Nomos la regenera. Las alternativas creativas («te presento tres candidatos») también son Decisiones: con miniaturas en la bandeja.

### 5.4 Producción semilla

`nomos seed`: workspace de demo con 12 tareas en todas las columnas, tres runs, un job Meshy simulado, 30 entradas de catálogo con licencias variadas, una Decisión pendiente y una hora de timeline. Determinista; base de `/estilo` y de los e2e del panel.

### 5.5 Estructura de la skill `/nomos`

Como el dojo: `SKILL.md` (≤ 400 líneas, tabla de argumentos `estado`, `reanudar`, `pausar`, `cerrar`), `scripts/` (`serve`, `vigila` con latido + tail de la bandeja, `seed`), `references/` (contrato de eventos, contrato de herramientas, puertas de calidad, enrutado §4), `evals/` con tres casos. skillsmith ≥ 95 antes de hito 2.

### 5.6 Catálogo de assets y extracción desde Fab

Requisito tuyo del 2026-10-22: «En el FAB tengo muchos assets, tiene que poder extraerlos de allí e integrarlos en Unreal». El «Game Asset Hub» del contexto se integra como vista y módulo de Nomos, no como aplicación aparte: mismo servicio, misma SQLite, misma autenticación.

Lo observado en tu equipo el 2026-10-22:

- UE 5.8.3 en `C:\Program Files\Epic Games\UE_5.8`, con el plugin Fab 0.0.21 (módulo de editor) y Quixel Bridge instalados por el Launcher.
- El plugin Fab del editor es un navegador web embebido (fab.com) que habla con el editor por `UFabBrowserApi`: el frontend web pide con tu sesión una URL firmada y el editor ejecuta `AddToProject`, que elige `FPackImportWorkflow` (packs UE nativos vía BuildPatchServices), `FQuixelImportWorkflow`, `FGenericImportWorkflow` (Interchange: FBX/GLB), `FMetaHumanImportWorkflow` o `FPluginInstallWorkflow`. API pública exportada (`FAB_API`): `FFabDownloadRequest(AssetID, DownloadURL, DownloadLocation, tipo)`, `FFabGenericImporter::ImportAsset(Sources, Destination, callback)` y `FFabAssetsCache` (`GetCacheLocation`, `GetCachedAssets`, `IsCached`, `GetCachedFile`: zips por AssetId con caducidad en días). Comandos de consola `Fab.Login`, `Fab.Logout`, `Fab.ClearCache`, `Fab.ShowSettings`. Fuente «My Library» del Content Browser (`FFabMyLibraryContentSource`, consulta HTTP con el token del plugin).
- Launcher: `C:\ProgramData\Epic\EpicGamesLauncher\VaultCache\FabLibrary\listings_v1.db`, SQLite con la tabla `local_listing` (uid, entitlement_uid, title, description, category, thumbnail, media, seller, listing_type, `is_ai_forbidden`, `is_ai_generated`); hoy con 0 filas, se rellena al abrir Mi biblioteca en Fab del Launcher. Fab en el Launcher: descarga y exportación por lotes solo para contenido no nativo de UE; lo nativo es «Add to Project» listing a listing; la exportación «Custom (socket port)» envía JSON por TCP a un plugin propio, con ejemplo Python oficial.
- Quixel Bridge: `C:\Users\richa\Documents\Megascans Library\Downloaded\UAssets\uassetsData.json` (dos presets MetaHuman).
- Proyectos: diez `.uproject` en `Documents\Unreal Projects`; CrazyPadel y unknowncall ya tienen `Content\Fab\<listing>\…` importados desde el editor.

Entidades: `AssetSource` (Fab, Megascans, Poly Haven, ambientCG, Kenney, Quaternius, Sketchfab, 3D Asset Server, Freesound, Meshy generado, Blender preparado), `CatalogEntry` (nombre, categoría, descripción, origen y URL, `fab_uid` y `entitlement_uid`, estado adquirido/descargado/en caché/importado, proyectos donde está, formatos descargados, versión y compatibilidad UE, licencia y restricciones con `is_ai_forbidden`, miniatura, ruta local, archivos, etiquetas, esqueleto/animaciones si aplica) y `AssetUse` (qué tarea lo usó y en qué commit).

Tres niveles de extracción, de más a menos oficial. Capacidades muestra cuál está activo y Nomos nunca promete un nivel que no lo esté:

| Nivel | Qué cubre | Mecanismo | Automatización |
|---|---|---|---|
| 1. Oficial, sin GUI | Todo lo que ya pasó por tu máquina: `Content/Fab` de cualquier proyecto, zips de la caché del plugin, Megascans Library, y los metadatos de toda tu biblioteca (`listings_v1.db`) | Indexador del servicio más un toolset Nomos en Python, registrado como los de Epic con `toolset_registry.tool_call`, que lista la caché con `FFabAssetsCache`, importa un zip cacheado o un FBX/GLB con `FFabGenericImporter::ImportAsset` o con `import_asset` del EditorToolset, y copia o migra `Content/Fab/<pack>` entre proyectos de la misma versión; después `SemanticSearchToolset` para buscar dentro del proyecto | Total |
| 2. Oficial, GUI asistida | Assets comprados que nunca descargaste: la URL firmada solo la genera el frontend de Fab con tu sesión | (a) Nomos abre el listing en la pestaña Fab del editor (sesión iniciada con `Fab.Login`) o en el Launcher y pulsa «Add to project» por automatización de GUI (Computer Use u Orca); (b) si falla, cola «Descargas pendientes» en el Catálogo con botón que abre el listing y un detector que continúa solo al aparecer el pack en `Content/Fab` o en la caché; (c) para formatos de intercambio, receptor TCP del servicio para la exportación «Custom (socket port)» del Launcher, seguido de importación Interchange por MCP | Alta; el clic puede ser tuyo o del agente |
| 3. No oficial, opcional | Listar y descargar packs UE nativos sin GUI | `ue-asset-cli` (MIT, PyPI 0.1.1 de 2024, reimplementación de Allar/ue-mp-downloader; código de autenticación de tu cuenta obtenido en epicgames.com/id y token en el keyring del sistema; declarado «Linux-compatible», sin verificar en Windows) como adaptador aislado del servicio. Puede romperse con cambios de Epic y es ajeno a su API pública | Total, solo si lo activas tú en Capacidades tras una Decisión; nunca cookies del navegador ni tokens copiados a mano |

Evaluado y descartado: threenative-asset-mcp («Fab MCP»: sin licencia, rutas `/i/*` no documentadas y convierte los packs a GLB en vez de integrarlos en Unreal); inyectar JavaScript en el navegador embebido del plugin o reutilizar `GetAuthToken()` contra fab.com (privado y frágil).

Indexación: escáner de `Content/` de cada proyecto (metadatos de `.uasset` por Python o Unreal MCP), caché del plugin, Megascans Library, `listings_v1.db`, y consulta por API de las fuentes CC0. Búsqueda con SQLite FTS5 sobre nombre, descripción y etiquetas; las descripciones naturales («cinco personajes de fantasía estilizados con esqueleto») las traduce Nomos a filtros. Embeddings solo si FTS no basta.

Política de Nomos ante una necesidad de asset, en este orden y visible en la Decisión:

1. Catálogo propio: tu Fab ya descargado o en caché, generados y preparados anteriormente.
2. Tu Fab no descargado, por el nivel 2 o el 3 que esté activo.
3. Fuentes gratuitas, CC0 primero.
4. Compra en Fab: siempre Decisión.
5. Generar con Meshy dentro del presupuesto; fuera de él, Decisión.

`is_ai_forbidden` bloquea usar ese asset como entrada de Meshy image-to-3D o de cualquier generación. «Preparar para Unreal» desde el Catálogo crea una tarea de arte con el contrato `ue-asset-intake`; licencia desconocida bloquea la importación con una Decisión.

Comprobado el 2026-10-22 (prototipo en `outputs/kratos-fab-nivel1/`, informe `informe-nivel1.md`): el nivel 1 funciona de extremo a extremo. El indexador stdlib encontró 4 packs en 2 proyectos y 2 assets Megascans; un pack copiado de CrazyPadel a un proyecto nuevo creado sin el editor cargó al 100 % en `UnrealEditor-Cmd -ExecutePythonScript -NullRHI` en 10 s, con 0 dependencias faltantes. La caché del plugin es `FabSettings.CacheDirectoryPath`, por defecto `%TEMP%\FabLibrary`, y hoy no existe: tus packs vinieron de importaciones GLB, que no dejan zip. Ningún toolset del MCP ni el plugin Fab exponen herramientas de Fab: el MCP cubre importar, buscar y mover dentro del proyecto, no extraer de la biblioteca. La pelota de tenis mide 2 m: `ue-asset-intake` debe verificar escala en toda importación Fab.

Nivel 2, comprobado el 2026-10-22 con Computer use (informe en `outputs/kratos-fab-nivel1/informe-nivel2.md`): el esquema `com.epicgames.launcher://ue/fab` abre la portada de Fab en el Launcher, pero la tienda embebida con Mi biblioteca es el elemento «Fab» del menú lateral (un clic, log `GoToUrl('[fab]')`). Con acceso de escritorio solo al Launcher, «Advanced Cel Shader Lite» (gratuito, formato UE, no descargado) entró en `KratosFabTest` con 5 clics (Fab → My Library → «+» → proyecto → Add to Project) y unos 8 s para 43,8 MB; el log confirma con `HandleTaskComplete AlertCode=[ok]` y `verify_pack.py` (ahora con `NOMOS_ROOT`) cargó 12/12 assets sin dependencias faltantes en 11 s. Hechos que cambian el diseño: (a) `listings_v1.db` no es un catálogo: recorrer Mi biblioteca entera (109 productos) no escribe nada; solo «Add to project» añade una fila mínima (uid, título, miniatura, `download_meta` con ruta a `VaultCache` y tamaño, `listing_acquisition`), con `entitlement_uid`, categoría y descripción vacíos, así que el detector de packs nuevos debe vigilar `VaultCache\*\data\Content\*` y el mtime de la base, y el inventario completo sigue dependiendo de la web embebida; (b) el pack cae en `Content\<CarpetaDelVendedor>` (aquí `AdvancedCelShader`), no en `Content\Fab`, y puede traer carpetas compartidas (`StarterContent`, 21 archivos) que el Launcher copia encima sin preguntar: añadir siempre a un proyecto cuarentena vacío y migrar por nivel 1; (c) si el asset no declara la versión del proyecto (este iba de 4.20 a 5.4) el diálogo dice «No compatible user projects found» y hacen falta «Show all projects» y elegir la versión más alta en «Select Version»: cuatro clics más y un aviso de compatibilidad en la Decisión. `index.py` indexa ya `launcher_packs` y `launcher_listings.downloads`.

Pendiente de comprobar en hito 4: nivel 2 con un pack que incluya C++ o plugins (versión fuera de rango); detección automática del fin de copia por log en vez de captura; si `FFabMyLibraryContentSource` expone los listados propios a Python o TEDS; si `ue-asset-cli` funciona en Windows.

### 5.7 Política de autonomía

Nomos y sus workers actúan sin preguntar para: buscar en el catálogo y fuentes CC0, programar, importar lo ya licenciado, probar, capturar, compilar, crear worktrees y commits. Pasa por Decisión: comprar, gastar por encima del presupuesto de la tarea, borrar assets del catálogo o worktrees con cambios, modificar sistemas marcados críticos en la configuración del workspace, publicar o enviar a una jam, y toda elección creativa entre alternativas.

### 5.8 Versión del motor

Observado: UE 5.8.3 instalado, la misma versión que declaran las skills de quodsoler, con MetaHuman y los toolsets MCP incluidos. `ue-project-context` sigue detectando la versión por workspace y Capacidades decide, por si un juego usa otra versión.

## 6. Hitos revisados

| Hito | Entrega | Criterio de salida (funcional) | Puerta de diseño |
|---|---|---|---|
| 0. Prueba de escucha | Skill mínima, servicio con token, página de intercambio | Una invocación conecta la sesión original; ida/vuelta y recuperación; 401 sin token | Ninguna |
| 1a. Diseño | Brief, `theme.ts`, inventario §2.3, maquetas comparadas, `docs/diseno-visual.md`, `/estilo` | Legible a 1366×768 con barra lateral y 1920×1080; todos los estados de §2.3 dibujados | Auditoría Vercel + `/impeccable critique` |
| 1b. Base persistente y shell | Arranque idempotente, SQLite con outbox, `seed`, shell con las 10 vistas | Reiniciar conserva datos; el shell entero funciona con `seed` | §2.6; capturas `docs/capturas-1b/` |
| 2. Nomos y un worker real | Crear tarea, Codex en worktree, eventos y chat reales; `ue-project-context` del workspace | Petición → tarea → cambios → corrección al mismo responsable | Formulario cabe en 1366×768 |
| 3. Varios workers y skills | Claude hijo, dependencias, revisión, reservas, enrutado §4 en `start_worker` | Paralelismo y exclusión comprobados; Capacidades muestra skills por workspace | Tarjeta bloqueada y Decisión probadas |
| 4. Catálogo y extracción Fab | Indexación (`listings_v1.db`, `Content/Fab` de los diez proyectos, caché del plugin, Megascans), toolset Nomos de importación, cola asistida y detector, receptor socket del Launcher, política §5.6, Meshy MCP, Blender, galería con `<model-viewer>`, Presupuesto | Un pack ya en caché o en otro proyecto se importa a un proyecto nuevo sin GUI; uno no descargado entra por nivel 2 y el detector continúa solo; una necesidad recorre Fab propio → CC0 → Meshy con Decisiones; gasto visible | Catálogo y galería auditados |
| 5. Unreal, UI y QA | Unreal MCP oficial comprobado; cambio de gameplay real; bucle UMG §3.7 con `ue-visual-qa`; capturas; build | Una petición produce un cambio real en Unreal con evidencia; una pantalla UMG pasa el ciclo completo | Entregas muestra capturas con metadatos |
| 5b. Personajes y animación | Meshy rig/animate → retarget en Unreal; toolset MetaHuman si 5.8+ | Un personaje animado reproducido en PIE con captura; MetaHuman solo si Capacidades lo marca disponible | Comparación de candidatos en Decisiones |
| 6. Integración y cierre | Verificación integrada, preservación, retirada de worktrees, continuación tras DONE | DONE deja commits e historial; continuación con atribución | Columna Cerrando con fallo probada |
| 7. Endurecimiento y acabado | Fallos/reintentos, límites, `Ctrl+K`, motion, `/impeccable harden` y `polish`, Insights, `unreal-packaging` y `ue-submission` | Recorrido completo estable; paquete ejecutado fuera del editor | Auditoría final; `docs/auditoria-7-cierre.md` |

1a no depende de 0: en paralelo. Ninguna vista se construye sin su estado dibujado en 1a. Las skills de producción (§3.2-3.8) se instalan en el workspace del juego a partir del hito 3, por etapa, nunca todas a la vez.

## 7. Pruebas de aceptación añadidas (continúan v1)

15. Petición sin token → 401; token de un arranque anterior → 401.
16. `nomos seed` deja el panel entero navegable sin Unreal, Meshy ni Codex; los e2e corren sobre la semilla.
17. A 1366×768 con barra lateral, el formulario de nueva tarea muestra título, primera fila y acción principal sin scroll; ningún desplegable cortado.
18. Cada vista tiene sus estados reproducibles desde `/estilo` y pasa `web-design-guidelines` sin errores de accesibilidad.
19. Agotar el presupuesto Meshy no lanza el job y crea una Decisión con el gasto.
20. Resolver una Decisión queda registrado y Nomos continúa sin repetir contexto.
21. La franja distingue «listener activo» de «Nomos confirmó recepción».
22. `start_worker` con una tarea UMG carga las skills de §4 y el worker las reporta en su primer evento.
23. El visor GLB abre un modelo de la semilla y uno de Meshy con la misma interacción.
24. Kanban, Drawer y Catálogo recorribles con teclado y foco visible.
25. `/nomos` pasa skillsmith ≥ 95 y sus tres evals.
26. «Necesito cinco personajes de fantasía estilizados con esqueleto» devuelve primero candidatos del catálogo propio, luego CC0; Meshy solo tras Decisión o dentro de presupuesto.
27. Toda entrada del catálogo muestra licencia; importar una de licencia desconocida crea una Decisión en vez de importar.
28. Una pantalla UMG no se declara terminada sin captura en PIE con la UI visible e informe de `ue-visual-qa`; el coordinador rechaza el cierre sin ella.
29. Capacidades muestra un único MCP de Unreal; configurar otro se marca como conflicto.
30. Con motor anterior a 5.8, Capacidades marca MetaHuman ausente y ninguna tarea lo promete.
31. Un asset de Fab presente en otro proyecto o en la caché del plugin se importa al proyecto objetivo por el toolset sin abrir la pestaña Fab, y queda en el Catálogo enlazado a su listing. (La parte de copia y verificación sin GUI quedó demostrada el 2026-10-22 con el prototipo de `nomos-fab-nivel1`; falta el enlace al listing porque `listings_v1.db` está vacía.)
32. Un asset comprado y no descargado aparece en «Descargas pendientes»; tras pulsar «Add to project» (el agente o tú) el detector lo registra e importa sin intervención adicional.
33. El Catálogo muestra toda la biblioteca a partir de `listings_v1.db` aunque nada esté descargado, con `is_ai_forbidden` visible; un asset con esa marca no puede enviarse a Meshy.
34. Una exportación «Custom (socket port)» del Launcher llega al receptor del servicio y termina importada por Interchange con su entrada de catálogo.
35. El nivel 3 está apagado por defecto; activarlo exige una Decisión y Capacidades lo marca «no oficial».

## 8. Orden de la primera implementación

Dos hilos en paralelo desde el primer día:

- Riesgo técnico (0 → 1b → 2 → 3): **invocar skill → abrir panel con token → enviar petición → despertar Nomos → crear tarea → worker en worktree → resultado → corrección**.
- Diseño (1a): brief → tokens → maquetas → elección → `/estilo` sobre la semilla.

Se juntan en 1b. Después el catálogo con la política de assets (4), el cambio real en Unreal con el bucle de UI (5), personajes y animación (5b), cierre (6) y acabado (7). Para una game jam concreta, el orden mínimo es 0, 1b sin pulir, 2, 4 solo catálogo local, 5 y 7 solo empaquetado; el resto después de la jam.

## 9. Lo que deliberadamente no entra en v1

- Arrastrar y soltar en el Kanban; modo oscuro (tokens preparados); Storybook; librería de gráficos, Gantt, terminal embebido; sincronización continua con Figma; multiusuario y más hosts/GPU.
- Un segundo MCP de Unreal (Flopperam/Aura, sam-david): duplican herramientas y complican el diagnóstico.
- Cookies del navegador, tokens copiados a mano o reimplementar endpoints internos de Fab dentro de Nomos: nunca. El único camino no oficial es el adaptador opcional `ue-asset-cli` del nivel 3, apagado por defecto.
- Houdini Engine (PCG cubre v1), Suno/AIVA y FMOD (música por biblioteca con licencia), Convai y NVIDIA ACE (enemigos con State Trees deterministas), DeepMotion (hasta tener acceso a su API), Cascadeur y Rokoko (pasos manuales documentados), Gauntlet (hito 7+), ComfyUI y Substance (solo si el estilo lo exige), MetaHuman Animator.
- Skills no verificadas (Buckley Builds) y colecciones generalistas (Jeffallan game-developer).

## Fuentes

- Plan v1 `nomos-unreal-ai-plan.md`, notas `work/*.md` y catálogo `unreal-game-jam/docs/third-party-skills.md` (ZIP de outputs, con revisiones fijadas de Epic, quodsoler, maystudios, ibrews, gamedev-skills).
- Contexto del ecosistema pegado por el usuario el 2026-10-22 (Fab, Meshy, MetaHuman, animación, 12 sistemas, estrategia de jam, investigación de skills). Las afirmaciones no verificadas se marcan como tales.
- Decisiones de Noovo reutilizadas: notas de Second Brain del 2026-10-19 y 2026-10-20.
- Fab en el Launcher (lotes, ubicación de descarga, socket port): https://dev.epicgames.com/documentation/en-us/fab/exporting-assets-from-fab-in-launcher.
- Plugin Fab del editor, leído en `C:\Program Files\Epic Games\UE_5.8\Engine\Plugins\Fab\Source\Fab` (Public: `FabDownloader.h`, `Utilities/FabAssetsCache.h`, `Importers/GenericAssetImporter.h`, `Workflows/FabWorkflow.h`; Private: `FabBrowserApi.h`, `FabConsoleCommands.cpp`, `Teds/FabContentSource.h`). Toolsets del motor en `…\Engine\Plugins\Experimental\Toolsets` (`EditorToolset/Content/Python/editor_toolset/toolsets/asset.py`, `MetaHumanGenerator`, `SemanticSearchToolset`).
- ue-asset-cli: https://github.com/jwindgassen/ue-asset-cli (PyPI 0.1.1, 2024-03-15) y su origen https://github.com/Allar/ue4-mp-downloader. threenative-asset-mcp (evaluado, descartado): https://github.com/ThreeNativeHQ/threenative-asset-mcp.
- Meshy MCP: https://github.com/meshy-dev/meshy-mcp-server y https://docs.meshy.ai/api/ai.md.
- MetaHuman Character Python API: https://dev.epicgames.com/documentation/metahuman/metahuman-creator-python-scripting-in-unreal-engine.
- ElevenLabs skills: https://elevenlabs.io/blog/elevenlabs-agent-skills y https://github.com/elevenlabs/skills/wiki.
- 3D Asset Server: https://ai-tldr.dev/tools/3d-asset-server/.
- Impeccable: https://github.com/pbakaus/impeccable. antd-skill: https://github.com/ant-design/antd-skill. web-design-guidelines: https://llmbase.ai/skills/vercel-labs/web-design-guidelines/. emilkowalski/skills: https://awesome.ecosyste.ms/projects/github.com%2Femilkowalski%2Fskills. wondelai/skills: https://vibeindex.ai/plugins/wondelai/skills/ux-design. form-design candidato: https://www.claudemarket.ai/skills/owl-listener/designer-skills/form-design.
- Comparativas de skills de diseño 2026 (selección, no cifras): https://www.paralect.com/skills/top-design-skills, https://skillselion.com/design, https://pasqualepillitteri.it/en/news/576/claude-code-skills-design-uiux-guide.
- `<model-viewer>`: https://modelviewer.dev.
