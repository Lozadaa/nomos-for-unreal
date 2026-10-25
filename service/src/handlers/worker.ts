import type { Handler } from '../runner.ts';
import { workerStart } from './worker-start.ts';
import { workerPoll } from './worker-poll.ts';
import { reviewStart } from './review-start.ts';
import { workerSend, workerStop } from './worker-send.ts';
import { OrcaError } from '../adapters/orca.ts';
import { workerFailure } from './worker-failure.ts';
import { taskReconcile } from './reconcile.ts';
import { orcaBack, orcaGrace } from './orca-down.ts';
import { workerRecover } from './worker-recover.ts';
export function createWorkerHandlers(): Record<string, Handler> {
  const handlers: Record<string,Handler>={'worker.start':workerStart, 'worker.poll':workerPoll,
    'worker.send':workerSend, 'worker.stop':workerStop,'review.start':reviewStart,'review.poll':workerPoll,
    'task.reconcile':taskReconcile};
  // hito 22: relanzar tras un reinicio no pasa por workerFailure (su run ya está cerrada)
  return Object.fromEntries([['worker.recover',workerRecover],...Object.entries(handlers).map(([type,handler])=>[type,async (cmd,ctx)=>{
    try {const result=await handler(cmd,ctx);orcaBack(ctx,cmd.payload as any);return result;}
    catch (error) {
      const grace=orcaGrace(ctx,type,cmd.payload as any,error);
      if (grace) return grace;
      if (error instanceof OrcaError || error instanceof Error && error.message.startsWith('orca:')) {
        const payload=cmd.payload as any;
        const cause=error instanceof OrcaError ? `orca: ${error.code}: ${error.detail}` : (error as Error).message;
        workerFailure(ctx.db,{...payload,...(type==='review.start' ? {role:'revisor',startCommandId:cmd.id} : {})},cause);
      }
      throw error;
    }
  }])]);
}
