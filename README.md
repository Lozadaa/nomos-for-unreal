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
