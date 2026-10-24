# Aceptación del hito 0

Las tareas 1–7 implementan servicio, CLI, web y skill. La tarea 8 sigue pendiente:
requiere una **sesión nueva de Claude Code** con Monitor. No equivale a la QA de
navegador ni a un resultado de Skillsmith.

## Preparación

1. En Claude Code abre `C:\Users\richa\Documents\Unreal Projects\KratosFabTest`.
   Debe existir su `.uproject`; Node ≥25 debe estar disponible en Git Bash.
2. La junction `%USERPROFILE%\.claude\skills\nomos` debe apuntar a
   `C:\Users\richa\orca\workspaces\kratos\hito0-escucha\skills\nomos`.
   No retires este worktree mientras esa sea la instalación activa.
3. En los comandos sh siguientes define la ruta base (ajústala si mueves el repo):

   ```sh
   NOMOS="$USERPROFILE/.claude/skills/nomos/scripts/nomos.ts"
   ```

   Ejecuta los comandos **desde la carpeta del juego**. No copies tokens a informes
   ni commits. `.nomos/` debe figurar en el `.gitignore` del juego.

## Prueba 1 · Dos invocaciones, un servicio y un director

1. Escribe `/nomos`. Esperado: `ARRANCADO`, navegador abierto y Monitor armado;
   franja «Nomos escuchando». Si falta Monitor, registra fallo: servicio vivo no
   prueba escucha de Claude.
2. Escribe `/nomos estado`. Esperado: servicio activo, vigilante activo, pendientes 0.
3. En otra sesión nueva de Claude Code en la misma carpeta escribe `/nomos`.
   Esperado: `YA_ACTIVO`; conserva el pid y startedAt de service.json sin imprimir
   su token. La segunda sesión se conecta y conserva a la directora existente.
   No debe haber dos vigilantes ni dos entregas del mismo mensaje.

## Prueba 2 · Web → sesión original → web

1. En la página envía «hola 🎾» con «Enviar a Nomos» o Ctrl+Enter.
   Esperado: tarjeta «Enviado» y evento en la sesión original sin escribir en el chat.
2. Observa que Claude ejecute `ack` y luego `reply` con ese mismo messageId.
   Esperado: «Recibido por Nomos» y respuesta debajo, última confirmación con hora.
3. Recarga la página. Esperado: una tarjeta, texto y respuesta intactos.
   Envía `<script>alert(1)</script>`: debe mostrarse como texto sin abrir ningún alert.

## Prueba 3 · Rearme y reinicio

1. Detén temporalmente el Monitor desde Claude sin cerrar el servicio. Envía un
   mensaje. Pasados 6–8 s: «Vigilante caído · 1 mensajes en espera».
2. Rearma el mismo comando `vigila --session <id> --data .nomos` mediante Monitor.
   Esperado: entrega el pendiente; ack + reply completan la tarjeta existente.
3. Con Monitor detenido deja otro mensaje sin confirmar; ejecuta
   `node "$NOMOS" stop --data .nomos` y después
   `node "$NOMOS" start --data .nomos`. El navegador debe abrir la **URL nueva**.
   El token rota, por lo que la pestaña antigua puede mostrar «Servicio desconectado».
4. Rearma Monitor y observa el pendiente conservado, una entrega por rearme y una
   tarjeta por messageId. Un vigilante que siguió vivo relee service.json solo.
   Los mensajes ya confirmados no deben reentregarse.

## Prueba 4 · Cierre de Claude

1. Deja un mensaje sin confirmar y cierra la sesión de Claude que ejecuta Monitor.
2. Pasados 6–8 s: «Vigilante caído · N mensajes en espera». El servicio y SQLite
   conservan el mensaje. Reabre Claude, `/nomos` y verifica recuperación.

## Prueba 15 · Token ausente y token anterior

1. En Git Bash: `curl -i http://127.0.0.1:8780/status` debe devolver
   `401 {"error":"unauthorized"}`. Ajusta el puerto si usaste `--port`.
2. Conserva el token actual solo en memoria de un script local; ejecuta stop/start.
   Un GET /status con `Authorization: Bearer <token-anterior>` devuelve 401.
   Con el token del archivo nuevo devuelve 200. No guardes esos valores en capturas.

## Prueba 21 · Latido y confirmación son distintos

1. Con vigilante vivo, envía una petición y pausa la atención de Claude antes de ack.
   Esperado: «Nomos atendiendo 1 mensajes», tarjeta «Enviado», sin confirmación nueva.
2. Ejecuta `node "$NOMOS" ack <seq> --session <id> --data .nomos`.
   Solo entonces pasa a «Recibido por Nomos» y cambia la hora de confirmación.
3. Ejecuta `node "$NOMOS" reply <messageId> --data .nomos -- 'Respuesta de prueba'`.
   Esperado: respuesta asociada a la misma tarjeta.

