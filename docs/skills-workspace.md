# Skills por rol y capacidades del workspace

`service/src/skills.ts` ofrece `skillsForRole(role: string, area: string): string[]` y
`installedSkills(workspaceDir: string): {name: string, path: string, source: 'claude'|'agents'}[]`.

## Enrutado

La tabla de `docs/plan-v2.md` §4 se aplica al crear cada run, incluidos los revisores.
El rol especialista prevalece sobre el área: `revisor` con área `ui` solicita revisión,
no UI. Para `implementacion`, `implementation` y `programmer`, el área orienta la especialidad.
Las listas siguen el orden de la tabla y no contienen duplicados.

| Grupo de rol | Skills requeridas |
| --- | --- |
| Implementación C++/Blueprint | ue-project-context, ue-cpp-foundations, ue-gameplay-framework, ue-module-build-system |
| Habilidad jugable (`habilidad`, `ability`) | ue-gameplay-abilities, ue-niagara-effects, ue-animation-system, ue-audio-system; añade ue-ui-umg-slate con área ui |
| UI (`ui`, `umg`) | game-ui-art-director, ue-ui-umg-slate, game-ui-design, game-ui-ux, ue-umg-ui, ux-writing, ue-visual-qa |
| Arte/assets | blender-director, asset-optimization, collision-proxy, lod-pipeline, unreal-export, qa-review, ue-asset-intake |
| Personaje/animación | rigging, ue-animation-system |
| Escenarios/nivel/mundo | environment-artist, set-dressing, ue-procedural-generation, ue-world-level-streaming, lighting |
| Audio | ue-audio-system |
| QA/builds | ue-testing-debugging, ue-visual-qa, ue-test-package, unreal-packaging |
| Revisor (`revisor`, `reviewer`) | code-review, superpowers:requesting-code-review; añade architect-review con área explícita arquitectura/architecture |
| Alcance/jam | ue-jam-director, game-jam |

Rol y área se normalizan a minúsculas, sin acentos; espacios, guiones bajos y barras
se convierten en guiones. No se infieren sistemas, estilos, herramientas ni IDs de catálogo
a partir de la especificación. Un rol y área desconocidos no añaden skills.

`run.skills` conserva primero las skills explícitas del payload y después las requeridas,
sin duplicados. No se filtra por instalación: las ausentes deben poder reportarse.
El payload y la clave idempotente del comando original permanecen intactos.
El brief de Codex, Claude y revisor enumera esa lista y pide cargarla antes de empezar.
OpenCode recibe el mismo contrato de brief (hito 12: viaja en la orden `opencode run`).

## Confirmación del worker

El worker emite fuera de fences y al comienzo de la línea:

```text
KRATOS_SKILLS ["ue-ui-umg-slate","game-ui-design"]
```

Se admite una lista JSON de strings no vacíos; se eliminan duplicados. El parser admite
fragmentos de stream y continuaciones indentadas de pantalla con viñetas •, ● y ⏺.
Cada pantalla es autónoma: no se unen pantallas truncadas. Ejemplos dentro de fences,
prompts y prosa no confirman skills. Los marcadores inválidos se ignoran.

La última lista observada se guarda en `run.metadata.confirmedSkills`. Es una declaración
del worker, no una comprobación independiente de que el proveedor cargó las skills.
Sin marcador, el campo queda ausente: estado desconocido. `KRATOS_SKILLS []` guarda `[]`:
el worker declaró que no cargó ninguna. Solicitar skills nunca basta para confirmarlas.

Si la lista cambia y faltan requeridas, se emite `worker.skills_missing` con
`{runId, taskId, provider, required, confirmed, missing}`. `missing` es `run.skills`
menos la lista declarada y conserva el orden requerido. La misma lista repetida no duplica
el evento; una confirmación completa no emite missing. No se fabrica un evento missing
si nunca aparece el marcador. Ni ausencia ni faltantes bloquean DONE, ASK o REVIEW.

## HTTP para integrar Capacidades

Ambas variantes exigen token. `GET /capabilities` conserva `Capability[]` por compatibilidad
con los consumidores que usan `map`, `some` y `find`. Para la información adicional:

```text
GET /capabilities?details=1
{capabilities: Capability[], skills: InstalledSkill[], concurrency: {codex, claude, opencode}}
```

El workspace es `dirname(dataDir)` del servicio, no el cwd del proceso ni el repositorio
de Kratos. Solo se enumeran `.claude/skills/*/SKILL.md` y `.agents/skills/*/SKILL.md` locales.
`name` es el nombre exacto de la carpeta; `path` es la ruta absoluta al SKILL.md.
Se ordenan primero fuente claude y después agents, y dentro de cada fuente por nombre.
Un mismo nombre en ambas fuentes produce dos entradas. Directorios sin SKILL.md,
SKILL.md que sean directorios y enlaces de skills se omiten; no se sigue una raíz de
skills que apunte fuera del workspace. No se consulta configuración ni catálogos globales.

La concurrencia usa `concurrency(readConfig(dataDir))`: sin configuración es
`{codex:0,claude:2,opencode:0}` (Codex apagado por defecto desde el hito 7); una configuración parcial pone en cero los proveedores
omitidos. Configuración de concurrencia inválida produce 400. Cupo OpenCode positivo
solo lo usa una tarea que pida `opencode` (hito 12). Esta entrega no modifica el panel.

T22 se verifica con fake Orca y Git real para Codex/Claude y revisor. La aceptación
con proveedores reales y las skills instaladas en un juego concreto corresponden a T6.
