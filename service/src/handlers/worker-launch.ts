import { isOpencodeModel, type WorkerModel, type WorkerProvider } from '../config.ts';

export const briefLine='Lee el archivo .kratos-brief.md de esta carpeta y ejecuta lo que dice.';
function adapter(provider:string):WorkerProvider {
  if(provider==='codex'||provider==='claude'||provider==='opencode') return provider;
  throw new Error('invalid_worker_provider');
}
function opencode(model:string,flags=''):string {
  if(!isOpencodeModel(model)) throw new Error('invalid_opencode_model');
  return `opencode run${flags} --auto --model ${model}`;
}
// Hito 12: OpenCode corre con `run` (salida plana que Orca lee) y el brief viaja en la orden; termina al acabar.
export function launchCommand(provider:string,model:string='sonnet',title='kratos'):string {
  const kind=adapter(provider);
  return kind==='codex' ? 'codex --yolo --no-daemon' : kind==='opencode' ? `${opencode(model)} --title ${title} ${briefLine}`
    : `claude --model ${model as WorkerModel} --dangerously-skip-permissions`;
}
export function readyPattern(provider:string):RegExp {
  const kind=adapter(provider);
  return kind==='codex' ? /Ask\s*Codex/i : kind==='opencode' ? /opencode run/i : /bypass permissions|Try "/i;
}
export function launchPlan(provider:string,model:string,short:string):{command:string;ready:RegExp;briefInCommand:boolean} {
  return {command:launchCommand(provider,model,`kratos-${short}`),ready:readyPattern(provider),briefInCommand:provider==='opencode'};
}
/** Lo que se escribe en el terminal para una respuesta o corrección: OpenCode ya salió y continúa su sesión. */
export function followUp(provider:string,model:string|undefined,line:string):string {
  return provider==='opencode' ? `${opencode(model ?? '',' --continue')} ${line}` : line;
}
export const opencodeMissing=(line:string)=>/(['"])opencode\1 (is not recognized|no se reconoce)|\bopencode: (command )?not found/i.test(line);
export function permissionPrompt(provider:string,lines:string[]):string|null {
  return provider==='claude' ? lines.find(line=>/\bDo you want to\b|\bAllow\b|\(y\/n\)/i.test(line)) ?? null : null;
}
