# Kratos

Director de producción de videojuegos Unreal Engine con IA: una skill de Claude Code (`/kratos`) que levanta un servicio local y un panel web desde la carpeta de un juego, y una conversación de Claude que recibe peticiones, las convierte en tareas y coordina agentes, assets y pruebas.

Estado: en construcción. El plan completo está en [docs/plan-v2.md](docs/plan-v2.md); los planes de implementación por hito, en [docs/superpowers/plans](docs/superpowers/plans).

## Estructura

| Carpeta | Qué hay |
|---|---|
| `skills/kratos` | La skill de Claude Code (`SKILL.md`, `scripts`, `references`, `evals`) |
| `service` | Servicio local (Node, sin dependencias) y página web |
| `design` | Tokens, maquetas y página `/estilo` |
| `docs` | Plan v2, planes por hito, decisiones de diseño, pruebas de Fab |
| `tests` | Pruebas `node:test` |

## Requisitos

Node ≥ 25 (ejecuta TypeScript y trae SQLite), Unreal Engine 5.8 con los plugins `ModelContextProtocol` y `AllToolsets`, Windows (Git Bash para Claude Code).

## Pruebas

```bash
npm test
```

## Licencia

MIT.

## Producción de ejemplo

Con Node ≥ 25, desde la raíz del repositorio:

```bash
node service/src/cli.ts seed --data .kratos
node service/src/cli.ts seed --force --data .kratos
```

El comando funciona sin arrancar el servicio ni conectar proveedores. Crea `kratos.db`
con 12 tareas, 3 runs, 60 eventos y 30 recursos del catálogo; los archivos de ejemplo
(GLB, dos capturas e informe) quedan en `artifacts/` junto a la base. Las rutas de
artefactos almacenadas son relativas a esa carpeta. La fecha de referencia fija es
`2026-10-22T20:00:00Z`; las capturas proceden del hito 0 y el modelo es un triángulo
sintético local, no una generación ni una prueba real de Unreal.

Si ya hay tareas, devuelve `not_empty`. `--force` reemplaza los datos de producción,
conservando mensajes, estado del director y eventos del intercambio del hito 0.
Los cursores de eventos siguen aumentando; no se reinicia la secuencia SQLite.

La API de producción exige `Authorization: Bearer <token>` (el token está en
`service.json`). Lecturas: `GET /tasks?area=&state=`, `/tasks/:id`,
`/decisions?state=`, `/budget?scope=&scopeId=`, `/artifacts?taskId=`,
`/artifacts/:id/file`, `/catalog?q=&source=&state=`, `/capabilities` y
`/commands?state=`. `GET /budget` usa el único presupuesto workspace existente;
para scope task hay que indicar scopeId. Las lecturas no crean presupuestos.

Acciones: `POST /tasks` recibe `{title,spec,area,acceptance:[]}` y siempre crea
una tarea pendiente; `POST /decisions/:id/resolve` recibe `{optionId,by}`;
`POST /seed` recibe `{force?:boolean}`. Sembrar una base con tareas o resolver
una decisión caducada devuelve 409 (`not_empty` o `decision_stale`). Los archivos
se leen dentro de `artifacts/` junto a la base de datos y se sirven con CSP sandbox.
