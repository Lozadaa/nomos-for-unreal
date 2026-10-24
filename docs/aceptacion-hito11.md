# Aceptación del hito 11 — Kratos pasa a llamarse Nomos for Unreal

Fecha: 2026-10-24. Rama `Lozadaa/hito11-nomos` (sobre `main@4292fdd`, con los hitos 10 y 12). Sin push ni merge.

Nombre largo **Nomos for Unreal** (pestaña del panel y portada), corto **Nomos** (cabecera, estados, copy, director),
identificador **nomos** (skill `/nomos`, CLI, `.nomos/nomos.db`, `NOMOS_*`, `%LOCALAPPDATA%\nomos`).

## Cómo se hizo

1. Pruebas de compatibilidad en rojo (`tests/service/legacy.test.ts`): alias de la CLI, migración `.kratos` → `.nomos`,
   marcadores dobles, `KRATOS_*` → `NOMOS_*`, registro, base vieja.
2. Renombrado mecánico reproducible: `node scripts/renombrar-nomos.mjs` (prueba en `tests/renombrar-nomos.test.ts`).
   Reescribe 333 archivos de texto y mueve 39 con `git mv`; no toca binarios ni los archivos de compatibilidad, y deja los
   nombres reales (ver abajo). Sobre el árbol final es idempotente: una segunda pasada no cambia ninguno de los 1101 archivos.
3. Revisión a mano: la marca del panel sale solo de `BRAND` (`panel/src/lib/brand.ts`), con una prueba que falla si un
   archivo del panel contiene «Kratos» o escribe «Nomos» fuera de `BRAND`; el título de la pestaña es `BRAND.long`.
4. La revisión a mano encontró cuatro roturas que el encargo no listaba, cada una con su prueba en rojo antes del arreglo:
   - worktrees de workers lanzados con el brief viejo: `.kratos-brief.md`, `.kratos-inbox/`, `.kratos-review/` habrían
     contado como trabajo del worker (`status`/`diff`);
   - `nomos skills install` trataba las skills instaladas por Kratos (`.kratos-skill.json`) como copias modificadas a mano
     (`kept-local`) en vez de actualizarlas;
   - la ficha `kratos-personaje.json` ya versionada en los juegos dejaba la comprobación `animation` sin personaje;
   - en un worktree viejo, `info/exclude` solo conoce `.kratos-inbox/`: la bandeja `.nomos-inbox/` lleva su propio
     `.gitignore` para que un worker nunca la commitee.

## Aceptación real en KratosFabTest

`pwsh -File scripts/aceptacion-hito11.ps1` (datos nuevos `.nomos-hito11`, puerto libre; no toca `.kratos` ni el 8780):

| Paso | Resultado |
|---|---|
| `nomos start` (`skills/nomos/scripts/nomos.ts`) | `ARRANCADO` |
| `nomos skills install` | `updated` en las tres skills; antes llevaban `.kratos-skill.json`, ahora `.nomos-skill.json` |
| `kratos status` (alias `skills/nomos/scripts/kratos.ts`) | Responde el estado (`"service":true`) y avisa «kratos ahora se llama nomos» |
| Tarea «Nombre nuevo» (`26462f30`), worker Claude sonnet en Orca | run `done`, última línea `NOMOS_DONE {…}`, tarea en `revisando` |
| Tarea «Marcador viejo» (`f12027c1`), mismo worker, pedido a propósito el marcador viejo | run `done`, línea `KRATOS_DONE {…}` reconocida, tarea en `revisando` |
| Panel a 1920 | `docs/capturas-11/portada-11-1920.png`, `docs/capturas-11/produccion-11-1920.png`; el script comprueba que la pestaña dice «Nomos for Unreal» y que ningún texto visible dice «Kratos» (salvo el nombre real del proyecto) |
| `nomos stop` | `DETENIDO` |

Las dos tareas se dejaron en `revisando` (la prueba era el marcador de cierre, no el ciclo completo); sus worktrees de Orca
`nomos-26462f30` y `nomos-f12027c1` (ramas `nomos/…`) siguen en `C:/Users/richa/orca/workspaces/KratosFabTest/`, una carpeta
local de Orca.

Migración con datos reales, sobre **copias** (los originales no se tocaron):

- `KratosFabTest/.kratos` copiada a una carpeta temporal y `nomos doctor` sin `--data`: la carpeta pasa a `.nomos`,
  `kratos.db` a `nomos.db` y `service.json` anota `migrated_from`.
- Base de Block Kings (`Esquina/.kratos/kratos.db`, 63 MB) copiada: al abrirla, 25 runs `kratos` → `nomos` y 12
  atribuciones, `integrity_check: ok`, 0,6 s.

