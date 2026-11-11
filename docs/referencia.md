> This reference is in Spanish, like the skills and the CLI. The English overview is in the [README](../README.md).

# Referencia técnica

Lo que antes estaba en el README: uso del panel, CLI, configuración, estructura del repo, pruebas y seguridad. Para empezar, el [README](../README.md).

Nomos for Unreal se llamó Kratos hasta el 2026-10-24 (compatibilidad con el nombre viejo hasta el 2026-11-24: [aceptacion-hito11.md](aceptacion-hito11.md)). Algunas rutas de `docs/` y contenido creado dentro de juegos (`/Game/Kratos/...`, etiquetas `KratosAnim`, `KratosCamera`) conservan el nombre viejo.

## Nomos dentro del repo del juego

Para que cada compañero tenga Nomos con solo clonar el juego (Git, Node ≥ 25, Claude Code y Unreal; nada más):

```bash
node service/src/cli.ts embed "C:/ruta/al/Juego"            # copia Tools/Nomos, .claude/skills, nomos.cmd/nomos.sh y la sección «Nomos» del CLAUDE.md
node service/src/cli.ts embed "C:/ruta/al/Juego" --update   # renueva Tools/Nomos y las skills; el resto del CLAUDE.md se conserva
```

No hace commit: revisa y confirma en el juego. Después, en el juego, `/nomos` o `.\nomos.cmd start --data .nomos`.

## Uso del panel

Abre Claude Code en la carpeta del juego (la que tiene el `.uproject`) y escribe `/nomos`. La skill arranca el servicio en `127.0.0.1`, abre el panel y se queda escuchando: lo que pidas en el chat de Claude o en el panel se convierte en tareas con alcance, criterios y dependencias. Desde ahí:

- **Producción** muestra las tareas por etapa (pendiente → preparada → implementando → revisando → probando → integrando → cerrando → hecha), quién trabaja en cada una y por qué espera («Esperando reserva», «Depende de…», «Director en pausa», «Sin conexión»…).
- **⌘K / Ctrl+K** busca tareas y vistas y, con una tarea abierta, lanza pruebas, la integra o la cierra.
- **Decisiones** recoge lo que solo tú decides (presupuesto, conflictos, Orca cerrado más de 30 min…).
- **Capacidades** comprueba de verdad cada herramienta («Comprobar ahora», «Abrir Orca»).

Órdenes útiles de la CLI (`nomos` = `node <nomos>/skills/nomos/scripts/nomos.ts`): `start`, `stop`, `status`, `doctor`, `task create|review|check|integrate|finalize|continue`, `asset index|search|migrate`, `pausar`, `reanudar`.

## Configuración (`<juego>/.nomos/config.json`)

```json
{
  "concurrency": {"claude": 2, "codex": 0},
  "defaultProvider": "claude",
  "models": {"implementacion": "opus", "revisor": "sonnet", "qa": "sonnet", "integrador": "sonnet", "animacion": "sonnet"},
  "targetBranch": "master",
  "limits": {"corrections": 3},
  "visualTolerance": 0.02,
  "walkthrough": {"map": "/Game/Mapas/Prueba", "commands": ["stat fps", "stat unit", "r.VSync 0"], "trace": false}
}
```

Codex está **apagado por defecto**; para usarlo hay que darle cupo. Cada rol de Claude usa su modelo:

| Rol (`models` en config.json) | Modelo por defecto | Quién |
|---|---|---|
| `implementacion` | `opus` (o `workerModel` si existe) | worker de cualquier área |
| `revisor` | `sonnet` | revisión de código |
| `qa` | `sonnet` | QA visual tras `ui.cycle` |
| `integrador`, `animacion` | `sonnet` | integración y animación |

 `visualTolerance` es la fracción de píxeles que puede cambiar una captura frente a su línea base (`<juego>/docs/baseline/`). `walkthrough` guía el recorrido del ejecutable empaquetado; `trace: true` graba una traza de Unreal Insights (unos 0,9 GB por 30 s).

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

El servicio solo escucha en `127.0.0.1` y toda ruta exige `Authorization: Bearer <token>`; el token es de la carpeta de datos: vive en `<juego>/.nomos/token` (y mientras el servicio corre, en `service.json`), ambos con permisos 0o600, y no debe pegarse en chats ni tickets. Reiniciar (`nomos stop` y `nomos start`) no invalida los accesos directos: el token se conserva y el panel abierto reconecta solo. `nomos start --new-token`, con el servicio parado, lo cambia; entonces los accesos directos viejos dejan de valer y el panel dice «Sesión caducada».

