import { createHash } from 'node:crypto';
import type { WorkerContext } from '../runner.ts';
import type { Task, Budget } from '../model.ts';
import { filtered } from '../repo/rows.ts';
import { openDecision, listDecisions } from '../repo/decisions.ts';
import { blockTask } from '../repo/tasks.ts';
import { readConfig } from '../config.ts';

export function normalizedPaths(paths: unknown): string[] {
  if (!Array.isArray(paths)) throw new Error('invalid_worker_scope');
  return paths.map(path=>{
    if (typeof path!=='string' || !path.trim() || /^[\\/]|:|[\x00-\x1f*?\[\]{}!()]/.test(path)) throw new Error('invalid_worker_scope');
    const parts=path.replaceAll('\\','/').split('/').filter(Boolean);
    if (parts.some(p=>p!==p.trim()||p.endsWith('.')) || !parts.length) throw new Error('invalid_worker_scope');
    return parts.join('/');
  });
}
export function decisionGate(ctx: WorkerContext, task: Task, kind: string, reason: string, content: unknown,
  options=[{id:'approve',label:'Autorizar',description:'Continuar esta ejecución'},
    {id:'cancel',label:'Cancelar',description:'No ejecutar'}], canApprove=true): boolean {
  const ref=createHash('sha256').update(JSON.stringify(content)).digest('hex');
  const previous=listDecisions(ctx.db).reverse().find(d=>d.taskId===task.id && d.evidence.some(e=>e.kind===`gate:${kind}`&&e.ref===ref));
  if (previous?.state==='open') return false;
  if (previous?.state==='resolved') {
    if (canApprove && previous.chosenOptionId==='approve') return true;
    blockTask(ctx.db,task.id,reason);return false;
  }
  openDecision(ctx.db,{taskId:task.id,reason,evidence:[{kind:`gate:${kind}`,ref},{kind:'context',ref:JSON.stringify(content)}],options});
  return false;
}
export async function workerPolicy(ctx: WorkerContext,task: Task,execution: string,checkGit=false): Promise<boolean> {
  const scope=normalizedPaths(task.scope),config=readConfig(ctx.dataDir);
  let critical:string[];
  try {critical=normalizedPaths(config.criticalSystems === undefined ? [] : config.criticalSystems);}
  catch {throw new Error('invalid_worker_config');}
  const fold=(p:string)=>process.platform==='win32' ? p.toLowerCase() : p;
  const overlaps=(a:string,b:string)=>a===b||a.startsWith(b+'/')||b.startsWith(a+'/');
  if (critical.length && (!scope.length || scope.some(s=>critical.some(c=>overlaps(fold(s),fold(c)))))) {
    if (!decisionGate(ctx,task,'critical','Autorizar cambios en sistemas críticos',
      {spec:task.spec,scope,criticalSystems:critical})) return false;
  }
  if (!scope.length) throw new Error('invalid_worker_scope');
  const budgets=filtered<Budget>(ctx.db,'budgets').filter(b=>b.scope==='workspace'||b.scope==='task'&&b.scopeId===task.id||b.id===task.budgetId);
  if (task.budgetId && !budgets.some(b=>b.id===task.budgetId)) throw new Error('unknown_budget');
  for (const budget of budgets) {
    if (budget.tokens===null) continue;
    if (budget.scope==='task'&&budget.scopeId!==task.id) throw new Error('invalid_worker_budget');
    const spent=Number(ctx.db.prepare("select coalesce(sum(amount),0) n from spends where budget_id=? and kind='tokens'").get(budget.id)!.n);
    const remaining=budget.tokens-spent, exhausted=remaining<=0;
    if (!decisionGate(ctx,task,'tokens',exhausted ? 'Presupuesto de tokens agotado' : 'Autorizar ejecución sin medición exacta de tokens',
      {budgetId:budget.id,limit:budget.tokens,remaining,execution},exhausted
        ? [{id:'increase',label:'Ampliar presupuesto',description:'Revisar límite antes de continuar'},{id:'cancel',label:'Cancelar',description:'No ejecutar'}]
        : undefined,!exhausted)) return false;
  }
  if (checkGit) {
    let valid=await ctx.git.isRepo(ctx.projectDir);
    if (valid) try {await ctx.git.head(ctx.projectDir);} catch {valid=false;}
    if (!valid) return decisionGate(ctx,task,'init_git','Inicializar Git en el proyecto',{path:ctx.projectDir},
      [{id:'initialize',label:'Inicializar Git',description:'Autorizar al director git init y commit inicial'},
        {id:'cancel',label:'Cancelar',description:'No iniciar worker'}],false);
  }
  return !task.decisionId;
}
