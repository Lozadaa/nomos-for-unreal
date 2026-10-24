# Nomos · Hito 0 «prueba de escucha» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una sola invocación de `/nomos` en la carpeta de un juego levante un servicio local con token, abra una página de intercambio y conecte la sesión original de Claude como director: un mensaje de la web llega a la sesión, se confirma su recepción y recibe respuesta, y nada se pierde ni se duplica al expirar el vigilante o reiniciar el servicio.

**Architecture:** Un servicio HTTP en Node (sin dependencias: `node:http`, `node:sqlite`, `node:crypto`) escucha solo en 127.0.0.1 y guarda mensajes y eventos en SQLite dentro de `.nomos/` del proyecto del juego. La sesión de Claude recibe los eventos por un vigilante (`nomos vigila`, ejecutado con la herramienta Monitor de Claude Code) que imprime cada evento pendiente y late cada 2 s; confirma y responde con una CLI (`nomos ack`, `nomos reply`). La página web habla con el servicio por HTTP y recibe los cambios por SSE. El patrón es el del skill `dojo` (`serve.py` + `vigila.py` + Monitor rearmado), ya probado.

**Tech Stack:** Node ≥ 25 (ejecuta `.ts` directamente y trae `node:sqlite`), TypeScript solo con sintaxis borrable (sin `enum`, sin `namespace`, sin parámetros de constructor con modificadores), `node:test` + `node:assert/strict`, HTML + JavaScript sin framework para la página de intercambio (Ant Design entra en el hito 1b). Cero paquetes npm en este hito.

**Spec:** `docs/plan-v2.md` §3 (contrato de recepción), §5.1 (seguridad del servicio local), §5.5 (estructura de la skill), hito 0 de §6 y pruebas 1-4, 15 y 21 de §7 y del plan v1 §13. Patrón de referencia: `C:\Users\richa\.claude\skills\dojo\SKILL.md` § Al invocar y `scripts\vigila.py`.

## Global Constraints

- Node ≥ 25.0 (comprobado v25.9.0): `node archivo.ts` ejecuta TypeScript sin compilar; `import { DatabaseSync } from "node:sqlite"` disponible. Ningún `package.json` con `dependencies` ni `devDependencies`.
- El servicio escucha únicamente en `127.0.0.1`; puerto por defecto `8780`, configurable con `--port`.
- Token aleatorio por arranque: `randomBytes(24).toString("hex")` (48 caracteres). Toda ruta salvo `GET /`, `GET /health` y `GET /web/*` exige `Authorization: Bearer <token>`; `GET /events` acepta además `?token=` porque `EventSource` no envía cabeceras. Sin token o con token distinto: `401 {"error":"unauthorized"}`.
- Datos en `<proyecto>/.nomos/`: `nomos.db` (SQLite), `service.json` (`{pid, port, token, startedAt}`). Esa carpeta se añade al `.gitignore` del juego; nunca se versiona.
- Copy de la interfaz y de los mensajes de la CLI en español; nombres de código en inglés.
- Archivos de ≤ 200 líneas; un módulo por responsabilidad.
- Cada tarea termina con `node --test "tests/**/*.test.ts"` en verde y un commit. Mensajes de commit en español, imperativo, prefijo `feat:`, `test:` o `docs:`.
- Windows es la plataforma de desarrollo: rutas con `path.join`, procesos con `child_process.spawn` y `detached: true`, el junction del skill con `cmd /c mklink /J`. Claude Code ejecuta Bash (Git Bash), así que los comandos de `SKILL.md` se escriben en sintaxis sh.

## Review Focus

