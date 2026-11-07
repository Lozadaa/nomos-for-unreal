import { isOpencodeModel, type WorkerModel, type WorkerProvider } from '../config.ts';
import { leanSettingsFile } from '../claude-lean.ts';

export const briefLine='Lee el archivo .nomos-brief.md de esta carpeta y ejecuta lo que dice.';
function adapter(provider:string):WorkerProvider {
  if(provider==='codex'||provider==='claude'||provider==='opencode') return provider;
  throw new Error('invalid_worker_provider');
}
function opencode(model:string,flags=''):string {
  if(!isOpencodeModel(model)) throw new Error('invalid_opencode_model');
  return `opencode run${flags} --auto --model ${model}`;
}
// Hito 12: OpenCode corre con `run` (salida plana que Orca lee) y el brief viaja en la orden; termina al acabar.
export function launchCommand(provider:string,model:string='sonnet',title='nomos',sessionId?:string):string {
  const kind=adapter(provider);
  return kind==='codex' ? 'codex --yolo --no-daemon' : kind==='opencode' ? `${opencode(model)} --title ${title} ${briefLine}`
    : `claude --model ${model as WorkerModel} --dangerously-skip-permissions${lean()}${sessionId ? ` --session-id ${sessionId}` : ''}`;
}
// x10: sin los plugins del usuario que un juego no usa y compactando a 200 k (ver claude-lean.ts)
const lean=()=>{const file=leanSettingsFile();return file ? ` --settings ${file}` : '';};
export function readyPattern(provider:string):RegExp {
  const kind=adapter(provider);
  return kind==='codex' ? /Ask\s*Codex/i : kind==='opencode' ? /opencode run/i : /bypass permissions|Try "/i;
}
export function launchPlan(provider:string,model:string,short:string,sessionId?:string):{command:string;ready:RegExp;briefInCommand:boolean} {
  return {command:launchCommand(provider,model,`nomos-${short}`,sessionId),ready:readyPattern(provider),briefInCommand:provider==='opencode'};
}
/** Lo que se escribe en el terminal para una respuesta o corrección: OpenCode ya salió y continúa su sesión. */
export function followUp(provider:string,model:string|undefined,line:string):string {
  return provider==='opencode' ? `${opencode(model ?? '',' --continue')} ${line}` : line;
}
export const opencodeMissing=(line:string)=>/(['"])opencode\1 (is not recognized|no se reconoce)|\bopencode: (command )?not found/i.test(line);
/** Hito 12: OpenCode no pudo ni empezar (sin PATH o credencial rechazada); devuelve la causa para el director. */
export function opencodeFatal(lines:string[]):string|undefined {
  if(lines.some(opencodeMissing)) return 'OpenCode no está instalado o no está en el PATH del terminal';
  if(lines.some(line=>/^Error: .*Invalid credential/i.test(line.trim()))) return 'OpenCode rechazó las credenciales: ejecuta opencode auth login';
}
/** Hito 18: solo al final de la salida (las opciones del permiso ocupan unas líneas) y con forma de pregunta; en el código no. */
export function permissionPrompt(provider:string,lines:string[]):string|null {
  return provider==='claude' ? lines.filter(line=>line.trim()).slice(-6)
    .find(line=>/\bDo you want to\b|\bAllow\b|\(y\/n\)/i.test(line) && /\?\s*$|\(y\/n\)/i.test(line)) ?? null : null;
}
/** Hito 18: la última línea con texto es una pregunta o un prompt vacío (`>`, `›`, el marco o el pie de Claude). */
export function asksForInput(lines:string[]):boolean {
  const last=(lines.filter(line=>line.trim()).at(-1) ?? '').replace(/[│┃╭╮╰╯─━┌┐└┘|]/g,'').trim();
  return !last || /[?？]$/.test(last) || /^[>❯›](\s|$)/.test(last) || /bypass permissions on|for shortcuts/.test(last);
}
