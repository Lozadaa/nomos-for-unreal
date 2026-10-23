# Aceptación del hito 2

2026-10-23, Windows. **Aceptación funcional real completada por CLI/HTTP y Codex.**
Panel, capturas UI, nueva sesión Claude Code `/kratos` y Monitor: **PENDIENTES**.
El director de esta prueba fue el harness CLI; no se simulan esas superficies.

## Proyecto y preparación

- Juego: `C:/Users/richa/Documents/Unreal Projects/KratosFabTest`.
- `.uproject`: `EngineAssociation=5.8`; motor instalado: `5.8.3`.
- Git inicial autorizado: `328d360f2a3c33b1ca3f0fea2bef3d5281555d4a`, rama `master`.
- Commit inicial: solo `.gitignore`, `KratosFabTest.uproject`, `Config/DefaultInput.ini`.
- `DefaultEngine.ini` contiene un campo privado: quedó sin versionar e intacto.
- Ignore Unreal tomado de `C:/Users/richa/Documents/unreal-game-jam/.gitignore`.
- `Content/` quedó untracked, sin excluirlo: 197 archivos / 89.450.083 bytes.
  SHA256 de cada archivo cotejado al terminar: ningún cambio.
- Datos aislados: `<juego>/.kratos-hito2`; `.kratos` previo no se usó.
- Rama del producto: `hito2-worker`; árbol de código validado:
  `9e27fc1b9fd738dc9f22f64923cfdbd7b2e390f3` (antes de estos documentos).
  La aceptación se ancla a ese contenido; los commits del producto admiten autosquash.

## Identidad y continuidad del responsable

| Campo | Valor en ambos ciclos |
| --- | --- |
| Petición original | `bbbba640-715f-4878-8e56-249929a63020` |
| Tarea aceptada | `853be6a3-e9fe-4814-8cb7-751197dccc4d` |
| Run | `1cb1d3bf-2288-412c-8143-bca4e5e6e4cc` |
| Provider / rol | `codex` / `implementacion` |
| Terminal / sessionRef | `term_bb09f43c-0c2d-4baf-814d-21ba599ee707` |
| Sesión real Codex | `01a168d8-f07c-7e23-8ee3-c24f03e29ee9` |
| Rama del worker | `kratos/853be6a3` |
| baseCommit | `328d360f2a3c33b1ca3f0fea2bef3d5281555d4a` |
| correctionCount | `0` antes; `1` después |

WorktreeId completo:
`878e38d5-5293-4cef-bc15-1f2c5e4a86d4::C:/Users/richa/orca/workspaces/KratosFabTest/kratos-853be6a3`.
Codex observado: `v0.163.0-alpha.10.2`, `GPT-6.1-Sol ultra fast`, modo YOLO.
La columna `run.model` permanece `null`; el modelo se atribuye a la pantalla real.
El JSONL de esa sesión contiene dos turnos completados, conservando la sesión.

## Recorrido ejecutado

1. `POST /messages` autenticado creó la petición original; ACK y reply por CLI.
2. `task create --title … --area builds --spec-file <spec>` dejó tarea preparada.
   La spec usa Qué / Por qué / Criterios de aceptación / Alcance / No tocar.
3. `worker start <task> --provider codex --role implementacion`, una vez por tarea.
   Comando del intento aceptado: `775d9c80-397b-4cd4-bbfe-d7a1b7ba50ce`.
4. Orca creó worktree y terminal; Kratos comprobó `Ask Codex` y envió el brief.
   Evento `46`: tarea `implementando`. Codex creó README y script, con commits reales.
5. El primer `KRATOS_DONE` real quedó recuperado tras corregir la lectura de pantalla:
   eventos `270 worker.output`, `271 run.finished(done)`, `272 task.moved(revisando)`.
6. Corrección multilinea por archivo en `.kratos-hito2/correcciones/`:
   «Que el script también imprima la ruta del motor instalado»; usar InstallLocation
   de LauncherInstalled.dat, validar Build.version y conservar la versión.
   Mensaje: `5a1f5ce1-283f-43d8-8645-9f114abd2b59`, ACK/reply reales.
7. `worker send <mismo-run> --file <correccion> --idempotency-key task6-engine-path-v1`.
   Comando `91bdc3c6-686c-427f-ac3e-91b3b700d290`; evento `279`: envío al terminal;
   `280`: vuelve a implementando; `282 worker.message_sent`: correctionCount=1.
8. Codex leyó el inbox y produjo otro commit y otro marcador real, sin nuevo worker.
   Eventos `467 worker.output`, `468 run.finished(done)`, `469 task.moved(revisando)`.
   No se concedió `task done`, integración ni cierre del worktree.

Los eventos de salida recuperada declaran `source=screen`, `snapshot=true`,
`historyComplete=false`, `truncated=true`: son capturas textuales de la pantalla,
no el historial completo ni capturas visuales del panel.

## Comandos y comprobaciones reproducidas

Todos los procesos Orca/Git/CLI/pwsh se invocaron mediante Node spawn con argv,
`shell:false` y `windowsHide:true`; CLI absoluta de esta rama y cwd del juego.
HTTP usó token solo en memoria; no se registraron Bearer ni URL de arranque.

