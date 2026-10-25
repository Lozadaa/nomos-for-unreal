import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

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
    // hito 20: con el equipo cargado medio segundo daba «no vivo» a un servicio sano (y las pruebas no lo paraban)
    const signal = () => AbortSignal.timeout(2000);
    const base = `http://127.0.0.1:${info.port}`;
    const health = await fetch(base + "/health", { signal: signal() });
    if (!health.ok || (await health.json()).ok !== true) return false;
    const response = await fetch(base + "/status", { signal: signal(), headers: { Authorization: `Bearer ${info.token}` } });
    return response.ok && (await response.json()).service === true;
  } catch { return false; }
}

export function serviceUrl(info: Pick<ServiceInfo, "port" | "token">): string {
  return `http://127.0.0.1:${info.port}/#token=${info.token}`;
}

/**
 * hito 16: el token es de la carpeta de datos (`<dataDir>/token`, 0o600), no del proceso: reiniciar no invalida los accesos
 * directos ni las pestañas abiertas. Sin archivo vale el de un `service.json` que dejó un proceso muerto; `renew` lo cambia.
 */
export function folderToken(dataDir: string, renew = false): string {
  const valid = (value: unknown) => typeof value === "string" && /^[a-f0-9]{48}$/.test(value) ? value : undefined;
  const read = (name: string) => { try { return readFileSync(join(dataDir, name), "utf8").trim(); } catch { return undefined; } };
  let token = renew ? undefined : valid(read("token")) ?? valid(readServiceInfo(dataDir)?.token);
  token ??= randomBytes(24).toString("hex");
  if (read("token") !== token) {
    const temporary = join(dataDir, `token.${process.pid}.tmp`);
    writeFileSync(temporary, token, { mode: 0o600 }); renameSync(temporary, join(dataDir, "token"));
  }
  return token;
}
