import { spawn as nodeSpawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import type { Handler } from '../runner.ts';
import { readConfig } from '../config.ts';
import { assetConfig } from '../catalog/paths.ts';
import { defaultUnrealCmd } from '../adapters/unreal-cmd.ts';
import { quote } from '../adapters/process.ts';
import { appendEvent } from '../store.ts';
import { targetProject } from './asset-run.ts';

type Spawn = (bin: string, args: string[]) => {pid?: number};
const live = new Map<string, number>();
const realSpawn: Spawn = (bin, args) => {
  const child = nodeSpawn(bin, args, {detached: true, stdio: 'ignore', windowsVerbatimArguments: true});
  child.unref();
  return child;
};

/** Editor vivo con el MCP de Epic (experimental): apagado salvo `config.json: editorMcp: {enabled: true}`; no es la base del hito. */
export function createEditorMcpHandlers(deps: {spawn?: Spawn} = {}): Record<string, Handler> {
  return {
    'editor.mcp_start': async (command, ctx) => {
      const config = readConfig(ctx.dataDir) as {editorMcp?: {enabled?: unknown}};
      if (config.editorMcp?.enabled !== true) return {ok: false, reason: 'editor_mcp_disabled'};
      const project = targetProject(ctx, (command.payload as {project?: unknown}).project);
      if (live.has(project.name)) return {ok: true, project: project.name, pid: live.get(project.name)};
      const bin = join(dirname(assetConfig(ctx.dataDir).unrealPath ?? defaultUnrealCmd), 'UnrealEditor.exe');
      const child = (deps.spawn ?? realSpawn)(bin, [quote(project.uproject), '-ExecCmds="ModelContextProtocol.StartServer"']);
      if (child.pid) live.set(project.name, child.pid);
      appendEvent(ctx.db, 'editor.mcp_started', null, {project: project.name, pid: child.pid ?? null});
      return {ok: true, project: project.name, pid: child.pid ?? null};
    },
    'editor.mcp_stop': async () => {
      const stopped = [...live.values()];
      for (const pid of stopped) nodeSpawn('taskkill', ['/pid', String(pid), '/T', '/F'], {windowsHide: true});
      live.clear();
      return {ok: true, stopped: stopped.length};
    },
  };
}
