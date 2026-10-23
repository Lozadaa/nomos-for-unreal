# Skills de diseño instaladas (hito 1a)

Instaladas con el procedimiento del plan v2 §3.1: copia de inspección desde el repositorio público, revisión fijada, carpeta completa y licencia en `LICENSE.upstream`. **No se ejecutó ningún instalador** (`npx impeccable install`, `npx skills add …`): el entorno bloqueó `npx` porque descarga y ejecuta código externo, así que se clonaron los repositorios, se leyeron y se copiaron a mano a `.claude/skills/`.

## En el repositorio (`.claude/skills/`)

| Skill | Origen | Revisión | Licencia | Puerta en la que se usa |
|---|---|---|---|---|
| `impeccable` | github.com/pbakaus/impeccable, carpeta `plugin/skills/impeccable` | commit `5cb95ee` (paquete npm 4.7.0) | Apache 2.0 (`LICENSE.upstream`, `NOTICE.upstream.md`) | Tarea 6: `critique` y `polish` |
| `web-design-guidelines` | github.com/vercel-labs/agent-skills, carpeta `skills/web-design-guidelines` | commit `063bee9` | El repositorio no incluye archivo de licencia (GitHub no declara ninguna); solo se copia un `SKILL.md` de 30 líneas que descarga las reglas de GitHub en cada uso. Revisar antes de redistribuir | Tarea 6: auditoría accesibilidad/UX |
| `ux-heuristics` | github.com/wondelai/skills, carpeta `ux-heuristics` (v1.6.0) | commit `c172996` | MIT (`LICENSE.upstream`) | Tarea 6: Quick Diagnostic |

Notas sobre `impeccable`:
- Se copia solo la skill (`SKILL.md`, `reference/`, `scripts/`). No se copian los `hooks` ni los `agents` del plugin: los hooks ejecutarían un binario en cada edición.
- Dentro de `scripts/` también viajan `live-browser.js` (unos 560 KB; el modo `live` lo inyecta en la página abierta y habla con un servidor local) y `modern-screenshot.umd.js` (librería de terceros minificada, para capturas). Ninguno se ha ejecutado ni inspeccionado línea a línea; la licencia de la librería no está anotada en `NOTICE.upstream.md`. Revisarlos antes de usar `/impeccable live`.
- `SKILL.md` ofrece `/impeccable hooks on`, que instalaría un hook que descarga y ejecuta el binario en cada edición. No activarlo sin leer antes `reference/hooks.md`.
- Su lanzador `scripts/impeccable` descarga un binario de GitHub (con comprobación sha256) la primera vez que se usa. No se ha ejecutado. Su `SKILL.md` prevé el caso «launcher unavailable»: leer `PRODUCT.md`/`DESIGN.md` directamente. Si se quiere el detector automático, ejecutarlo una vez a mano tras leerlo.

## Ya disponibles en el equipo

| Skill | Dónde | Para qué |
|---|---|---|
| `frontend-design` | plugin oficial de Anthropic | Dirección estética de las maquetas |
| `ui-ux-pro-max` | plugin `ui-ux-pro-max-skill` | Paletas, pares tipográficos, patrón dashboard |
| `ux-writing` | `~/.claude/skills` | Copy de estados en español |
| `design-preview-server` | `~/.claude/skills` | Comparar maquetas a dos resoluciones |

`ux-heuristics` no estaba instalado (el plugin `wondelai/skills` no figura en los marketplaces del equipo), por eso se incluye en el repositorio.