1. Mensaje vacío o solo espacios en `POST /messages`: debe responder `400 {"error":"empty_text"}` y no crear evento. (Prueba en Tarea 3.)
2. `service.json` obsoleto (el proceso murió): `nomos start` debe detectarlo con `GET /health`, borrar el archivo y arrancar un servicio nuevo en vez de imprimir una URL muerta. (Prueba en Tarea 4.)
3. Reconexión del navegador tras reinicio del servicio: `GET /events?since=N` debe reproducir solo los eventos con `seq > N`, sin duplicar los ya mostrados. (Prueba en Tarea 3.)
4. Texto con emoji o con `<script>` en un mensaje: debe viajar intacto por JSON y SQLite y pintarse con `textContent`, nunca con `innerHTML`. (Pruebas en Tareas 2 y 6.)
5. El vigilante expira o muere mientras hay mensajes sin confirmar: al rearmarse debe reimprimirlos (son los eventos con `seq > director.last_ack_seq`), y mientras está caído la página debe decir «Vigilante caído», no «Escuchando». (Pruebas en Tareas 2 y 5.)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `package.json` | `"type": "module"`, script `test`; sin dependencias |
| `service/src/db.ts` | Abrir SQLite y crear el esquema |
| `service/src/store.ts` | Funciones puras sobre la base: mensajes, eventos, confirmación, respuesta, latido, estado |
| `service/src/server.ts` | Servidor HTTP: rutas, token, SSE, arranque y `service.json` |
| `service/src/cli.ts` | CLI `nomos start|status|vigila|ack|reply|stop` |
| `service/web/index.html` | Página de intercambio con franja del director |
| `skills/nomos/SKILL.md` | La skill `/nomos` (hito 0: arrancar, vigilar, confirmar, responder, `estado`, `cerrar`) |
| `skills/nomos/scripts/nomos.ts` | Envoltorio que reexporta la CLI desde la carpeta del skill |
| `skills/nomos/references/contrato-eventos.md` | Tabla de eventos, rutas y estados del director |
| `skills/nomos/evals/` | Tres casos de evaluación de la skill |
| `tests/store.test.ts`, `tests/server.test.ts`, `tests/cli.test.ts` | Pruebas `node:test` |
| `docs/aceptacion-hito0.md` | Recorrido manual de aceptación (pruebas 1-4, 15, 21) |

Tipos compartidos (en `service/src/store.ts`, exportados):

```ts
export type EventRow = { seq: number; id: string; type: string; messageId: string | null; payload: Record<string, unknown>; createdAt: string };
export type MessageRow = { id: string; text: string; origin: string; createdAt: string; ackedAt: string | null; replyText: string | null; repliedAt: string | null };
export type Status = { service: true; listener: boolean; listenerAgeSec: number | null; director: string | null; lastAckSeq: number; lastAckAt: string | null; pending: number; paused: boolean };
```

Tipos de evento del hito 0: `message.received` (payload `{text, origin}`), `message.acked` (`{seq, session}`), `reply.published` (`{messageId, text}`), `director.started` (`{session}`), `director.stopped` (`{session}`).

---

### Task 1: Esqueleto ejecutable

**Files:**
- Create: `package.json`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: el comando `npm test` → `node --test "tests/**/*.test.ts"`.

- [ ] **Step 1: Escribir la prueba**

```ts
// tests/smoke.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
test("node trae sqlite y ejecuta ts", () => {
  const db = new DatabaseSync(":memory:");
  assert.equal(db.prepare("select 1 as uno").get()!.uno, 1);
});
```

- [ ] **Step 2: Crear `package.json`** con `{"name":"nomos","private":true,"type":"module","engines":{"node":">=25"},"scripts":{"test":"node --test \"tests/**/*.test.ts\""}}`.

- [ ] **Step 3: Ejecutar `npm test`**. Esperado: `# pass 1`, `# fail 0`.

- [ ] **Step 4: Commit** `test: esqueleto con node:test y node:sqlite`.

---

### Task 2: Base de datos y almacén

**Files:**
- Create: `service/src/db.ts`, `service/src/store.ts`
- Test: `tests/store.test.ts`