```text
node <CLI-absoluta> start --data <juego>/.kratos-hito2 --port <libre> --no-open
node <CLI-absoluta> ack <seq> --session task6-cli-director --data <datos>
node <CLI-absoluta> reply <messageId> <respuesta-director> --data <datos>
GET /runs/1cb1d3bf-2288-412c-8143-bca4e5e6e4cc [Authorization redactada]
node <CLI-absoluta> run diff <run> --data <datos>
node <CLI-absoluta> run output <run> --since 0 --data <datos>
pwsh -NoProfile -NonInteractive -File <worktree>/Scripts/hello.ps1
orca worktree list --repo id:878e38d5-5293-4cef-bc15-1f2c5e4a86d4 --json
node <CLI-absoluta> stop --data <datos>
npm test
```

La ejecución independiente de pwsh usó cwd externo al juego, en el scratch de Kratos.
Antes: exit0, stderr vacío y una sola línea:

```text
Versión del motor: 5.8
```

Después: exit0, stderr vacío:

```text
Versión del motor: 5.8
Ruta del motor: C:\Program Files\Epic Games\UE_5.8
```

El script lee `.uproject` desde PSScriptRoot con ConvertFrom-Json; obtiene la ruta
de `C:/ProgramData/Epic/UnrealEngineLauncher/LauncherInstalled.dat`, AppName=UE_5.8.
Se cotejaron InstallLocation y `Engine/Build/Build.version=5.8.3` independientemente.
La consola devuelve CP437: el harness conserva bytes y decodifica esa codificación.
Un error inicial de decodificación del harness se corrigió sin modificar el script.

Commits propios del worker, todos conservados en la rama del juego:

- `603f13a3584e1aa3b4bdceb46cd17596c267c86a`: README inicial.
- `e60b7f4d01ac85bb44b782c239f50420535324f2`: versión desde el descriptor.
- `62d06c88b18de7e223bb5b7f8bccc3d44c36ee0e`: ruta instalada y validación del motor.

Diff acumulado desde base: solo `Docs/README-kratos.md` y `Scripts/hello.ps1`.
Worktree limpio; suite del producto ejecutada por Task6: **195/195**, cero fallos.
Nota posterior de fixwave final: regresión **208/208**, sin fallos ni warnings,
y Skillsmith 1.2.0 **98**. Usa fakes, SQLite y Git temporales; no repitió la
aceptación Codex real, que sigue anclada al árbol y evidencia histórica aquí descritos.
Codex ejecutó comprobaciones inline RED/GREEN, incluyendo ruta alternativa con espacios
y rechazo de Build.version incompatible/ausente o registro ausente.

## Orca worktree list resultante

Repo: `878e38d5-5293-4cef-bc15-1f2c5e4a86d4`; totalCount=4, truncated=false.
Cada ID es `<repo>::<path>`; estos cuatro paths e IDs no cambiaron durante la corrección.

| Path | Branch | HEAD |
| --- | --- | --- |
| `C:/Users/richa/Documents/Unreal Projects/KratosFabTest` | `master` | `328d360` |
| `C:/Users/richa/orca/workspaces/KratosFabTest/kratos-df4a0ef5` | `kratos-df4a0ef5` | `328d360` |
| `C:/Users/richa/orca/workspaces/KratosFabTest/kratos-225e7243` | `kratos/225e7243` | `328d360` |
| `C:/Users/richa/orca/workspaces/KratosFabTest/kratos-853be6a3` | `kratos/853be6a3` | `62d06c8` |

## Incidentes y límites de la aceptación

- Primer task `df4a0ef5-dcfb-4ddc-bdd8-46c80063848c`, run
  `fc569e94-ae8c-4ccc-9fce-2aa035ce6abf`: startupTerminal opcional no soportado.
  Orca creó worktree/shell, sin iniciar Codex; run failed+uncertain conservado.
- Segundo task `225e7243-b274-4a2e-b1c4-378395de6268`, run
  `7051588e-45c6-4bfc-bfb7-405cc3856374`: receipt send anidado no soportado.
  Codex sí abrió; run failed+uncertain conservado. Nuevas tareas solo tras inspección
  y fixes TDD revisados; nunca reenvío ciego ni mutación manual de DB.
- Onboarding autorizado: trust exclusivamente para repo KratosFabTest; se guardó esa
  confianza. La sesión de preparación salió con /exit, sin ejecutar tareas.
- En el tercer intento, el stream de Codex TUI mantenía cursor2 vacío aunque existía
  DONE visible. Tras fix revisado, solo se reinició el servicio con los mismos datos;
  poll recuperó el marcador real y conservó el run. La corrección usó el nuevo DONE.
- Se observaron `Hook failed / hook exited with code 1`, sin causa identificable en
  el JSONL de esa sesión. SecondBrain context/capture por CLI sí terminaron exit0.
- El primer prepare abortó por el campo privado; el harness arrancó por error un
  servicio vacío, detenido antes de inicializar Git. Después se exigió preparación válida.
- Servicio final propio PID42360 detenido por CLI: exit0, DETENIDO, service.json retirado.
  Codex, terminales y los cuatro worktrees conservados; sin push, merge ni borrados.
- Panel/Cambios/Chat visual, capturas UI, Monitor y nueva sesión Claude `/kratos`:
  **PENDIENTES**. Esta prueba acredita el recorrido funcional con director CLI explícito.

Evidencia local no versionada: `.superpowers/sdd/2026-10-22-hito2-primer-worker/`,
`task6-before.json`, `task6-after.json`, `task6-continuity.json`, `task6-latest.json`,
`task6-worker-tdd-evidence.json`, `task6-cleanup.json`, `task-6-suite.log`
y `task-6-report.md`. Los datos y eventos originales permanecen en `.kratos-hito2`.