## Lo que queda en compatibilidad y cuándo retirarlo

Todo vive en `service/src/legacy.ts` salvo donde se indica. Retirar a partir del **2026-11-24** (30 días), cuando ningún
worker ni director siga con briefs, datos o skills de antes del hito 11:

| Compatibilidad | Dónde | Retirar |
|---|---|---|
| `kratos …` → `nomos …` con aviso | `skills/nomos/scripts/kratos.ts` | 2026-11-24 |
| `KRATOS_X` vale como `NOMOS_X` si falta; aviso en stderr (CLI) y `legacy_env` en el log del servicio | `legacyEnv` | en la siguiente versión |
| Marcadores `KRATOS_DONE`, `KRATOS_ASK`, `KRATOS_REVIEW`, `KRATOS_SKILLS` aceptados | `service/src/handlers/worker-markers.ts` | 2026-11-24 |
| `.kratos` parada → `.nomos` al arrancar (carpeta y base, `migrated_from`); con su servicio vivo se sigue usando `.kratos` | `dataDirFor` | 2026-11-24 |
| Cualquier `--data` (p. ej. `.kratos-hito5b-lfs`) conserva su nombre; su `kratos.db` pasa a `nomos.db` | `dataDirFor`, `dbFile` | 2026-11-24 |
| `%LOCALAPPDATA%\kratos\projects.json` se copia a `...\nomos\` la primera vez | `legacyRegistry` | 2026-11-24 |
| `.kratos-brief.md`, `.kratos-inbox/`, `.kratos-review/`, `.kratos/` no son trabajo del worker | `legacyLocalPaths` (usado en `adapters/git.ts`) | 2026-11-24 |
| Skills con `.kratos-skill.json` se actualizan como propias | `legacySkillMark` (usado en `skills-install.ts`) | 2026-11-24 |
| `kratos-personaje.json` se lee si falta `nomos-personaje.json` | `legacySpecFile` (en `checks/animation.ts`, `checks/select.ts`) | cuando los juegos la renombren |
| El panel lee el proveedor `kratos` de eventos viejos como `nomos` | `legacyProvider` en `panel/src/lib/brand.ts` | 2026-11-24 |
| Base vieja: `runs.provider`, `tasks.assignee_provider`, `decisions.resolved_by` y atribuciones pasan a `nomos` una vez | `migrateBrand` | **no se retira** (es una migración) |

Los briefs (`service/src/brief.ts`) y las referencias de la skill solo enseñan `NOMOS_*`.

## Lo que conserva el nombre viejo a propósito

- `KratosFabTest` (carpeta real del usuario y proyecto de cuarentena por defecto en `service/src/catalog/paths.ts`) y
  `KratosJuegoH4`.
- Contenido que ya existe dentro de los juegos: `/Game/Kratos/...` (mapa `AnimTest`, `Retarget`, `MetaHumans`, `Cascadeur`)
  y las etiquetas de actor `KratosAnim`, `KratosCamera`, `KratosCamera2`, `KratosReference`, `KratosProbe`. Renombrarlos
  rompería los mapas y assets ya creados en KratosFabTest y Block Kings.
- Rutas locales reales en los documentos: `C:/Users/richa/orca/workspaces/kratos/...`, ramas `kratos/<id>` y archivos de
  otros repositorios (`Docs/README-kratos.md`, `Scripts/kratos-hito3/`, `outputs/kratos-fab-nivel1/`).
- La nota histórica del `README.md`: «Nomos for Unreal se llamó Kratos hasta el 2026-10-24».
- En `panel/dist` solo aparece `kratos` una vez: la constante de `legacyProvider`.

## Pruebas

| Comprobación | Resultado |
|---|---|
| `npm test` (dos veces, una tras otra) | 592/592 y 592/592 (`main`: 578) |
| `npm run test:panel` | 313/313 en 63 archivos (`main`: 311) |
| `npm run build` | correcto; `grep -ri kratos panel/dist` solo encuentra la constante de `legacyProvider` |
| `cd panel && npx playwright test` | 127 pasadas, 3 omitidas (igual que `main`) |
| `npx -y @lozadaa/skillsmith@1.2.0 --path skills/nomos --report` | 98 (`docs/skillsmith-hito11.txt`) |

Verificación final del 2026-10-24 hacia las 20:15 UTC, una comprobación cada vez (Block Kings seguía trabajando en
paralelo). La aceptación real de arriba se hizo con el código de la rama antes de los tres últimos ajustes (ficha
`kratos-personaje.json`, atribuciones en la base vieja y `--data` tras `--`), que tienen sus pruebas en la suite.
