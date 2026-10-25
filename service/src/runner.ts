import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Command } from './model.ts';
import { createOrca, OrcaError, type Orca } from './adapters/orca.ts';
import { createGit, type Git } from './adapters/git.ts';
import { beat, claim, complete, defer, fail, type Lane } from './commands.ts';
import { appendEvent } from './store.ts';
import { databaseDirectory } from './routes/index.ts';
import { dirname, resolve } from 'node:path';
import { closeRuns, recoverCommands } from './recovery.ts';
import { openStallDecisions } from './stall.ts';
import { tick as schedule } from './scheduler.ts';
import { readConfig } from './config.ts';
import { failureKind } from './failure-kind.ts';
import { closeIdleTerminals, refreshBusyTerminals, sweepIntervalMs, sweepTerminals } from './sweep.ts';
export type WorkerContext = {db: DatabaseSync; orca: Orca; git: Git; dataDir: string; projectDir: string};
export type Handler = (command: Command, context: WorkerContext) => Promise<object | void>;
export type RunnerStop = (() => void) & {drained: Promise<void>};
const lanes: Lane[] = ['normal', 'long'];
/** Dos carriles (hito 7): un comando a la vez en cada uno; el largo (editor, empaquetado) no frena al normal. */
export function startRunner(db: DatabaseSync, handlers: Record<string, Handler>, opts: {
  intervalMs?: number; schedulerIntervalMs?: number; heartbeatMs?: number;
  context?: Partial<WorkerContext>; orcaOptions?: Parameters<typeof createOrca>[0];
} = {}): RunnerStop {
  const dataDir=resolve(opts.context?.dataDir ?? databaseDirectory(db) ?? '.nomos');
  const owner=`runner:${process.pid}:${randomUUID().slice(0,8)}`;
  recoverCommands(db,{owner});
  let stopped=false;
  const active: Partial<Record<Lane,Command>>={}, inFlight: Record<Lane,boolean>={normal:false,long:false};
  const timers: Partial<Record<Lane,NodeJS.Timeout>>={};
  let drained!: () => void;
  const promise = new Promise<void>(accept => {drained=accept;});
  const settle=()=>{if(stopped && !inFlight.normal && !inFlight.long) drained();};
  const orca=createOrca({...opts.orcaOptions,onCompleted:async event=>{
    const current=active.normal ?? active.long;
    const payload=current?.payload as Record<string, any> | undefined;
    const run=payload?.runId ? db.prepare('select id,task_id from runs where id=?').get(payload.runId)
      : payload?.taskId ? db.prepare('select id,task_id from runs where task_id=? order by rowid desc limit 1').get(payload.taskId) : undefined;
    appendEvent(db,'tool.completed',null,{...event,commandId:current?.id,
      taskId:payload?.taskId ?? run?.task_id,runId:payload?.runId ?? run?.id});
    await opts.orcaOptions?.onCompleted?.(event);
  }});
  const context: WorkerContext={...opts.context,db,dataDir,projectDir:resolve(opts.context?.projectDir ?? dirname(dataDir)),
    git:opts.context?.git ?? createGit(),orca:opts.context?.orca ?? orca};
  let nextSchedule=Date.now()+(opts.schedulerIntervalMs ?? 5000),nextSweep=0;
  async function execute(command: Command) {
    const handler=handlers[command.type];
    const pulse=setInterval(()=>{try {beat(db,command.id);} catch {/* la base puede estar cerrándose */}},opts.heartbeatMs ?? 5000);
    try {
      if (!handler) throw new Error('unknown_command_type');
      const result=await handler(command,context);
      if(result && 'deferred' in result
        && result.deferred===true && 'reason' in result && typeof result.reason==='string')
        defer(db,command.id,result.reason,'delayMs' in result && typeof result.delayMs==='number' ? result.delayMs : undefined);
      else complete(db,command.id,result || undefined);
    } catch (error) {
      const message=error instanceof Error ? error.message : String(error);
      const retry=!!handler && !command.type.startsWith('worker.') && !command.type.startsWith('review.') && !(error instanceof OrcaError)
        && !message.startsWith('invalid_') && !message.startsWith('orca:')
        // decisiones de política (presupuesto, prohibido para IA, Meshy hard surface): reintentar no cambia nada
        && !['budget_exceeded','asset_ai_forbidden','meshy_kind_not_allowed','meshy_missing_key','cascadeur_not_justified'].includes(message);
      fail(db,command.id,message,{retry,kind:failureKind(error)});
      // hito 5b: fallo definitivo → sus runs propios (integración, pruebas) no quedan «en curso» reteniendo reservas
      if(db.prepare('select state from commands where id=?').get(command.id)?.state==='failed') closeRuns(db,command.id,message.split(/\r?\n/)[0]);
    } finally {clearInterval(pulse);}
  }
  async function tick(lane: Lane) {
    if (stopped) return;
    inFlight[lane]=true;
    try {
      // hito 13: terminales de workers sin uso se cierran a ritmo del planificador; cada 10 min (y al arrancar) se cuentan los vivos
      if(lane==='normal' && (Date.now()>=nextSweep || Date.now()>=nextSchedule)) try {
        if(Date.now()>=nextSweep) {nextSweep=Date.now()+sweepIntervalMs;await sweepTerminals(db,context.orca);}
        else await closeIdleTerminals(db,context.orca);
        // hito 17: el cupo cuenta los workers terminados que siguen trabajando en su terminal
        if(Date.now()>=nextSchedule) await refreshBusyTerminals(db,context.orca);
      } catch(error) {appendEvent(db,'sweep.error',null,{reason:error instanceof Error ? error.message : String(error)});}
      if(lane==='normal' && Date.now()>=nextSchedule) {
        nextSchedule=Date.now()+(opts.schedulerIntervalMs ?? 5000);
        // dueños muertos sin latido (otro proceso que cayó): una pasada por ciclo del planificador
        try {recoverCommands(db,{owner});} catch(error) {
          appendEvent(db,'recovery.error',null,{reason:error instanceof Error ? error.message : String(error)});
        }
        // hito 7: estado activo sin nada que lo mueva → Decisión, en vez de esperar en silencio
        try {openStallDecisions(db);} catch(error) {
          appendEvent(db,'stall.error',null,{reason:error instanceof Error ? error.message : String(error)});
        }
        if(handlers['worker.start']) try {schedule(db,readConfig(dataDir),context);} catch(error) {
          appendEvent(db,'scheduler.error',null,{reason:error instanceof Error ? error.message : String(error)});
        }
      }
      active[lane]=claim(db,owner,lane);
      if (active[lane]) await execute(active[lane]);
    } finally {
      active[lane]=undefined;inFlight[lane]=false;
      if (stopped) settle(); else timers[lane]=setTimeout(()=>tick(lane),opts.intervalMs ?? 1000);
    }
  }
  const stop=Object.assign(()=>{stopped=true;for(const lane of lanes) clearTimeout(timers[lane]);settle();},{drained:promise});
  for(const lane of lanes) timers[lane]=setTimeout(()=>tick(lane),0);
  return stop;
}