## Alcance y diferencias del plan

- El contrato de recepción citado como v2 §3 está en **v1 §3**.
- Módulos auxiliares separan HTTP, SSE, credenciales, cliente, lock y vigilante para
  mantener cada archivo en ≤200 líneas; las firmas/rutas fijadas se conservan.
- La QA visual usó Chrome headless con CDP en lugar del navegador integrado:
  Orca devolvió `runtime_unavailable` en snapshot, eval y screenshot.
- Los tres casos tienen `.md` y también `evals.json`, como el formato real de dojo.
- Pendientes son mensajes **sin confirmar**. Una caída entre ack y reply conserva
  la tarjeta pero exige completar la respuesta por su ID; no se promete recuperación
  automática de respuestas ni ejecución exactamente una vez. Confirma en orden.
- Tras reiniciar el servicio hay que abrir su URL nueva para renovar el token web.

## Resultado ejecutado · 2026-10-22

- `npm test`: **25 pruebas aprobadas, 0 fallos** tras la revisión final.
- Tres regresiones reproducidas primero en rojo y después en verde: request-target
  inválido devuelve 400 sin caer; corte abrupto de SSE conserva el cursor impreso;
  reserva exclusiva de vigilante liberada por el SO al morir el proceso.
- El lock usa una transacción exclusiva en archivos auxiliares SQLite dentro de
  .nomos. Evita recuperar/borrar locks por PID y la carrera entre dos candidatos.
  La reserva de escritura `BEGIN IMMEDIATE` permite las lecturas transitorias de
  apertura; una regresión adicional cubre esa contención. Veinte ejecuciones
  consecutivas de los tres casos de contención terminaron en verde.
- CLI real: start, status y stop ejecutados en `.nomos/prueba-cli`.
- Skill validada por `quick_validate.py`; Skillsmith 1.2.0: **96/100**, sin errores
  ni advertencias bloqueantes. Las cuatro sugerencias restantes piden convenciones
  en inglés o renombrar `nomos`; se conserva el nombre y el idioma del contrato.
- Junction creado y destino comprobado; envoltorio ejecutado desde esa junction.
- `node tests/browser-qa.ts .nomos/prueba-web-revision`: aprobado tras las
  correcciones finales, Chrome 1366×900.
  Sin token no llama API; Ctrl+Enter, SSE, ack/reply, emoji/texto seguro, recarga
  sin tarjetas duplicadas, caída de vigilante y desconexión del servicio comprobados.
- Capturas: [intercambio](capturas-hito0/intercambio.png),
  [enviado](capturas-hito0/enviado.png), [atendiendo](capturas-hito0/atendiendo.png),
  [sin token](capturas-hito0/sin-token.png), [vigilante caído](capturas-hito0/vigilante-caido.png),
  [servicio desconectado](capturas-hito0/servicio-desconectado.png).
- **Pendiente del usuario:** pruebas 1–4, 15 y 21 en la sesión nueva, incluido el
  rearme/expiración real de Monitor y el enrutado a la sesión original.
- Tras ejecutar la tarea 8, añade fecha, resultado por prueba y capturas; commit
  sugerido: `docs: resultado de la aceptación del hito 0`. No hacer push ni merge aquí.

## Resultado 2026-10-23

Tarea 8 ejecutada en `C:\Users\richa\Documents\Unreal Projects\KratosFabTest` por una
sesión de Claude Code (Sonnet 5.5, app de escritorio) con la skill instalada por la
junction, Node 25.9 y la herramienta Monitor real. Los tokens no se registran aquí.
Dirigido por los pasos 1–7 del encargo (plan, Task 8, más las comprobaciones de token
y de vigilante caído). **Resultado: 7 de 7 pasos cumplen lo esperado; 0 fallos de
funcionamiento; 5 observaciones** (abajo). Esta sesión usó el identificador
`acept-hito0` como `--session`, no el id interno real de Claude Code, que la skill no
dice cómo obtener.

