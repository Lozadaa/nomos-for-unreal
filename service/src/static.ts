import { readFile, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute, extname, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

export const panelDir = resolve(import.meta.dirname, "../../panel/dist");

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".woff": "font/woff", ".map": "application/json",
};

async function readInside(dir: string, name: string): Promise<{ file: string; content: Buffer } | null> {
  try {
    const root = await realpath(dir);
    const file = await realpath(resolve(root, decodeURIComponent(name).replace(/^\/+/, "")));
    const path = relative(root, file);
    if (path === ".." || path.startsWith(".." + sep) || isAbsolute(path)) return null;
    return { file, content: await readFile(file) };
  } catch { return null; }
}

/** Sirve panel/dist; las rutas de la SPA (sin extensión, pedidas como HTML) reciben index.html. Devuelve false si no responde. */
export async function panelStatic(req: IncomingMessage, res: ServerResponse, path: string, dir = panelDir): Promise<boolean> {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const wantsHtml = String(req.headers.accept || "").includes("text/html");
  let hit = path === "/" ? null : await readInside(dir, path);
  // `/` solo lo toma el panel para navegadores: los clientes sin text/html siguen recibiendo la página del hito 0 (/web/index.html)
  if (!hit && wantsHtml && (path === "/" || !extname(path))) hit = await readInside(dir, "index.html");
  if (!hit) return false;
  const ext = extname(hit.file);
  res.writeHead(200, {
    "Content-Type": types[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
  });
  res.end(req.method === "HEAD" ? undefined : hit.content);
  return true;
}