**Interfaces:**
- Produces:
  - `openDb(file: string): DatabaseSync` — crea tablas si no existen; `":memory:"` válido.
  - `createMessage(db, text: string, origin: string): { messageId: string; seq: number }` — `messageId = randomUUID()`; inserta el mensaje y el evento `message.received`.
  - `listEvents(db, sinceSeq: number): EventRow[]` — `seq > sinceSeq`, orden ascendente.
  - `pendingEvents(db): EventRow[]` — eventos `message.received` con `seq > director.last_ack_seq`.
  - `ackEvent(db, seq: number, session: string): void` — `director.last_ack_seq = max(actual, seq)`, `messages.acked_at = now` del mensaje del evento, añade `message.acked`.
  - `publishReply(db, messageId: string, text: string): { seq: number }` — guarda `reply_text`/`replied_at`, añade `reply.published`; lanza `Error("unknown_message")` si no existe.
  - `heartbeat(db, session: string): void` — upsert de la fila única de `director` con `alive_at = now`.
  - `status(db, now = new Date()): Status` — `listener = alive_at` hace menos de 6 s; `pending = pendingEvents(db).length`.
  - `getMessage(db, id: string): MessageRow | undefined`.

Esquema en `db.ts`:

```sql
create table if not exists messages(id text primary key, text text not null, origin text not null, created_at text not null, acked_at text, reply_text text, replied_at text);
create table if not exists events(seq integer primary key autoincrement, id text not null unique, type text not null, message_id text, payload text not null, created_at text not null);
create table if not exists director(id integer primary key check(id = 1), session text, alive_at text, last_ack_seq integer not null default 0, paused integer not null default 0);
insert or ignore into director(id) values (1);
```

- [ ] **Step 1: Escribir las pruebas**

```ts
// tests/store.test.ts
test("createMessage crea mensaje y evento con seq creciente", () => {
  const db = openDb(":memory:");
  const a = createMessage(db, "hola", "web"); const b = createMessage(db, "🎾 <script>x</script>", "web");
  assert.equal(b.seq, a.seq + 1);
  assert.equal(getMessage(db, b.messageId)!.text, "🎾 <script>x</script>");
  assert.deepEqual(listEvents(db, a.seq).map(e => e.type), ["message.received"]);
});
test("pendingEvents excluye lo confirmado y ackEvent es idempotente", () => {
  const db = openDb(":memory:");
  const a = createMessage(db, "uno", "web"); const b = createMessage(db, "dos", "web");
  ackEvent(db, a.seq, "s1"); ackEvent(db, a.seq, "s1");
  assert.deepEqual(pendingEvents(db).map(e => e.seq), [b.seq]);
  assert.equal(status(db).lastAckSeq, a.seq);
  assert.ok(getMessage(db, a.messageId)!.ackedAt);
});
test("publishReply guarda la respuesta y falla con id desconocido", () => {
  const db = openDb(":memory:");
  const { messageId } = createMessage(db, "pregunta", "web");
  publishReply(db, messageId, "respuesta");
  assert.equal(getMessage(db, messageId)!.replyText, "respuesta");
  assert.equal(listEvents(db, 0).at(-1)!.type, "reply.published");
  assert.throws(() => publishReply(db, "nope", "x"), /unknown_message/);
});
test("status distingue vigilante vivo y caído", () => {
  const db = openDb(":memory:");
  assert.equal(status(db).listener, false);
  heartbeat(db, "s1");
  assert.equal(status(db).listener, true);
  assert.equal(status(db, new Date(Date.now() + 10_000)).listener, false);
  assert.equal(status(db).director, "s1");
});
```

- [ ] **Step 2: Ejecutar `npm test`**. Esperado: fallo por módulos inexistentes.
- [ ] **Step 3: Implementar `db.ts` y `store.ts`** con las firmas de arriba. Fechas en ISO 8601 (`new Date().toISOString()`); `payload` como JSON en texto; `heartbeat` con `update director set session=?, alive_at=? where id=1`.
- [ ] **Step 4: Ejecutar `npm test`**. Esperado: todo en verde.
- [ ] **Step 5: Commit** `feat: almacén SQLite de mensajes, eventos y director`.

---

### Task 3: Servidor HTTP con token y SSE

**Files:**
- Create: `service/src/server.ts`
- Test: `tests/server.test.ts`

