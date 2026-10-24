# Nomos for Unreal

Nomos for Unreal se llamó Kratos hasta el 2026-10-24 (compatibilidad con el nombre viejo hasta el 2026-11-24: [docs/aceptacion-hito11.md](docs/aceptacion-hito11.md)).

Director de producción de videojuegos Unreal Engine con IA. Es una skill de Claude Code (`/nomos`) que, desde la carpeta de un juego, levanta un servicio local y un panel web; la conversación de Claude recibe peticiones, las convierte en tareas y coordina workers (Claude Code en terminales de Orca), assets del catálogo, Unreal, pruebas, integración y cierre.

Estado: MVP cerrado en el hito 7 (ver [docs/estado-entregas.md](docs/estado-entregas.md) y [docs/recorrido-mvp.md](docs/recorrido-mvp.md)). El plan está en [docs/plan-v2.md](docs/plan-v2.md); los planes por hito, en [docs/superpowers/plans](docs/superpowers/plans).

## Requisitos

- **Windows 11** con Git (Git Bash para Claude Code).
- **Node.js 25 o posterior**: ejecuta TypeScript sin compilar y trae SQLite. El servicio no tiene dependencias npm.
- **Claude Code** con `claude` en el PATH (los workers se lanzan con `claude --model sonnet --dangerously-skip-permissions`).
- **Orca** abierto (probado con 1.4.207) y su CLI `orca` en el PATH: Nomos crea un worktree y un terminal por worker.
- **Unreal Engine 5.8** (probado con 5.8.3 en `C:\Program Files\Epic Games\UE_5.8`); los plugins `ModelContextProtocol` y `AllToolsets` son opcionales.
- Opcionales: Epic Games Launcher y plugin Fab (catálogo), Blender, `MESHY_API_KEY` (solo piezas hard surface).

## Instalación

1. Clona este repositorio y prepara el panel (sus dependencias viven solo en `panel/`):

   ```bash
   git clone <repo> nomos && cd nomos
   npm --prefix panel ci && npm run build
   ```

2. Enlaza la skill en Claude Code con una *junction* (no hace falta copiarla; los cambios del repositorio se ven al momento):

   ```powershell
   New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\nomos" -Target "C:\ruta\a\nomos\skills\nomos"
   ```

3. Comprueba el equipo desde la carpeta del juego:

   ```bash
   node C:/ruta/a/nomos/skills/nomos/scripts/nomos.ts doctor --data .nomos
   ```

   `doctor` lista Node, Orca, Unreal, plugins MCP y Fab, Launcher, Meshy, Blender, Git, el servicio (sin mostrar el token) y los dos carriles del ejecutor con su último latido. Termina con código 1 si falta algo imprescindible.

## Uso

Abre Claude Code en la carpeta del juego (la que tiene el `.uproject`) y escribe `/nomos`. La skill arranca el servicio en `127.0.0.1`, abre el panel y se queda escuchando: lo que pidas en el chat de Claude o en el panel se convierte en tareas con alcance, criterios y dependencias. Desde ahí:

- **Producción** muestra las tareas por etapa (pendiente → preparada → implementando → revisando → probando → integrando → cerrando → hecha), quién trabaja en cada una y por qué espera («Esperando reserva», «Depende de…», «Director en pausa», «Sin conexión»…).
- **⌘K / Ctrl+K** busca tareas y vistas y, con una tarea abierta, lanza pruebas, la integra o la cierra.
- **Decisiones** recoge lo que solo tú decides (presupuesto, conflictos, Orca cerrado más de 30 min…).
- **Capacidades** comprueba de verdad cada herramienta («Comprobar ahora», «Abrir Orca»).

Órdenes útiles de la CLI (`nomos` = `node <nomos>/skills/nomos/scripts/nomos.ts`): `start`, `stop`, `status`, `doctor`, `task create|review|check|integrate|finalize|continue`, `asset index|search|migrate`, `pausar`, `reanudar`.

### Configuración (`<juego>/.nomos/config.json`)

```json
{
  "concurrency": {"claude": 2, "codex": 0},
  "defaultProvider": "claude",
  "targetBranch": "master",
  "limits": {"corrections": 3},
  "visualTolerance": 0.02,
  "walkthrough": {"map": "/Game/Mapas/Prueba", "commands": ["stat fps", "stat unit", "r.VSync 0"], "trace": false}
}
```

Codex está **apagado por defecto**; para usarlo hay que darle cupo. `visualTolerance` es la fracción de píxeles que puede cambiar una captura frente a su línea base (`<juego>/docs/baseline/`). `walkthrough` guía el recorrido del ejecutable empaquetado; `trace: true` graba una traza de Unreal Insights (unos 0,9 GB por 30 s).

Las rutas que aparecen en `docs/` con el nombre viejo, como `C:/Users/richa/orca/workspaces/kratos/...` o el proyecto de pruebas `KratosFabTest`, son carpetas locales reales de este equipo y lo conservan; también el contenido que Nomos ya creó dentro de los juegos (`/Game/Kratos/...`, etiquetas `KratosAnim`, `KratosCamera`).

## Estructura

| Carpeta | Qué hay |
|---|---|
| `skills/nomos` | La skill (`SKILL.md`, `scripts`, `references`, `evals`) |
| `service` | Servicio local (Node, sin dependencias), scripts de Unreal en `service/unreal` |
| `panel` | Panel web (Vite, React 19, Tailwind v4, shadcn/ui) |
| `docs` | Plan, aceptaciones y auditorías por hito, capturas |
| `tests` | Pruebas `node:test` del servicio y la CLI |

## Pruebas

```bash
npm test                 # servicio y CLI (node:test)
npm run test:panel       # Vitest del panel
npm run build            # panel de producción
cd panel && npx playwright test   # e2e en Chromium y Firefox con su propio servicio sembrado
```

`node service/src/cli.ts seed --data .nomos` crea una producción de ejemplo (12 tareas, eventos y catálogo) sin Unreal, Orca ni Meshy; los e2e corren sobre ella.

## Seguridad

El servicio solo escucha en `127.0.0.1` y toda ruta exige `Authorization: Bearer <token>`; el token cambia en cada arranque, vive en `<juego>/.nomos/service.json` y no debe pegarse en chats ni tickets. El panel lo recibe por el fragmento de la URL y lo guarda en `sessionStorage`; tras reiniciar el servicio dice «Sesión caducada».

## Licencia

MIT.