| Paso | Resultado | Qué se vio |
|---|---|---|
| 1 · `/nomos` | Pasa | `start` imprimió `URL …` y `ARRANCADO` (pid 68452, puerto 8780). Tras armar Monitor con `vigila`, la franja decía «Nomos escuchando». |
| 2 · «hola, prueba de aceptación 🎾» | Pasa | Enviado desde la web: franja «Nomos atendiendo 1 mensajes» y tarjeta «Enviado». El Monitor imprimió `{"seq":2,"messageId":"9699cd15-…","origin":"web"}` con el emoji intacto. `ack 2` devolvió `lastAckSeq:2`, `reply` devolvió `{"seq":4}`. La página mostró «Recibido por Nomos», la respuesta y «Última confirmación: 11:43:02 PM» sin escribir nada en el chat. Captura: [aceptacion-02-recibido.png](capturas-hito0/aceptacion-02-recibido.png). |
| 3 · Idempotencia | Pasa | Segundo `start`: `YA_ACTIVO`, misma URL; `service.json` con el mismo hash (`f6fa23de…`), pid y `startedAt` iguales. |
| 4 · Recuperación | Pasa | Mensaje nuevo enviado con Ctrl+Enter (el Monitor lo imprimió: seq 5) y **no confirmado**. Se detuvo el Monitor, `stop` → `DETENIDO`, `status` → exit 2 «Servicio no disponible», `start` → `ARRANCADO` (pid 70012, `startedAt` nuevo, `pending:1`). Al rearmar `vigila` se reimprimió **una sola vez** el mismo `messageId` (seq 5); `ack 5` + `reply` → `pending:0`, sin segunda entrega a los 5 s. La pestaña vieja mostró «Servicio desconectado» (ver obs. 1); tras recargar con la URL nueva: «Nomos escuchando», dos tarjetas, ambas «Recibido por Nomos». Captura: [aceptacion-04-recuperacion.png](capturas-hito0/aceptacion-04-recuperacion.png). |
| 5 · Token | Pasa | `POST /messages` sin cabecera → `401 {"error":"unauthorized"}`; con el token de `service.json` anterior → `401` idéntico; ninguno creó mensaje (`pending` siguió en 0). Como control, `GET /status` dio 401, 401 y 200 con el token vigente. |
| 6 · Vigilante caído | Pasa | Tras `TaskStop` del Monitor y ~11 s: `listener:false`, franja «Servicio activo · esperando a Nomos» (sin pendientes). Con un mensaje enviado y ~28 s: «Vigilante caído · 1 mensajes en espera». Nunca «Nomos escuchando». Capturas: [06a](capturas-hito0/aceptacion-06a-servicio-activo.png), [06b](capturas-hito0/aceptacion-06b-vigilante-caido.png). Al rearmar se entregó el pendiente (seq 10), `ack` + `reply` lo cerraron. |
| 7 · Cierre | Pasa | Monitor detenido y `stop` → `DETENIDO`; `status` exit 2; `curl` al puerto sin conexión; `service.json` retirado; `nomos.db` conservada. |

### Observaciones (no son fallos del criterio del plan; conviene decidir si se corrigen)

1. **Cambiar solo el fragmento `#token=` en la pestaña abierta no recarga la página**
   (navegación en el mismo documento): tras `stop`/`start`, navegar a la URL nueva en la
   misma pestaña siguió mostrando «Servicio desconectado»; hizo falta recargar. Con el
   navegador del sistema (`start` abre pestaña nueva) no se probó; la skill dice «abre la
   URL nueva» sin avisar de ello. Una opción: que la página relea `location.hash` en
   `hashchange`.
2. **«Navegador abierto» no verificado.** `start` imprime la URL y, según la skill, abre
   el navegador del sistema; no se comprobó visualmente. La URL se abrió a mano en el
   navegador integrado (`mcp__Claude_Browser__navigate`); `show_pane preview` respondió
   que la sesión no estaba abierta en ninguna ventana.
3. **Numeración de `seq`:** el primer mensaje llevó `seq` 2 y el ack válido fue ese 2;
   `ack` y `reply` también consumen `seq` (reply de seq 2 → `{"seq":4}`). Coherente con el
   contrato, pero la skill no lo explica y el plan no fijaba el primer valor.
4. **Restos tras matar el Monitor:** `watcher.lock.db-journal` (512 B) quedó en `.nomos`
   tras el `stop` final, junto a `watcher.lock.db` y `start.lock.db`. No causó fallos:
   los tres rearmes entregaron bien.
5. **`.gitignore` del juego:** la carpeta de prueba no es un repositorio git ni tiene
   `.gitignore`; la skill pide añadir `.nomos/` «si no está» y no se hizo.

### Alcance: lo que NO se ejecutó

- Prueba 1.2–1.3 de esta guía (`/nomos estado` y segunda sesión de Claude Code con
  `/nomos`): el paso 3 se ejerció desde la CLI de esta misma sesión, no desde otra sesión.
- Prueba 3.1 con «vigilante caído» solo se hizo con `TaskStop`; no se esperó a que
  expire el Monitor (30 min).
- Prueba 4 (cierre de la sesión de Claude con mensaje pendiente) y prueba 21 (latido sin
  `ack`: «atendiendo» se vio en la franja, pero no se mantuvo una pausa deliberada entre
  entrega y `ack`).
- Recarga con `<script>alert(1)</script>` (prueba 2.3): no se envió.
- Las capturas se hicieron del navegador integrado (JPEG convertido a PNG); el panel
  estaba oculto y el primer intento agotó el tiempo, por eso algunas muestran el
  desplazamiento del contenedor.