**Interfaces:**
- Consumes: todo `store.ts`.
- Produces:
  - `createServer(db: DatabaseSync, token: string, webDir: string): http.Server` (no escucha aún).
  - `requestJson(server, method, path, body?, token?)` es solo un helper de pruebas en `tests/helpers.ts`: `fetch("http://127.0.0.1:" + port + path, ...)`.
  - Rutas: `GET /` → `index.html`; `GET /health` → `{ok:true}`; `POST /messages {text}` → `201 {messageId, seq}` o `400 {"error":"empty_text"}`; `GET /messages/:id` → `MessageRow` o 404; `POST /events/:seq/ack {session}` → `200 Status`; `POST /messages/:id/reply {text}` → `201 {seq}` o 404; `POST /director/heartbeat {session}` → 204; `GET /status` → `Status`; `POST /admin/stop` → 202 y `server.close()` en el siguiente tick; `GET /events?since=N` → SSE (`Content-Type: text/event-stream`), reproduce `seq > N` como `id: <seq>\nevent: <type>\ndata: <json EventRow>\n\n` y después emite los nuevos (sondeo de la base cada 500 ms; `ponytail:` sondeo, sustituir por emisor en proceso si el panel llega a cientos de eventos por segundo).
  - Toda respuesta JSON con `Content-Type: application/json; charset=utf-8`.

- [ ] **Step 1: Escribir las pruebas** (arrancar con `server.listen(0, "127.0.0.1")` y leer el puerto):

```ts
test("sin token 401; con token crea mensaje y lo lista", async () => { /* POST /messages sin cabecera → 401; con cabecera → 201 y GET /messages/:id devuelve text */ });
test("texto vacío → 400 empty_text y no hay evento", async () => { /* POST {text:"   "} → 400; GET /status pending === 0 */ });
test("ack y reply cambian el estado y el mensaje", async () => { /* POST ack → Status.lastAckSeq; POST reply → 201; GET /messages/:id replyText */ });
test("SSE reproduce desde since y acepta token por query", async () => {
  // crear 3 mensajes; abrir GET /events?since=<seq1>&token=...; leer hasta recibir 2 bloques "event: message.received"; comprobar ids seq2 y seq3 y que no aparece seq1
});
test("GET / sirve la página sin token y GET /health responde ok", async () => { /* 200 text/html contiene id="director"; /health {ok:true} */ });
```

Para leer SSE en la prueba: `const res = await fetch(url); const reader = res.body!.getReader();` y acumular `TextDecoder` hasta contar dos `\n\n`; después `reader.cancel()`.

- [ ] **Step 2: Ejecutar `npm test`**. Esperado: fallos por `createServer` inexistente.
- [ ] **Step 3: Implementar `createServer`**. Comparación de token con `timingSafeEqual` sobre buffers de igual longitud (si difieren en longitud, 401 directo). Cuerpo JSON leído con límite de 64 KiB → `413` si se supera. Enrutado con `new URL(req.url, "http://127.0.0.1")` y `pathname.split("/")`.
- [ ] **Step 4: Ejecutar `npm test`**. Esperado: verde.
- [ ] **Step 5: Commit** `feat: servidor HTTP con token, mensajes, ack, reply y SSE`.

---

### Task 4: Arranque idempotente y `service.json`

**Files:**
- Modify: `service/src/server.ts` (añadir `start`)
- Test: `tests/server.test.ts` (añadir casos)

**Interfaces:**
- Produces:
  - `start(opts: { dataDir: string; port?: number; webDir?: string }): Promise<{ port: number; token: string; pid: number; url: string }>` — crea `dataDir`, abre `nomos.db`, genera token, escucha en `127.0.0.1:port` (por defecto 8780), escribe `service.json`, añade evento `director.started`? No: ese evento lo añade el vigilante (Tarea 5). `url = "http://127.0.0.1:" + port + "/#token=" + token`.
  - `readServiceInfo(dataDir): { pid; port; token; startedAt } | null`.
  - `isAlive(info): Promise<boolean>` — `GET /health` con 500 ms de tiempo máximo.
  - Si `start` encuentra un `service.json` vivo, devuelve esa información sin arrancar otro servicio (idempotente). Si está muerto, lo borra y arranca.

