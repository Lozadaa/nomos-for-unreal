import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { request, serviceInfo } from './client.ts';
import { parseTaskSpec } from './task-spec.ts';
import { areas } from './routes/context.ts';

const groups=['task','worker','run','decision'];
function commandIndex(argv: string[]): number {
  for (let i=0;i<argv.length;i++) {
    if (['--data','--port','--session'].includes(argv[i])) {i++;continue;}
    if (argv[i].startsWith('--')) continue;
    return i;
  }
  return -1;
}
function required(value: unknown,name: string): string {
  if (typeof value!=='string' || !value.trim()) throw new Error(`Uso: falta ${name}`);return value;
}
function integer(value: string): number {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Uso: entero no negativo requerido');
  return Number(value);
}
export async function directorCli(argv: string[]): Promise<boolean> {
  const index=commandIndex(argv),group=argv[index];
  if (!groups.includes(group)) return false;
  const action=argv[index+1];
  const flags: Record<string,string[]>={
    'task.create':['title','area','spec-file'],'task.spec':['spec-file'],'task.show':[],
    'worker.start':['provider','role','skills','attempt'],'worker.send':['file','text','idempotency-key'],'worker.stop':[],
    'run.diff':[],'run.output':['since'],'decision.open':['file'],'decision.list':['state'],'decision.resolve':['option','by']};
  const allowed=flags[group+'.'+action];if (!allowed) throw new Error('Uso: subcomando desconocido');
  const options=Object.fromEntries(['data',...allowed].map(key=>[key,{type:'string' as const}]));
  const {values,positionals}=parseArgs({args:argv,allowPositionals:true,options});
  const [, ,rawId,...extra]=positionals;
  const needsId=!(group==='task' && action==='create' || group==='decision' && action==='list');
  if (extra.length || needsId && !rawId || !needsId && rawId) throw new Error('Uso: argumentos incorrectos');
  const id=rawId ? encodeURIComponent(rawId) : '',dataDir=resolve(values.data ?? '.kratos');
  const call=(path: string,data?: unknown)=>request(serviceInfo(dataDir),path,data);
  let result: unknown;
  if (group==='task') {
    if (action==='show') result=await call('/tasks/'+id);
    else {
      const parsed=values['spec-file']===undefined ? undefined : parseTaskSpec(readFileSync(values['spec-file'],'utf8'));
      if (action==='spec') {
        if (!parsed) throw new Error('Uso: falta --spec-file');
        const current=await call('/tasks/'+id);
        result=await call('/tasks/'+id+'/spec',{...parsed,area:current.task.area});
      } else {
        const title=required(values.title,'--title'),area=required(values.area,'--area');
        if (!(areas as readonly string[]).includes(area)) throw new Error('Uso: área inválida');
        const task=await call('/tasks',{title,area,...(parsed ?? {spec:'',acceptance:[]})});
        result=parsed ? await call('/tasks/'+encodeURIComponent(task.id)+'/spec',{...parsed,area}) : task;
      }
    }
  }
  if (group==='worker') {
    if (action==='start') {
      const provider=values.provider ?? 'codex',role=required(values.role ?? 'implementacion','--role');
      const attempt=integer(values.attempt ?? '1');
      const skills=values.skills===undefined || values.skills==='' ? [] : values.skills.split(',').map(s=>s.trim());
      if (provider!=='codex' || attempt<1 || skills.some(s=>!s)) throw new Error('Uso: worker inválido');
      result=await call('/tasks/'+id+'/worker',{provider,role,skills,attempt});
    }
    if (action==='send') {
      if ((values.file===undefined)===(values.text===undefined)) throw new Error('Uso: elige --file o --text');
      const text=required(values.file===undefined ? values.text : readFileSync(values.file,'utf8'),'texto');
      result=await call('/runs/'+id+'/message',{text,...(values['idempotency-key']===undefined ? {} : {idempotencyKey:required(values['idempotency-key'],'clave')})});
    }
    if (action==='stop') result=await call('/runs/'+id+'/stop',{});
  }
  if (group==='run') result=await call('/runs/'+id+'/'+action+(action==='output' ? '?since='+integer(values.since ?? '0') : ''));
  if (group==='decision') {
    if (action==='open') {
      const data=JSON.parse(readFileSync(required(values.file,'--file'),'utf8'));
      if (!data || typeof data!=='object' || Array.isArray(data)) throw new Error('Uso: JSON de Decisión inválido');
      result=await call('/decisions',{...data,taskId:rawId});
    }
    if (action==='list') {
      if (values.state!==undefined && !['open','resolved','stale'].includes(values.state)) throw new Error('Uso: estado inválido');
      result=await call('/decisions'+(values.state===undefined ? '' : '?state='+values.state));
    }
    if (action==='resolve') result=await call('/decisions/'+id+'/resolve',{
      optionId:required(values.option,'--option'),by:required(values.by,'--by')});
  }
  console.log(JSON.stringify(result));return true;
}
