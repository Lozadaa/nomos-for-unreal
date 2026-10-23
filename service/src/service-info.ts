import { readFileSync } from "node:fs";
import { join } from "node:path";

export type ServiceInfo = { pid: number; port: number; token: string; startedAt: string };

export function readServiceInfo(dataDir: string): ServiceInfo | null {
  try {
    const info = JSON.parse(readFileSync(join(dataDir, "service.json"), "utf8"));
    return Number.isInteger(info.pid) && Number.isInteger(info.port) && info.port > 0 && info.port <= 65535
      && typeof info.token === "string" && typeof info.startedAt === "string" ? info : null;
  } catch { return null; }
}

export async function isAlive(info: ServiceInfo): Promise<boolean> {
  try {
    const signal = AbortSignal.timeout(500);
    const base = `http://127.0.0.1:${info.port}`;
    const health = await fetch(base + "/health", { signal });
    if (!health.ok || (await health.json()).ok !== true) return false;
    const response = await fetch(base + "/status", { signal, headers: { Authorization: `Bearer ${info.token}` } });
    return response.ok && (await response.json()).service === true;
  } catch { return false; }
}

export function serviceUrl(info: Pick<ServiceInfo, "port" | "token">): string {
  return `http://127.0.0.1:${info.port}/#token=${info.token}`;
}