- [ ] **Step 1: Escribir las pruebas**

```ts
test("start es idempotente: dos arranques, un servicio", async () => { /* start(tmpDir, {port: 0 → leer puerto real}) dos veces → mismo port y token; isAlive true */ });
test("start sustituye un service.json obsoleto", async () => { /* escribir service.json con pid 999999 y puerto libre; start → puerto nuevo, archivo reescrito, isAlive del viejo false */ });
```

`port: 0` solo en pruebas (puerto efímero); la CLI usa 8780.

- [ ] **Step 2: Ejecutar `npm test`**. Esperado: fallos por `start` inexistente.
- [ ] **Step 3: Implementar `start`, `readServiceInfo`, `isAlive`**.
- [ ] **Step 4: Ejecutar `npm test`**. Esperado: verde.
- [ ] **Step 5: Commit** `feat: arranque idempotente con service.json y comprobación de vida`.

---

### Task 5: CLI y vigilante

**Files:**
- Create: `service/src/cli.ts`
- Test: `tests/cli.test.ts`

**Interfaces:**
- Consumes: `start`, `readServiceInfo`, `isAlive` (Tarea 4); rutas HTTP (Tarea 3).
- Produces: `node service/src/cli.ts <comando> [opciones]` con `--data <dir>` (por defecto `./.nomos`) y:
  - `start [--port N] [--no-open]`: si hay servicio vivo imprime `URL <url>` y `YA_ACTIVO`; si no, lanza `node service/src/server.ts --serve --data <dir> --port N` con `spawn(process.execPath, [...], { detached: true, stdio: "ignore" }).unref()`, espera `isAlive` hasta 5 s e imprime `URL <url>` y `ARRANCADO`. Sin `--no-open` abre el navegador con `start "" "<url>"` en Windows (`cmd /c start`), `open` en macOS, `xdg-open` en Linux.
  - `status`: imprime `Status` en JSON (una línea).
  - `vigila --session <id>`: bucle infinito cada 2 s: `POST /director/heartbeat`, luego `GET /status` y por cada evento de `pendingEvents` (vía `GET /events?since=<último impreso>` filtrando `message.received`) imprime una línea JSON `{"seq","messageId","text","origin"}`; al arrancar imprime primero todos los pendientes (recuperación) y un evento `director.started` se añade vía `POST /director/heartbeat {session, started: true}` (el servidor añade el evento solo cuando `started` es true). Si el servicio no responde, imprime `{"error":"service_down"}` y sigue intentando.
  - `ack <seq> --session <id>`, `reply <messageId> <texto...>`: llaman a las rutas y escriben la respuesta JSON.
  - `stop`: `POST /admin/stop`, borra `service.json`, imprime `DETENIDO`.
  - Códigos de salida: 0 éxito, 1 error de uso, 2 servicio no disponible.
- Modify: `server.ts`: el servidor también se arranca como proceso con `node server.ts --serve --data <dir> --port N` (bloque `if (process.argv.includes("--serve"))` al final del archivo) y `POST /director/heartbeat` acepta `started: true` para añadir `director.started`.

- [ ] **Step 1: Escribir las pruebas** (ejecutan la CLI con `spawnSync(process.execPath, ["service/src/cli.ts", ...])` sobre un `--data` temporal y `--port 0`? No: la CLI necesita puerto fijo para reencontrar el servicio; usar un puerto libre elegido por la prueba con `net.createServer().listen(0)` y cerrado antes).

```ts
test("start arranca, segundo start dice YA_ACTIVO, stop detiene", () => { /* salida contiene ARRANCADO; segunda contiene YA_ACTIVO y la misma URL; stop → DETENIDO; isAlive false */ });
test("ack y reply vía CLI cambian el estado", async () => { /* crear mensaje con fetch; cli ack <seq>; cli status → lastAckSeq; cli reply → GET /messages/:id replyText */ });
test("vigila imprime pendientes al arrancar y late", async () => {
  // crear 2 mensajes; spawn vigila --session t1; leer stdout hasta 2 líneas JSON (seq ascendente, text correcto); GET /status → listener true, director "t1"; kill
});
```

