import type { Handler } from '../runner.ts';
import { workerStart } from './worker-start.ts';
import { workerPoll } from './worker-poll.ts';
import { reviewStart } from './review-start.ts';
import { workerSend, workerStop } from './worker-send.ts';
import { OrcaError } from '../adapters/orca.ts';
import { workerFailure } from './worker-failure.ts';
export function createWorkerHandlers(): Record<string, Handler> {
  const handlers: Record<string,Handler>={'worker.start':workerStart, 'worker.poll':workerPoll,
    'worker.send':workerSend, 'worker.stop':workerStop,'review.start':reviewStart,'review.poll':workerPoll};
  return Object.fromEntries(Object.entries(handlers).map(([type,handler])=>[type,async (cmd,ctx)=>{
    try {return await handler(cmd,ctx);}
    catch (error) {
      if (error instanceof OrcaError || error instanceof Error && error.message.startsWith('orca:')) {
        const payload=cmd.payload as any;
        const cause=error instanceof OrcaError ? `orca: ${error.code}: ${error.detail}` : (error as Error).message;
        workerFailure(ctx.db,{...payload,...(type==='review.start' ? {role:'revisor',startCommandId:cmd.id} : {})},cause);
      }
      throw error;
    }
  }]));
}
