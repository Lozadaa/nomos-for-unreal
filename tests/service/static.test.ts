import { test } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { panelStatic } from "../../service/src/static.ts";

async function withPanel(run: (get: (path: string, accept?: string) => Promise<Response>) => Promise<void>, build = true) {
  const dir = mkdtempSync(join(tmpdir(), "kratos-panel-"));
  if (build) {
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>Panel</title>");
    writeFileSync(join(dir, "assets", "app-abc123.js"), "console.log(1)");
    writeFileSync(join(dir, "assets", "app.css"), "body{}");
    writeFileSync(join(dir, "secreto.txt"), "no");
  }
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (await panelStatic(req, res, url.pathname, dir)) return;
    res.writeHead(404); res.end("api");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try { await run((path, accept) => fetch(base + path, { headers: accept ? { Accept: accept } : {} })); }
  finally { await new Promise<void>((r) => server.close(() => r())); rmSync(dir, { recursive: true, force: true }); }
}

test("sirve index.html en / y los archivos de dist con su tipo", () => withPanel(async (get) => {
  assert.equal((await get("/")).status, 404, "sin text/html, / sigue siendo de la página del hito 0");
  const root = await get("/", "text/html");
  assert.equal(root.status, 200);
  assert.match(root.headers.get("content-type")!, /text\/html/);
  assert.equal(root.headers.get("cache-control"), "no-cache");
  assert.match(await root.text(), /<title>Panel<\/title>/);
  const js = await get("/assets/app-abc123.js");
  assert.match(js.headers.get("content-type")!, /text\/javascript/);
  assert.match(js.headers.get("cache-control")!, /immutable/);
  assert.match((await get("/assets/app.css")).headers.get("content-type")!, /text\/css/);
}));

test("rutas de la SPA sin archivo devuelven index.html solo a navegaciones (Accept: text/html)", () => withPanel(async (get) => {
  const spa = await get("/produccion/abc", "text/html,application/xhtml+xml");
  assert.equal(spa.status, 200);
  assert.match(await spa.text(), /<title>Panel<\/title>/);
  // una llamada de API (fetch sin text/html) no se traga: cae al siguiente manejador
  assert.equal((await get("/tasks", "application/json")).status, 404);
  // un archivo inexistente con extensión tampoco es una ruta de la SPA
  assert.equal((await get("/assets/falta.js", "text/html")).status, 404);
}));

test("no sale de dist ni acepta rutas codificadas hacia fuera", () => withPanel(async (get) => {
  assert.equal((await get("/%2e%2e/package.json", "text/html")).status, 404);
  assert.equal((await get("/..%2f..%2fpackage.json", "text/html")).status, 404);
}));

test("sin panel/dist construido no responde (el servicio sigue con la página del hito 0)", () => withPanel(async (get) => {
  assert.equal((await get("/", "text/html")).status, 404);
}, false));