- [ ] **Step 2: Ejecutar `npm test`**. Esperado: fallos por `cli.ts` inexistente.
- [ ] **Step 3: Implementar `cli.ts`** con `util.parseArgs` de Node para las opciones.
- [ ] **Step 4: Ejecutar `npm test`**. Esperado: verde. Comprobar a mano: `node service/src/cli.ts start --data /tmp/k --no-open` imprime URL y `node service/src/cli.ts stop --data /tmp/k` detiene.
- [ ] **Step 5: Commit** `feat: CLI nomos start/status/vigila/ack/reply/stop`.

---

### Task 6: Página de intercambio

**Files:**
- Create: `service/web/index.html` (HTML, CSS y JS en un archivo, ≤ 200 líneas)
- Test: `tests/server.test.ts` (un caso más)

**Interfaces:**
- Consumes: rutas de la Tarea 3; token en `location.hash` (`#token=...`).
- Produces: la página que abre `nomos start`.

Comportamiento fijado:
- Al cargar, lee `token` del hash, lo guarda en `sessionStorage`, limpia el hash (`history.replaceState`). Sin token: muestra «Abre esta página desde /nomos» y no llama a la API.
- Franja superior `#director` con uno de cinco estados y este copy exacto: `Servicio activo · esperando a Nomos` (service ok, listener false, pending 0), `Nomos escuchando` (listener true, pending 0), `Nomos atendiendo N mensajes` (listener true, pending > 0), `Vigilante caído · N mensajes en espera` (listener false, pending > 0), `Servicio desconectado` (fallo de red). Se actualiza con `GET /status` cada 2 s. Muestra además `Última confirmación: <hora local>` o `sin confirmaciones`.
- Formulario: `textarea` + botón «Enviar a Nomos»; `Ctrl+Enter` envía; vacío no envía.
- Lista de mensajes, cada uno con su estado: `Enviado`, `Recibido por Nomos` (al llegar `message.acked` con su seq) y la respuesta debajo al llegar `reply.published`. Todo texto se pinta con `textContent`.
- `EventSource("/events?since=" + lastSeq + "&token=" + token)`; al cerrarse, reconecta a los 2 s desde el último `seq` recibido (el propio `lastEventId` del navegador sirve de cursor cuando reconecta solo).
- Estilo mínimo propio (fondo `#F3F5F9`, tarjetas blancas con sombra `0 1px 3px rgba(16,24,40,.10)`, fuente del sistema); sin frameworks. El diseño real llega con el hito 1a/1b.

- [ ] **Step 1: Escribir la prueba** en `tests/server.test.ts`: `GET /` devuelve `text/html`, contiene `id="director"`, `id="mensaje"`, `EventSource(` y no contiene `innerHTML`.
- [ ] **Step 2: Ejecutar `npm test`**. Esperado: fallo (archivo no existe).
- [ ] **Step 3: Escribir `index.html`**.
- [ ] **Step 4: Ejecutar `npm test`**. Esperado: verde. Comprobar en el navegador integrado de Claude Code: arrancar con `node service/src/cli.ts start --data /tmp/k --no-open`, abrir la URL impresa, enviar «hola 🎾», ver `Enviado`; ejecutar `node service/src/cli.ts vigila --session prueba --data /tmp/k` en segundo plano y ver pasar la franja a `Nomos atendiendo 1 mensajes`; `ack` y `reply` desde la CLI y ver `Recibido por Nomos` y la respuesta. Captura a `docs/capturas-hito0/intercambio.png`.
- [ ] **Step 5: Commit** `feat: página de intercambio con franja del director y SSE`.

---

### Task 7: La skill `/nomos`

**Files:**
- Create: `skills/nomos/SKILL.md`, `skills/nomos/scripts/nomos.ts`, `skills/nomos/references/contrato-eventos.md`, `skills/nomos/evals/{01-arranque,02-ida-vuelta,03-recuperacion}.md`, `skills/nomos/LICENSE` (copia de `LICENSE`)
- Create: `docs/aceptacion-hito0.md`

