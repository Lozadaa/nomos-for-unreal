import { readServiceInfo, serviceUrl } from "./service-info.ts";
import type { ServiceInfo } from "./service-info.ts";

export class ServiceError extends Error {}
export function serviceInfo(dataDir: string): ServiceInfo {
  const info = readServiceInfo(dataDir);
  if (!info) throw new ServiceError("Servicio no disponible; ejecuta /kratos");
  return info;
}
export async function request(info: ServiceInfo, path: string, data?: unknown): Promise<any> {
  try {
    const response = await fetch(new URL(path, serviceUrl(info)), {
      method: data === undefined ? "GET" : "POST", signal: AbortSignal.timeout(1500),
      headers: { Authorization: `Bearer ${info.token}`, "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data) });
    if (!response.ok) {
      const detail=await response.json().catch(()=>null);
      throw new ServiceError(`Petición rechazada (${response.status})${typeof detail?.error==='string' ? ': '+detail.error : ''}`);
    }
    return response.status === 204 ? null : response.json();
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError("Servicio no disponible");
  }
}
