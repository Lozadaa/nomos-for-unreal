import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { request, serviceInfo } from './client.ts';
import { parseTaskSpec } from './task-spec.ts';
import { areas } from './routes/context.ts';
import { buildSummary } from './build-info.ts';

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
/** Hito 13: prioridad entera (mayor arranca antes), también negativa. */
function priorityValue(value: string | undefined): number {
  if (value===undefined || !/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Uso: prioridad entera requerida');
  return Number(value);
}
export async function directorCli(argv: string[]): Promise<boolean> {
  const index=commandIndex(argv),group=argv[index];
  if (group==='play') {
    // hito 14: la última build del juego; el servicio elige el ejecutable, nunca la orden
    const {values,positionals}=parseArgs({args:argv,allowPositionals:true,options:{data:{type:'string'},stop:{type:'boolean'},status:{type:'boolean'}}});
    if (positionals.length!==1 || (values.stop && values.status)) throw new Error('Uso: nomos play [--stop|--status]');
    const info=serviceInfo(resolve(values.data ?? '.nomos'));
    // hito 17: la línea humana («Build de abc1234, 12 min, anterior a main») va con el JSON de siempre
    if (values.status) {const now=await request(info,'/play');console.log(JSON.stringify({...now,...(now.build ? {text:buildSummary(now.build)} : {})}));return true;}
    if (values.stop) {console.log(JSON.stringify(await request(info,'/play/stop',{})));return true;}
    try {console.log(JSON.stringify(await request(info,'/play',{})));}
    catch (error) {
      const now=await request(info,'/play');
      if (now.running) throw new Error(`Ya hay una partida abierta (pid ${now.running.pid})`);
      if (!now.build) throw new Error(now.reason);
      throw error;
    }
    return true;
  }
  if (group==='pausar' || group==='reanudar') {
    // hito 6: el planificador deja de arrancar workers; integraciones y cierres en curso terminan
    const {values}=parseArgs({args:argv,allowPositionals:true,options:{data:{type:'string'}}});
    const status=await request(serviceInfo(resolve(values.data ?? '.nomos')),'/director/'+(group==='pausar' ? 'pause' : 'resume'),{});
    console.log(JSON.stringify(status));return true;
  }
  if (!groups.includes(group)) return false;
  const action=argv[index+1];
  const flags: Record<string,string[]>={
    'task.create':['title','area','spec-file','leases','depends','role','provider','message','priority'],'task.priority':[],'task.spec':['spec-file'],'task.show':[],'task.review':[],'task.check':['run'],
    'task.integrate':[],'task.finalize':[],'task.reconcile':[],'task.continue':['file','text'],
    'worker.start':['provider','role','skills','attempt'],'worker.send':['file','text','idempotency-key','message'],'worker.stop':[],
    'run.diff':[],'run.output':['since'],'decision.open':['file','message'],'decision.list':['state'],'decision.resolve':['option','by']};
  const allowed=flags[group+'.'+action];if (!allowed) throw new Error('Uso: subcomando desconocido');
  const options=Object.fromEntries(['data',...allowed].map(key=>[key,{type:'string' as const}]));
  // `task priority TAREA -1`: un entero negativo es un valor, no una opción
  const args=group+'.'+action==='task.priority' ? argv.map(a=>/^-\d+$/.test(a) ? 'n'+a : a) : argv;
  const {values,positionals}=parseArgs({args,allowPositionals:true,options});
  const [, ,rawId,...rest]=positionals;
  const level=group+'.'+action==='task.priority' ? rest.shift() : undefined;
  const extra=rest,needsId=!(group==='task' && action==='create' || group==='decision' && action==='list');
  if (extra.length || needsId && !rawId || !needsId && rawId) throw new Error('Uso: argumentos incorrectos');
  const id=rawId ? encodeURIComponent(rawId) : '',dataDir=resolve(values.data ?? '.nomos');
  const call=(path: string,data?: unknown,timeoutMs?: number)=>request(serviceInfo(dataDir),path,data,timeoutMs);
  // hito 10: lo que el director crea por un mensaje del chat se enlaza a él (sin --message, el servicio lo infiere)
  const message=values.message===undefined ? {} : {messageId:required(values.message,'--message')};
  let result: unknown;
  if (group==='task') {
    if (action==='show') result=await call('/tasks/'+id);
    else if(action==='priority') result=await call('/tasks/'+id+'/priority',{priority:priorityValue(level?.replace(/^n/,''))});
    // la revisión calcula el diff antes de responder: con 1,5 GB de contenido tarda más de los 10 s por defecto
    else if(action==='review') result=await call('/tasks/'+id+'/review',{},120_000);
    else if(action==='check') result=await call('/tasks/'+id+'/checks',values.run===undefined ? {} : {runId:required(values.run,'--run')});
    else if(action==='integrate' || action==='finalize' || action==='reconcile') result=await call('/tasks/'+id+'/'+action,{});
    else if(action==='continue') {
      if ((values.file===undefined)===(values.text===undefined)) throw new Error('Uso: elige --file o --text');
      result=await call('/tasks/'+id+'/continue',{text:required(values.file===undefined ? values.text : readFileSync(values.file,'utf8'),'texto')});
    }
    else {
      const parsed=values['spec-file']===undefined ? undefined : parseTaskSpec(readFileSync(values['spec-file'],'utf8'));
      if (action==='spec') {
        if (!parsed) throw new Error('Uso: falta --spec-file');
        const current=await call('/tasks/'+id);
        result=await call('/tasks/'+id+'/spec',{...parsed,area:current.task.area});
      } else {
        const title=required(values.title,'--title'),area=required(values.area,'--area');
        if (!(areas as readonly string[]).includes(area)) throw new Error('Uso: área inválida');
        const list=(value?:string)=>value===undefined ? undefined : value.split(',').map(s=>s.trim()).filter(Boolean);
        for(const dep of list(values.depends) ?? []) await call('/tasks/'+encodeURIComponent(dep));
        const task=await call('/tasks',{title,area,...(parsed ?? {spec:'',acceptance:[]}),leases:list(values.leases),
          ...(values.priority===undefined ? {} : {priority:priorityValue(values.priority)}),
          assigneeRole:values.role,assigneeProvider:values.provider,...message});
        if(values.depends!==undefined) await call('/tasks/'+encodeURIComponent(task.id)+'/depends',{dependsOn:list(values.depends)});
        result=parsed ? await call('/tasks/'+encodeURIComponent(task.id)+'/spec',{...parsed,area}) : task;
      }
    }
  }
  if (group==='worker') {
    if (action==='start') {
      const provider=values.provider ?? 'claude',role=required(values.role ?? 'implementacion','--role');
      // hito 21: sin --attempt decide el servicio (el intento vivo o el siguiente al último cerrado)
      const attempt=values.attempt===undefined ? undefined : integer(values.attempt);
      const skills=values.skills===undefined || values.skills==='' ? [] : values.skills.split(',').map(s=>s.trim());
      if (!['codex','claude','opencode'].includes(provider) || (attempt ?? 1)<1 || skills.some(s=>!s)) throw new Error('Uso: worker inválido');
      result=await call('/tasks/'+id+'/worker',{provider,role,skills,...(attempt===undefined ? {} : {attempt})});
    }
    if (action==='send') {
      if ((values.file===undefined)===(values.text===undefined)) throw new Error('Uso: elige --file o --text');
      const text=required(values.file===undefined ? values.text : readFileSync(values.file,'utf8'),'texto');
      result=await call('/runs/'+id+'/message',{text,...message,...(values['idempotency-key']===undefined ? {} : {idempotencyKey:required(values['idempotency-key'],'clave')})});
    }
    if (action==='stop') result=await call('/runs/'+id+'/stop',{});
  }
  if (group==='run') result=await call('/runs/'+id+'/'+action+(action==='output' ? '?since='+integer(values.since ?? '0') : ''));
  if (group==='decision') {
    if (action==='open') {
      const data=JSON.parse(readFileSync(required(values.file,'--file'),'utf8'));
      if (!data || typeof data!=='object' || Array.isArray(data)) throw new Error('Uso: JSON de Decisión inválido');
      result=await call('/decisions',{...data,taskId:rawId,...message});
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
