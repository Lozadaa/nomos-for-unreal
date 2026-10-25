import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import type { Server } from "node:http";
import type { TestContext } from "node:test";
import { openDb } from "../service/src/db.ts";
import { createServer } from "../service/src/server.ts";
import { removeDir } from "./remove-dir.ts";

export const token = "a".repeat(48);
export function baseUrl(server: Server): string {
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
export function requestJson(server: Server, method: string, path: string, body?: unknown, key = token) {
  return fetch(baseUrl(server) + path, { method, headers: {
    Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
}
export async function fixture(t: TestContext, webDir?: string) {
  const web = mkdtempSync(join(tmpdir(), "nomos-web-"));
  writeFileSync(join(web, "index.html"), '<!doctype html><div id="director"></div>');
  const db = openDb(":memory:");
  const server = createServer(db, token, webDir || web);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close(); removeDir(web);
  });
  return { server, db, web };
}
export async function readBlocks(response: Response, count: number): Promise<string> {
  const reader = response.body!.getReader(); const decoder = new TextDecoder();
  let text = "";
  try {
    while (text.split("\n\n").length - 1 < count) {
      const part = await reader.read(); if (part.done) break;
      text += decoder.decode(part.value, { stream: true });
    }
  } finally { await reader.cancel(); }
  return text;
}
