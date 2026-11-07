# La máquina: RAM, turno de Unreal y arranque

## Un Unreal pesado a la vez

El planificador no arranca una tarea **pesada** (abre Unreal) sin RAM libre (`scheduler.minFreeRamGb`, 6 por
defecto), sin hueco en `scheduler.heavy.maxConcurrent` (1) y, con `scheduler.heavyRequiresNoEditor`, sin un
`UnrealEditor` ajeno vivo. Las ligeras siguen arrancando. Declara la carga en la spec cuando la inferencia
(área `animacion`, `escenarios` o `builds`; alcance con mapas, animaciones o build) no acierte:

```markdown
Carga: ligera
```

`nomos status` lista en `unreal` lo que espera («J2.2 espera: 4,1 GB libres, hacen falta 6») y el vigilante
recibe `scheduler.waiting`. No apagues el planificador por la RAM ni arranques pesadas a mano.

## Turno desde el worker

El brief de cada worker trae las órdenes exactas. El Python del editor va al **editor caliente**:
`nomos ue py --tarea <taskId> <script.py> [--env K=V]` abre Unreal una vez por worktree (≈20 s) y los scripts
siguientes tardan 0,1 s; los tests de automatización, por `nomos ue test --tarea <taskId> <filtro>` (JSON con pasados y
fallidos, exit 1 si falla). **El turno es por orden**: cada `ue py`/`ue test` pide el turno, espera si está ocupado y
lo suelta al acabar, así las comprobaciones de Nomos (`checks.run`, `ui.cycle`) entran entre dos scripts. El caliente
queda abierto sin turno; si otro (una comprobación u otro worker) necesita Unreal, se cierra antes (un editor a la vez)
y el siguiente `ue py` lo vuelve a abrir. `nomos ue estado` y `nomos ue parar`; se cierra solo tras 10 min sin trabajo
o si cambian `Binaries` o el `.uproject`. FASTVFX genera y captura en él.

Para abrir Unreal por otra vía (build, empaquetado, `-game`):

```
nomos worker turn <taskId> --wait      # bloquea hasta editor.granted
nomos worker turn <taskId> --release   # al cerrar Unreal (cierra también el caliente del worktree)
```

Un turno pedido así que se retiene **3 min sin ningún proceso de Unreal** (editor, UBT, UAT, ShaderCompileWorker) se
libera solo cuando alguien lo espera (evento `editor.released` con `motivo: inactivo`). En los briefs que escribas, usa
esas órdenes; nunca un bucle propio de espera de RAM (`esperar-maquina.ps1`). `NOMOS_CALIENTE=off` vuelve a `UnrealEditor-Cmd`.

## Tras un reinicio

El servicio cierra solo las runs con el terminal muerto (`terminal_handle_stale`) y las relanza en el mismo worktree
con nota de continuación (`run.recovered`); no hace falta `worker start`. Con `nomos autostart on` (tarea programada
«Nomos - arranque») los servicios registrados vuelven al iniciar sesión; `nomos autostart status` dice si está
instalada. El director sigue teniendo que volver a abrir su sesión y su vigilante.

## Grafo y ponytail

`nomos doctor` exige graphify (CLI en PATH o `~/.local/bin`) y avisa si falta ponytail (`ponytail@ponytail` en
`enabledPlugins` de `~/.claude/settings.json`). Al arrancar, un juego sin `graphify-out/` lo crea en segundo plano
(comando `graph.update`: `graphify <juego> --no-viz --code-only`, solo `Source/` y el texto de `Config/`, `docs/` y
`Content/`) y lo añade al `.gitignore`; tras cada integración en main se encola `--update` (uno a la vez).
`graphify: {"enabled": false}` en `config.json` lo apaga. Workers y revisores consultan `graphify query` antes de leer. Sin `.cpp`/`.h` bajo `Source/` queda apagado (doctor: «sin código C++, apagado»).

## Ramas y líneas base

El worktree de un worker nace de la punta de main; si a su rama le falta main antes de la revisión, Nomos le pide la
fusión (`review.needs_main`) y no abre la revisión. Si una tarea cambia la imagen a propósito, escribe en su spec
`visual: cambia`: con la revisión aprobada, la captura que difiere se propone como nueva línea base con el diff al lado
(«Por aprobar», tipo `baseline`) y no falla; al aprobarla (`baseline.approved`) sustituye a la del mapa.
Para una comprobación concreta, `nomos task check ID --acepta-nueva-base`. La cámara de captura se fija con
`checks.captureCvars` en la config (p. ej. `["BlockKings.CamaraFija 1"]`).

## `main` compartido (equipo)

Con `team.enabled`, la integración trae `origin/main` antes de fusionar (la rama del worker queda al día sobre él) y
empuja `main` después; el commit lleva `Nomos-Equipo: <id> <nombre> (<frente>)`. Push rechazado: trae y rehace, hasta
3 veces; después la tarea queda bloqueada «No se pudo publicar main» (`integration.push_failed`). El `main` del clon
de la persona avanza solo si está limpio. Sin remoto, integra en local y avisa una vez (`integration.no_remote`).
