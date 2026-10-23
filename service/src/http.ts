import { timingSafeEqual } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute, extname, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

export function json(res: ServerResponse, code: number, value: unknown): void {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

export function authorized(req: IncomingMessage, url: URL, token: string): boolean {
  const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  const key = bearer || (url.pathname === "/events" ? url.searchParams.get("token") || "" : "");
  const a = Buffer.from(key); const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) { req.resume(); throw new Error("body_too_large"); }
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new Error("invalid_json"); }
}

export async function staticFile(res: ServerResponse, root: string, name: string): Promise<void> {
  try {
    const directory = await realpath(root);
    const file = await realpath(resolve(directory, decodeURIComponent(name)));
    const path = relative(directory, file);
    if (path === ".." || path.startsWith(".." + sep) || isAbsolute(path)) throw new Error();
    const content = await readFile(file);
    const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
    res.writeHead(200, { "Content-Type": (types[extname(file)] || "application/octet-stream") + "; charset=utf-8" });
    res.end(content);
  } catch { json(res, 404, { error: "not_found" }); }
}