**Interfaces:**
- Consumes: CLI de la Tarea 5.
- Produces: skill descubrible por Claude Code mediante junction `%USERPROFILE%\.claude\skills\nomos` → `<repo>\skills\nomos`.

`scripts/nomos.ts` (envoltorio de 3 líneas): resuelve `../../../service/src/cli.ts` respecto a `import.meta.dirname` y lo importa; la CLI lee `process.argv` igual.

Contenido de `SKILL.md` (frontmatter + secciones; el implementador respeta esta estructura y este contenido, ajustando redacción solo si skillsmith lo exige):

```markdown
---
name: nomos
description: 'Director de producción de videojuegos Unreal con IA. Al invocarlo en la carpeta de un juego levanta el servicio local, abre el panel y deja esta sesión escuchando las peticiones de la web. Triggers: /nomos, "nomos", "panel de producción", "director", "levanta el entorno"; también /nomos estado y /nomos cerrar.'
license: MIT
metadata:
  version: 0.1.0
---

# NOMOS

Eres Nomos, el director de producción. En este hito solo escuchas y respondes: recibes peticiones desde el panel, confirmas que las has recibido y contestas. No levantas workers todavía.

## Al invocar

1. Ejecuta `node <base>/scripts/nomos.ts start --data .nomos` desde la carpeta del juego (la que tiene el `.uproject`; si no hay ninguno, dilo y para). Lee la línea `URL ...`. Si imprime `YA_ACTIVO`, no arranques nada más: conéctate.
2. Abre la URL (el comando ya la abre en el navegador del sistema; además muéstrala en el panel integrado con `show_pane preview` si existe).
3. Arma el vigilante: herramienta `Monitor` con `node <base>/scripts/nomos.ts vigila --session <id de esta sesión o un nombre corto> --data .nomos`, 30 minutos. Es lo que pone «Nomos escuchando» en la franja.
4. Di en una línea que estás escuchando. No pidas permiso.

## Mientras escuchas

Cada línea del vigilante es un evento `{"seq","messageId","text","origin"}`:
1. Confirma al instante: `node <base>/scripts/nomos.ts ack <seq> --session <id> --data .nomos`. Confirmar no es resolver.
2. Piensa la respuesta y publícala: `node <base>/scripts/nomos.ts reply <messageId> "<texto>" --data .nomos`. Respuestas de ≤ 600 caracteres; lo largo va a un archivo en `.nomos/respuestas/` y la respuesta enlaza su ruta.
3. En el chat, una línea por mensaje atendido.

Al expirar el Monitor, reármalo con el mismo comando mientras el modo Nomos siga activo; el vigilante reimprime los pendientes. Tras 60 minutos sin ningún mensaje (dos expiraciones vacías), déjalo apagado, dilo en una línea, y el siguiente `/nomos` lo arma de nuevo.

## Argumentos

| Argumento | Qué haces |
|---|---|
| (nada) | Arrancar o conectar, abrir el panel, armar el vigilante |
| `estado` | `node <base>/scripts/nomos.ts status --data .nomos` y resumen de 3 líneas: servicio, vigilante, pendientes |
| `cerrar` | Dejar de rearmar el vigilante y `node <base>/scripts/nomos.ts stop --data .nomos`; la base `.nomos/nomos.db` se conserva |

## Archivos

`.nomos/nomos.db` (mensajes y eventos), `.nomos/service.json` (puerto y token de este arranque; no lo copies en el chat). Añade `.nomos/` al `.gitignore` del juego si no está. Contrato completo en `references/contrato-eventos.md`.
```

`references/contrato-eventos.md`: tabla de rutas (método, ruta, cuerpo, respuesta, token), tabla de eventos (tipo, payload, quién lo produce), los cinco estados de la franja con su regla, y el ciclo recibir → ack → reply → SSE.

`evals/`: tres casos en el formato que usa el skill `dojo` (`C:\Users\richa\.claude\skills\dojo\evals`): (1) invocar en una carpeta con `.uproject` → arranca, abre, arma Monitor; (2) llega un evento → ack y reply en ese orden; (3) segunda invocación con servicio vivo → `YA_ACTIVO`, no duplica.

