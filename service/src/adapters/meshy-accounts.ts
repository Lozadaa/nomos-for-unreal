import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Cuenta de Meshy: solo el nombre sale de este módulo; la clave se pide con `key()` y vive en memoria del proceso. */
export type MeshyAccount = {name: string; origin: 'env' | 'archivo'; key: () => string};

/** Claves guardadas por scripts/guardar-claves-meshy.ps1 (Windows, %USERPROFILE%: no AppData\Local, que la app MSIX virtualiza)
 *  o scripts/guardar-claves-meshy.sh (macOS y Linux, ~/.nomos con permisos 600). */
export const accountsFile = (env: NodeJS.ProcessEnv) => {
  const home = env.USERPROFILE ?? env.HOME;
  return env.NOMOS_MESHY_CLAVES ?? (home ? join(home, '.nomos', 'meshy-claves.json') : null);
};

/** DPAPI del usuario actual vía Windows PowerShell 5.1; la cadena cifrada va por stdin, nunca en la línea de órdenes. */
export function dpapi(cipher: string): string {
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    '$s = ConvertTo-SecureString ([Console]::In.ReadToEnd().Trim()); [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)))'],
    // sin PSModulePath: heredado de pwsh 7, Windows PowerShell 5.1 no carga Microsoft.PowerShell.Security (ConvertTo-SecureString)
    {input: cipher, encoding: 'utf8', windowsHide: true, timeout: 30_000, env: {...process.env, PSModulePath: undefined}});
  if (r.status !== 0 || !r.stdout) throw new Error('meshy_key_unreadable');
  return r.stdout;
}

const plain = new Map<string, string>(); // cifrada → clave, solo en memoria

/** `MESHY_API_KEY` como cuenta «env» y luego las del archivo, en su orden. */
export function meshyAccounts(env: NodeJS.ProcessEnv = process.env, decrypt = dpapi): MeshyAccount[] {
  const list: MeshyAccount[] = env.MESHY_API_KEY ? [{name: 'env', origin: 'env', key: () => env.MESHY_API_KEY!}] : [];
  const file = accountsFile(env);
  let cuentas: unknown = [];
  if (file && existsSync(file)) try { cuentas = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')).cuentas ?? []; } catch { /* ilegible: sin cuentas de archivo */ }
  for (const c of ([] as {nombre?: unknown; clave?: unknown; cifrado?: unknown}[]).concat(cuentas as never)) {
    if (typeof c?.nombre !== 'string' || typeof c.clave !== 'string') continue;
    const cipher = c.clave;
    // fuera de Windows no hay DPAPI: guardar-claves-meshy.sh la guarda tal cual («cifrado»: «ninguno») y el archivo queda en 600
    if (c.cifrado === 'ninguno') { list.push({name: c.nombre, origin: 'archivo', key: () => cipher}); continue; }
    list.push({name: c.nombre, origin: 'archivo', key: () => {
      if (!plain.has(cipher)) plain.set(cipher, decrypt(cipher));
      return plain.get(cipher)!;
    }});
  }
  return list;
}

/** Saldo de cada cuenta en el mismo orden; `null` si no respondió. */
export const balances = (accounts: MeshyAccount[], client: (a: MeshyAccount) => {balance(): Promise<number>}) =>
  Promise.all(accounts.map(async a => { try { const n = await client(a).balance(); return Number.isFinite(n) ? n : null; } catch { return null; } }));
