import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { readServiceInfo, serviceUrl } from "../service/src/service-info.ts";

const dataDir = resolve(process.argv[2] || ".nomos/prueba-web");
const info = readServiceInfo(dataDir)!;
assert.ok(info, "Arranca el servicio de prueba antes de ejecutar browser-qa.ts");
const profile = mkdtempSync(join(tmpdir(), "nomos-browser-"));
const screenshots = resolve("docs/capturas-hito0"); mkdirSync(screenshots, { recursive: true });
const chrome = process.env.NOMOS_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = spawn(chrome, ["--headless=new", "--no-first-run", "--disable-background-networking",
  "--window-size=1366,900", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"],
  { windowsHide: true, stdio: "ignore" });
let socket: WebSocket | undefined;
let listener: ReturnType<typeof spawn> | undefined;
const cli = (...args: string[]) => {
  const result = spawnSync(process.execPath, [resolve("service/src/cli.ts"), ...args, "--data", dataDir],
    { encoding: "utf8", timeout: 10_000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr); return result.stdout;
};
try {
  let debugPort = 0;
  for (let i = 0; i < 100 && !debugPort; i++) {
    try { debugPort = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]); }
    catch { await sleep(100); }
  }
  assert.ok(debugPort, "Chrome no publicó DevToolsActivePort");
  const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  socket = new WebSocket(pages.find((p: any) => p.type === "page").webSocketDebuggerUrl);
  await once(socket, "open");
  let sequence = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  const errors: string[] = []; const requests: string[] = [];
  socket.addEventListener("message", event => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const waiter = pending.get(message.id); pending.delete(message.id);
      if (message.error) waiter?.reject(new Error(message.error.message)); else waiter?.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
    if (message.method === "Network.requestWillBeSent") requests.push(new URL(message.params.request.url).pathname);
  });
  const send = (method: string, params: Record<string, unknown> = {}) => new Promise<any>((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); socket!.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression: string) => {
    const value = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    assert.equal(value.exceptionDetails, undefined, JSON.stringify(value.exceptionDetails)); return value.result.value;
  };
  const until = async (expression: string, timeout = 9000) => {
    const deadline = Date.now() + timeout;
    while (!await evaluate(expression)) {
      assert.ok(Date.now() < deadline, "No se cumplió: " + expression); await sleep(100);
    }
  };
  const screenshot = async (name: string) => {
    const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    writeFileSync(join(screenshots, name + ".png"), Buffer.from(result.data, "base64"));
  };
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `http://127.0.0.1:${info.port}/` });
  await until('document.getElementById("director")?.textContent === "Abre esta página desde /nomos"');
  assert.equal(requests.some(path => ["/status", "/events"].includes(path)), false);
  await screenshot("sin-token");
  await send("Page.navigate", { url: "about:blank" });
  await send("Page.navigate", { url: serviceUrl(info) });
  await until('document.getElementById("director")?.textContent === "Servicio activo · esperando a Nomos"');
  assert.equal(await evaluate("location.hash"), "");
  await evaluate('document.getElementById("mensaje").focus()');
  await send("Input.insertText", { text: "hola 🎾 <script>window.nomosXss = true</script>" });
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", modifiers: 2 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", modifiers: 2 });
  await until('document.querySelector(".state")?.textContent === "Enviado"');
  await screenshot("enviado");
  listener = spawn(process.execPath, [resolve("service/src/cli.ts"), "vigila", "--session", "prueba-web", "--data", dataDir],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; listener.stdout!.on("data", chunk => { output += chunk.toString(); });
  for (let i = 0; i < 60 && !output.includes("messageId"); i++) await sleep(100);
  const message = JSON.parse(output.trim().split("\n").find(line => line.includes("messageId"))!);
  await until('document.getElementById("director").textContent === "Nomos atendiendo 1 mensajes"');
  await screenshot("atendiendo");
  cli("ack", String(message.seq), "--session", "prueba-web");
  cli("reply", message.messageId, "Hola. Recibí tu mensaje con el emoji 🎾 y el texto intactos.");
  await until('document.querySelector(".state").textContent === "Recibido por Nomos" && !document.querySelector(".reply").hidden && document.getElementById("director").textContent === "Nomos escuchando"');
  assert.equal(await evaluate("window.nomosXss === true"), false);
  await screenshot("intercambio");
  await send("Page.reload");
  await until('document.querySelectorAll("#mensajes > li").length === 1 && document.querySelector(".state").textContent === "Recibido por Nomos"');
  await evaluate('document.getElementById("mensaje").value = "Este mensaje queda en espera"; document.getElementById("formulario").requestSubmit()');
  await until('document.querySelectorAll("#mensajes > li").length === 2');
  const exited = once(listener, "exit"); listener.kill(); await exited; listener = undefined;
  await until('document.getElementById("director").textContent === "Vigilante caído · 1 mensajes en espera"');
  await screenshot("vigilante-caido");
  cli("stop");
  await until('document.getElementById("director").textContent === "Servicio desconectado"');
  await screenshot("servicio-desconectado");
  assert.deepEqual(errors, []);
  console.log("QA navegador: sin token sin API, Ctrl+Enter, SSE, ack/reply, emoji/XSS, recarga sin duplicados, vigilante caído y servicio desconectado: OK");
} finally {
  if (listener && listener.exitCode === null) { const exited = once(listener, "exit"); listener.kill(); await exited; }
  socket?.close();
  const exited = once(browser, "exit"); browser.kill(); await exited;
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
