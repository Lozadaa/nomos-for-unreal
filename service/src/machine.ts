import { freemem } from 'node:os';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Hito 22: lo que el planificador mira del PC antes de abrir Unreal: RAM libre y editores vivos. */
export type Machine = {freeGb: number; editors: number; /** x10: UBT, UAT, shaders… (Unreal en uso sin editor) */ tools?: number};
export type MachineProbe = () => Machine;

/** `UnrealEditor.exe`, `UnrealEditor-Cmd.exe` y compañía, vivos en este PC (de quien sean), y las herramientas sin editor. */
function unrealProcesses(): {editors: number; tools: number} {
  const [bin, args] = process.platform === 'win32' ? ['tasklist', ['/FO', 'CSV', '/NH']] : ['ps', ['-A', '-o', 'comm=']];
  const lines = (spawnSync(bin, args, {encoding: 'utf8', windowsHide: true, timeout: 10_000}).stdout ?? '').split(/\r?\n/);
  return {editors: lines.filter(line => /^"?(.*[\\/])?UnrealEditor/i.test(line)).length,
    tools: lines.filter(line => /^"?(.*[\\/])?(UnrealBuildTool|AutomationTool|UnrealPak|ShaderCompileWorker|LiveCodingConsole)/i.test(line)).length};
}

/**
 * `NOMOS_MACHINE_FAKE` apunta a un JSON `{freeGb, editors}` que se relee en cada consulta: las pruebas y la
 * aceptación simulan la RAM sin tocar el PC. Ilegible → se mide de verdad.
 */
export const probeMachine: MachineProbe = () => {
  const fake = process.env.NOMOS_MACHINE_FAKE;
  if (fake) try {
    const m = JSON.parse(readFileSync(fake, 'utf8'));
    if (Number.isFinite(m.freeGb)) return {freeGb: m.freeGb, editors: Number(m.editors) || 0, tools: Number(m.tools) || 0};
  } catch { /* se mide de verdad */ }
  return {freeGb: freemem() / 2 ** 30, ...unrealProcesses()};
};

/** 4.1 → «4,1». */
export const gb = (value: number) => (Math.floor(value * 10) / 10).toLocaleString('es-ES', {maximumFractionDigits: 1});
