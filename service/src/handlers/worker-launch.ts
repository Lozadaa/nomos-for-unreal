import type { WorkerModel, WorkerProvider } from '../config.ts';

function adapter(provider:string):Exclude<WorkerProvider,'opencode'> {
  if(provider==='codex'||provider==='claude') return provider;
  throw new Error(provider==='opencode' ? 'unsupported_worker_provider' : 'invalid_worker_provider');
}
export function launchCommand(provider:string,model:WorkerModel='sonnet'):string {
  return adapter(provider)==='codex' ? 'codex --yolo --no-daemon'
    : `claude --model ${model} --dangerously-skip-permissions`;
}
export function readyPattern(provider:string):RegExp {
  return adapter(provider)==='codex' ? /Ask\s*Codex/i : /bypass permissions|Try "/i;
}
export function permissionPrompt(provider:string,lines:string[]):string|null {
  return provider==='claude' ? lines.find(line=>/\bDo you want to\b|\bAllow\b|\(y\/n\)/i.test(line)) ?? null : null;
}
