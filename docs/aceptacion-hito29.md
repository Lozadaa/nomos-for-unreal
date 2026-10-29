# Aceptación del hito 29 · Equipo

29 oct 2026. Dos clones temporales de KratosFabTest (`richard`, `ana`) con un repositorio bare local como `origin`
(clonado del original con `--bare` y sin remoto propio). Nomos del worktree `hito29-equipo`. Entorno:
`NOMOS_MEMORY=off`, `NOMOS_GRAPHIFY=off`, `NOMOS_LAUNCHER=process`, `GIT_LFS_SKIP_SMUDGE=1`, puertos 58291 y 58292,
datos en `.nomos-hito29a` y `.nomos-hito29b`. El original, Block Kings y los servicios de 8780/8781 no se tocaron.

## Recorrido

| Hora | Paso | Resultado |
|---|---|---|
| 15:14:19 | Richard: `team status` | `shared:false`; `team init --name Richard --frente combate` publica `equipo/ebe95e0b.json` |
| 15:14:21 | Ana: `team status` | `shared:true`, «Richard (combate)»; `team init --name Ana --frente arena` sin pedir permiso |
| 15:14:34 | `/team` de Richard | Ana presente; un `team.joined` |
| 15:15:47 | Richard crea «Muro de la arena» con reserva `Content/Hito29/SM_Muro.uasset` | Worker por proceso arranca; su reserva sale en su tarjeta |
| 15:16:04 | Ana crea «Muro con otra forma» con la misma reserva | Espera: «Richard tiene reservado SM_Muro hasta 19:15» (`lease.conflict`) |
| 15:17:19 | Ana: `team ask --to Richard "Deja un hueco…"` | A Richard le llega «Ana (arena): Deja un hueco en el muro para la puerta» |
| 15:19:51 | Richard: revisión e integración | `origin/master` = 6a13e7c con `Nomos-Equipo: ebe95e0b Richard (combate) tarea c6276fad…`; su `master` limpio avanza |
| 15:21:44 | Ana integra su muro | Conflicto en el binario: bloqueada «Conflicto en SM_Muro con Richard», tarjeta en su «Por aprobar» |
| 15:22:05 | Ana pulsa **Quedarme con la mía** en el panel | Fusión resuelta con `--theirs` (e49c6c4); a Richard le llega «Conflicto en SM_Muro: Ana se quedó con su versión» |
| 15:25:08 | Richard crea «Puerta de la arena» (`Puerta.uasset`) | Integrada y publicada: 649d705 |
| 15:28 | Ana crea «Otra puerta de la arena» | Decisión «Richard ya tiene “Puerta de la arena”: ¿duplicar o pedírsela?»; **Duplicar** desde el panel |
| 15:32:59 | Ana integra su puerta | «Conflicto en Puerta con Richard» |
| 15:33:27 | Ana pulsa **Quedarme con la suya** | `origin/master` = 4f2dbad con el `Puerta.uasset` de Richard (mismo oid LFS); la tarea de Ana vuelve a implementando |
| 15:33:56 | Panel de Richard | «Ana (arena): Conflicto en Puerta: Ana se quedó con la tuya» |
| 15:34 | `nomos status` y `reanudacion.md` de Richard | Tabla de peers: Ana · arena · sí · 2 en curso |
| 15:35 | `stop` de los dos servicios y borrado de clones y bare | `DETENIDO`; nada vivo en 58291/58292 |

`main` del remoto no recibió ningún commit de sincronización; `nomos/equipo` acumuló 55 (tarjetas y latidos).

## Capturas (1366×768, `docs/capturas-29/`)

| Archivo | Qué se ve |
|---|---|
| `01-richard-equipo.png` | Franja Equipo de Richard: Ana, arena, presente, sus tareas en curso |
| `02-ana-espera-reserva.png` | Franja Equipo de Ana con la reserva de Richard y su tarea esperando |
| `03-ana-ficha-ajena-pedir.png` | Ficha ajena en solo lectura con «Pedir» |
| `04-ana-conflicto-por-aprobar.png` | Tarjeta de conflicto: la tuya / la suya y los dos botones |
| `05-ana-eligio.png` | Tras «Quedarme con la suya» |
| `06-ana-decision-duplicado.png` | Decisión de duplicado |
| `07-richard-chat-avisos.png` | Petición y avisos de conflicto en el chat de Richard |

## Hallazgos y arreglos durante la aceptación

| Qué pasó | Arreglo |
|---|---|
| Con la reserva de un peer, el planificador reintentaba el arranque cada 5 s (runs fallidas en bucle) | El planificador espera con el motivo del peer sin intentar arrancar (`peerLeaseReason`) |
| La Decisión de duplicado caducaba (`decision_stale`): se abría al crear y la CLI prepara la tarea justo después | Se abre al prepararla (`/spec`), una vez |

## Lo que no se probó

| Qué | Por qué |
|---|---|
| Workers reales de Claude | Se usó un `claude` falso por proceso (como en el hito 30): sin Unreal no se puede editar un `.uasset` y el conflicto tenía que ser controlado |
| Recomprobación tras el primer conflicto (`SM_Muro`) | Exige la comprobación `asset` de Unreal, que falla con bytes falsos; además el servicio se reinició y su terminal por proceso se perdió. Por eso la segunda ronda usa `Puerta.uasset`, sin comprobación |
| La tarea del peer que pierde vuelve a implementando (lado remoto) | Solo en pruebas: en la aceptación la tarea de Richard ya estaba en implementando por otra causa |
| Dos máquinas y un remoto real (GitHub) con LFS | Todo fue local; el push de LFS a un bare local sí funcionó |
