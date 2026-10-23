# Aceptación del hito 0

Las tareas 1–7 implementan servicio, CLI, web y skill. La tarea 8 sigue pendiente:
requiere una **sesión nueva de Claude Code** con Monitor. No equivale a la QA de
navegador ni a un resultado de Skillsmith.

## Preparación

1. En Claude Code abre `C:\Users\richa\Documents\Unreal Projects\KratosFabTest`.
   Debe existir su `.uproject`; Node ≥25 debe estar disponible en Git Bash.
2. La junction `%USERPROFILE%\.claude\skills\kratos` debe apuntar a
   `C:\Users\richa\orca\workspaces\kratos\hito0-escucha\skills\kratos`.
   No retires este worktree mientras esa sea la instalación activa.
3. En los comandos sh siguientes define la ruta base (ajústala si mueves el repo):

   ```sh
   KRATOS="$USERPROFILE/.claude/skills/kratos/scripts/kratos.ts"
   ```

   Ejecuta los comandos **desde la carpeta del juego**. No copies tokens a informes
   ni commits. `.kratos/` debe figurar en el `.gitignore` del juego.

## Prueba 1 · Dos invocaciones, un servicio y un director

1. Escribe `/kratos`. Esperado: `ARRANCADO`, navegador abierto y Monitor armado;
   franja «Kratos escuchando». Si falta Monitor, registra fallo: servicio vivo no
   prueba escucha de Claude.
2. Escribe `/kratos estado`. Esperado: servicio activo, vigilante activo, pendientes 0.
3. En otra sesión nueva de Claude Code en la misma carpeta escribe `/kratos`.
   Esperado: `YA_ACTIVO`; conserva el pid y startedAt de service.json sin imprimir
   su token. La segunda sesión se conecta y conserva a la directora existente.
   No debe haber dos vigilantes ni dos entregas del mismo mensaje.

## Prueba 2 · Web → sesión original → web

1. En la página envía «hola 🎾» con «Enviar a Kratos» o Ctrl+Enter.
   Esperado: tarjeta «Enviado» y evento en la sesión original sin escribir en el chat.
2. Observa que Claude ejecute `ack` y luego `reply` con ese mismo messageId.
   Esperado: «Recibido por Kratos» y respuesta debajo, última confirmación con hora.
3. Recarga la página. Esperado: una tarjeta, texto y respuesta intactos.
   Envía `<script>alert(1)</script>`: debe mostrarse como texto sin abrir ningún alert.

## Prueba 3 · Rearme y reinicio

1. Detén temporalmente el Monitor desde Claude sin cerrar el servicio. Envía un
   mensaje. Pasados 6–8 s: «Vigilante caído · 1 mensajes en espera».
2. Rearma el mismo comando `vigila --session <id> --data .kratos` mediante Monitor.
   Esperado: entrega el pendiente; ack + reply completan la tarjeta existente.
3. Con Monitor detenido deja otro mensaje sin confirmar; ejecuta
   `node "$KRATOS" stop --data .kratos` y después
   `node "$KRATOS" start --data .kratos`. El navegador debe abrir la **URL nueva**.
   El token rota, por lo que la pestaña antigua puede mostrar «Servicio desconectado».
4. Rearma Monitor y observa el pendiente conservado, una entrega por rearme y una
   tarjeta por messageId. Un vigilante que siguió vivo relee service.json solo.
   Los mensajes ya confirmados no deben reentregarse.

## Prueba 4 · Cierre de Claude

1. Deja un mensaje sin confirmar y cierra la sesión de Claude que ejecuta Monitor.
2. Pasados 6–8 s: «Vigilante caído · N mensajes en espera». El servicio y SQLite
   conservan el mensaje. Reabre Claude, `/kratos` y verifica recuperación.

## Prueba 15 · Token ausente y token anterior

1. En Git Bash: `curl -i http://127.0.0.1:8780/status` debe devolver
   `401 {"error":"unauthorized"}`. Ajusta el puerto si usaste `--port`.
2. Conserva el token actual solo en memoria de un script local; ejecuta stop/start.
   Un GET /status con `Authorization: Bearer <token-anterior>` devuelve 401.
   Con el token del archivo nuevo devuelve 200. No guardes esos valores en capturas.

## Prueba 21 · Latido y confirmación son distintos

1. Con vigilante vivo, envía una petición y pausa la atención de Claude antes de ack.
   Esperado: «Kratos atendiendo 1 mensajes», tarjeta «Enviado», sin confirmación nueva.
2. Ejecuta `node "$KRATOS" ack <seq> --session <id> --data .kratos`.
   Solo entonces pasa a «Recibido por Kratos» y cambia la hora de confirmación.
3. Ejecuta `node "$KRATOS" reply <messageId> --data .kratos -- 'Respuesta de prueba'`.
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
  .kratos. Evita recuperar/borrar locks por PID y la carrera entre dos candidatos.
  La reserva de escritura `BEGIN IMMEDIATE` permite las lecturas transitorias de
  apertura; una regresión adicional cubre esa contención. Veinte ejecuciones
  consecutivas de los tres casos de contención terminaron en verde.
- CLI real: start, status y stop ejecutados en `.kratos/prueba-cli`.
- Skill validada por `quick_validate.py`; Skillsmith 1.2.0: **96/100**, sin errores
  ni advertencias bloqueantes. Las cuatro sugerencias restantes piden convenciones
  en inglés o renombrar `kratos`; se conserva el nombre y el idioma del contrato.
- Junction creado y destino comprobado; envoltorio ejecutado desde esa junction.
- `node tests/browser-qa.ts .kratos/prueba-web-revision`: aprobado tras las
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
