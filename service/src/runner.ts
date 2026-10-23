import type { DatabaseSync } from 'node:sqlite';
import type { Command } from './model.ts';
import { createOrca, OrcaError, type Orca } from './adapters/orca.ts';
import { createGit, type Git } from './adapters/git.ts';
import { claim, complete, defer, fail } from './commands.ts';
import { appendEvent } from './store.ts';
import { databaseDirectory } from './routes/index.ts';
import { dirname, resolve } from 'node:path';
import { recoverCommands } from './recovery.ts';
import { tick as schedule } from './scheduler.ts';
import { readConfig } from './config.ts';
export type WorkerContext = {db: DatabaseSync; orca: Orca; git: Git; dataDir: string; projectDir: string};
export type Handler = (command: Command, context: WorkerContext) => Promise<object | void>;
export type RunnerStop = (() => void) & {drained: Promise<void>};
export function startRunner(db: DatabaseSync, handlers: Record<string, Handler>, opts: {
  intervalMs?: number; schedulerIntervalMs?: number; context?: Partial<WorkerContext>; orcaOptions?: Parameters<typeof createOrca>[0];
} = {}): RunnerStop {
  const dataDir=resolve(opts.context?.dataDir ?? databaseDirectory(db) ?? '.kratos');
  recoverCommands(db);
  let active: Command | undefined, stopped=false, inFlight=false, timer: NodeJS.Timeout;
  let drained!: () => void;
  const promise = new Promise<void>(accept => {drained=accept;});
  const orca=createOrca({...opts.orcaOptions,onCompleted:async event=>{
    const payload=active?.payload as Record<string, any> | undefined;
    const run=payload?.runId ? db.prepare('select id,task_id from runs where id=?').get(payload.runId)
      : payload?.taskId ? db.prepare('select id,task_id from runs where task_id=? order by rowid desc limit 1').get(payload.taskId) : undefined;
    appendEvent(db,'tool.completed',null,{...event,commandId:active?.id,
      taskId:payload?.taskId ?? run?.task_id,runId:payload?.runId ?? run?.id});
    await opts.orcaOptions?.onCompleted?.(event);
  }});
  const context: WorkerContext={...opts.context,db,dataDir,projectDir:resolve(opts.context?.projectDir ?? dirname(dataDir)),
    git:opts.context?.git ?? createGit(),orca:opts.context?.orca ?? orca};
  let nextSchedule=Date.now()+(opts.schedulerIntervalMs ?? 5000);
  async function tick() {
    if (stopped) return;
    inFlight=true;
    try {
      if(handlers['worker.start'] && Date.now()>=nextSchedule) {
        nextSchedule=Date.now()+(opts.schedulerIntervalMs ?? 5000);
        try {schedule(db,readConfig(dataDir),context);} catch(error) {
          appendEvent(db,'scheduler.error',null,{reason:error instanceof Error ? error.message : String(error)});
        }
      }
      active=claim(db,`runner:${process.pid}`);
      if (active) {
        const handler=handlers[active.type];
        try {
          if (!handler) throw new Error('unknown_command_type');
          const result=await handler(active,context);
          if(result && 'deferred' in result
            && result.deferred===true && 'reason' in result && typeof result.reason==='string')
            defer(db,active.id,result.reason);
          else complete(db,active.id,result || undefined);
        } catch (error) {
          const message=error instanceof Error ? error.message : String(error);
          const retry=!!handler && !active.type.startsWith('worker.') && !active.type.startsWith('review.') && !(error instanceof OrcaError)
            && !message.startsWith('invalid_') && !message.startsWith('orca:');
          fail(db,active.id,message,{retry});
        }
      }
    } finally {
      active=undefined;inFlight=false;
      if (stopped) drained(); else timer=setTimeout(tick,opts.intervalMs ?? 1000);
    }
  }
  const stop=Object.assign(()=>{stopped=true;clearTimeout(timer);if (!inFlight) drained();},{drained:promise});
  timer=setTimeout(tick,0);
  return stop;
}