`docs/aceptacion-hito0.md`: pasos numerados para las pruebas 1 (dos `/nomos`, un servicio y un director), 2 (mensaje web → confirmación → respuesta sin invocación manual), 3 (expirar o matar el vigilante, reiniciar el servicio con `stop`/`start`: pendientes conservados, nada duplicado), 4 (cerrar Claude → franja «Vigilante caído» y mensajes conservados), 15 (401 sin token y con token de un arranque anterior), 21 (vigilante vivo sin `ack` → franja «Nomos atendiendo», no «confirmado»). Cada paso dice qué comando o clic y qué debe verse.

- [ ] **Step 1: Escribir los archivos** anteriores.
- [ ] **Step 2: Crear el junction**: `cmd /c mklink /J "%USERPROFILE%\.claude\skills\nomos" "<repo>\skills\nomos"` (si ya existe, comparar y avisar; no sobrescribir).
- [ ] **Step 3: Ejecutar skillsmith**: `npx -y @lozadaa/skillsmith@1.2.0 --path skills/nomos --report`. Objetivo ≥ 90 en este hito (≥ 95 es la puerta del hito 2). Corregir lo que señale sin cambiar el contrato.
- [ ] **Step 4: Ejecutar `npm test`**. Esperado: verde.
- [ ] **Step 5: Commit** `feat: skill /nomos (hito 0) con contrato, evals y recorrido de aceptación`.

---

### Task 8: Recorrido de aceptación real

No lo hace el implementador solo: necesita una sesión nueva de Claude Code en una carpeta con `.uproject` (sirve `C:\Users\richa\Documents\Unreal Projects\KratosFabTest`).

- [ ] **Step 1:** Abrir una sesión nueva de Claude Code en esa carpeta y escribir `/nomos`. Esperado: `ARRANCADO`, navegador abierto, franja «Nomos escuchando».
- [ ] **Step 2:** Enviar «hola» desde la web. Esperado: la sesión imprime el evento, ejecuta `ack` y `reply`; la web muestra `Recibido por Nomos` y la respuesta, sin que nadie escriba nada en el chat.
- [ ] **Step 3:** En otra sesión de Claude Code en la misma carpeta, `/nomos`. Esperado: `YA_ACTIVO`, un solo servicio (`service.json` sin cambios).
- [ ] **Step 4:** `nomos stop` y `nomos start` desde la terminal con un mensaje sin confirmar en la web. Esperado: al rearmar el vigilante, el mensaje se reimprime una sola vez.
- [ ] **Step 5:** Anotar resultados y capturas en `docs/aceptacion-hito0.md` (sección «Resultado 2026-10-XX») y commit `docs: resultado de la aceptación del hito 0`.

---

## Self-review (hecho al escribir el plan)

- Cobertura del spec: contrato de recepción (Tareas 2, 3, 5), seguridad §5.1 (token, loopback, 401, CSP no aplica porque no hay scripts externos; `innerHTML` prohibido), §5.5 estructura de la skill (Tarea 7), hito 0 criterios (Tareas 4, 7, 8), pruebas 1-4, 15, 21 (Tarea 8 y pruebas automáticas de las Tareas 3-5). `pausar`/`reanudar` quedan para el hito 2, cuando existan despachos que pausar; `paused` ya está en el esquema para no migrar.
- Consistencia de nombres: `createMessage`, `listEvents`, `pendingEvents`, `ackEvent`, `publishReply`, `heartbeat`, `status`, `getMessage`, `openDb`, `createServer`, `start`, `readServiceInfo`, `isAlive` se usan igual en todas las tareas.
- Review Focus: 1 → Tarea 3; 2 → Tarea 4; 3 → Tarea 3 (SSE since); 4 → Tareas 2 y 6; 5 → Tareas 2 (`pendingEvents`) y 5 (`vigila` reimprime) y copy de la franja en Tarea 6.
- Proporción: el plan fija firmas, rutas, copy y pruebas; los cuerpos los escribe el implementador.
