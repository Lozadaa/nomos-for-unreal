# Aceptación del hito 15 · los artefactos sobreviven al renombrado

Fecha: 2026-10-25. Rama `hito15-artefactos` sobre `main@ae73807`. Todo lo de abajo se ejecutó; lo que no, está marcado.

## Problema

Block Kings se renombró (`…/Esquina` → `…/BlockKings`, `.kratos` → `.nomos`). Las comprobaciones habían guardado rutas
absolutas de `<datos>/artifacts`; al moverse la carpeta, `GET /artifacts/<id>/file` respondía `invalid_artifact_path`
y Entregas pintaba todas las miniaturas rotas. Lo mismo con `tasks.archive_path`.

## Commits

| Commit | Tarea |
|---|---|
| `7c70a8c` fix: los artefactos se guardan relativos a la carpeta de datos | 1 |
| (este commit) fix: reparar al arrancar las rutas de una carpeta de datos que se movió | 2 |

## Qué cambia

- `addArtifact` (el único punto por el que pasan todas las altas) guarda `path` y `previewPath` relativas a
  `<datos>/artifacts` cuando caen dentro, con `/`. Fuera (el `.exe` de `Build/` del proyecto) se guardan tal cual.
  La carpeta de datos llega explícita desde `checks/run.ts`; el resto de callers (handlers) no se tocó: sin `dataDir`
  se usa la carpeta de la base, que en producción es la de datos (`dbFile(dataDir)`).
- `finalize` guarda `archive_path` relativo a `<datos>` (`archive/<tarea>`).
- Lectores revisados con grep (`a.path`, `previewPath`, `archivePath`): `routes/artifacts.ts`, `projects.ts` y
  `archive.ts` ya aceptaban las dos formas; **no** lo hacían `routes/task-closing.ts` (archivo de la tarea),
  `handlers/continue.ts` (brief de continuación), `handlers/character-setup.ts` (retarget a mano) y
  `handlers/ui-cycle.ts` (capturas para QA visual). Ahora todos pasan por `locatedPath` / `taskArchive`.
- Al arrancar (`start`, justo tras abrir la base) `repairArtifactPaths`: cada ruta absoluta cuyo archivo no existe y
  cuyo resto tras `/artifacts/` (o `/archive/`), con cualquier barra, existe bajo la carpeta de datos actual, pasa a
  relativa. Nunca toca una ruta cuyo archivo existe ni una sin reubicado (la cuenta como `missing`). Idempotente.
  Si reescribe algo: evento `artifacts.repaired {rewritten, missing}` y una línea `artifacts_repaired` en el log.

## Pruebas automáticas

Antes de cada commit: `npm test` dos veces, `npm run test:panel`, `npm run build`. Estado final:

- `npm test`: 630/630, dos veces (la base era 625/625).
- `npm run test:panel`: 316/316. `npm run build`: correcto.

Pruebas nuevas: `tests/service/artifact-paths.test.ts` (una comprobación real deja `tests/<id>/log.txt` en la base y
el servicio lo sirve; vídeo y miniatura relativos; `.exe` fuera y carpeta hermana `artifacts-escape` se guardan
absolutas y siguen en 400 como hoy; `archive_path` relativo servido por `/tasks/<id>/archive` y leído por la
continuación) y `tests/service/repair-paths.test.ts` (base con rutas de una carpeta `…/Esquina/.kratos` inexistente,
con `\` y con `/`, archivos en la carpeta nueva → tras `start` se sirven `file`, `preview` y el archivo de la tarea y
las filas quedan relativas; ruta sin reubicado intacta y contada; ruta absoluta existente y relativa intactas;
evento y línea de log; segunda pasada sin reescrituras ni evento). Siete archivos de pruebas antiguas que comparaban con la ruta
absoluta guardada ahora la resuelven con `locatedPath` / `taskArchive`.

## Copia de la base real de Block Kings

El original solo se leyó (copia de `nomos.db` + `-wal` al scratchpad). Los archivos de `artifacts/` y `archive/` se
reprodujeron como archivos vacíos con los mismos nombres en la carpeta de datos de la copia.

| | antes | después |
|---|---|---|
| `artifacts.path` con el prefijo viejo `Esquina/.kratos` | 151 | 0 |
| `artifacts.path` relativas | 32 | 183 |
| `artifacts.path` absolutas de la carpeta actual (el archivo existe) | 11 | 11 |
| `tasks.archive_path` con el prefijo viejo | 12 | 0 |
| `tasks.archive_path` absolutas de la carpeta actual | 3 | 3 |

`repairArtifactPaths` → `{rewritten: 163, missing: 0}` (151 artefactos + 12 archivos); la segunda pasada
`{rewritten: 0, missing: 0}`; un solo evento `artifacts.repaired`. Ejemplo de fila reescrita: `tests/a52e208e…/log.txt`.
La base viva tiene ya 194 artefactos (186 en el encargo): los 11 absolutos de la carpeta actual son de después del
renombrado; se sirven bien y, por la regla «nunca reescribir si el archivo existe», se quedan absolutos.

## Pendiente / fuera de alcance

- `provenance.source` (diffs visuales) y `provenance.control` siguen con rutas absolutas; ningún lector sirve
  `source`, y `control` es la línea base del proyecto. No se reparan.
- `test_runs.report_path` sigue absoluto: es la ruta que se le da al worker en el texto de corrección.

## Para el director del juego

Reiniciar el servicio en un hueco (`nomos stop` / `nomos start`). La reparación es automática al arrancar y deja una
línea `artifacts_repaired` en `.nomos/logs/<día>.jsonl`.
