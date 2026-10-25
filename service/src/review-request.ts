import type { DatabaseSync } from 'node:sqlite';
import type { Git } from './adapters/git.ts';
import { transaction } from './repo/rows.ts';
import { enqueue, resumePolicyCommand } from './commands.ts';
import { reviewTarget, reviewSnapshot } from './review.ts';
import { chooseProvider } from './scheduler-provider.ts';
import { readConfig, type WorkerProvider } from './config.ts';
import { appendEvent } from './store.ts';

/** `nomos task review` (y, hito 18, el barrido de atascos): encola o rearma `review.start` sobre el último commit; devuelve su id. */
export async function requestReview(db:DatabaseSync,dataDir:string|undefined,git:Git,taskId:string,implementerRunId?:string):Promise<string> {
  const target=reviewTarget(db,taskId,implementerRunId);
  const {snapshot}=await reviewSnapshot({db,git},taskId,target.implementer.id);
  return transaction(db,()=>{
    const {task,implementer,generation:inputGeneration}=reviewTarget(db,taskId,target.implementer.id);
    if(inputGeneration!==snapshot.inputGeneration) throw new Error('invalid_review_generation');
    const generation=snapshot.generation;
    const key=`review.start:${task.id}:${implementer.id}`;
    const previous=db.prepare('select * from commands where idempotency_key=?').get(key);
    if(previous && JSON.parse(previous.payload as string).generation===generation) {
      if(previous.state==='done'&&!task.decisionId&&!task.blockedReason) {
        const result=db.prepare("select payload from events where type='command.done' and json_extract(payload,'$.commandId')=? order by seq desc limit 1").get(previous.id);
        const completion=result ? JSON.parse(result.payload as string).result : undefined;
        if(completion?.policyBlocked) {
          const decision=db.prepare("select id from decisions where id=? and task_id=? and state='resolved'").get(completion.decisionId,task.id);
          if(decision) resumePolicyCommand(db,previous.id as string,decision.id as string);
        }
      }
      return previous.id;
    }
    if(previous && !['done','failed'].includes(previous.state as string)
      || db.prepare("select id from runs where task_id=? and state='running'").get(task.id)) throw new Error('invalid_review_active');
    const selected=chooseProvider('revisor',readConfig(dataDir),{codex:0,claude:0,opencode:0},implementer.provider as WorkerProvider);
    const payload={taskId:task.id,implementerRunId:implementer.id,generation,...(selected.provider ? {provider:selected.provider} : {})};
    db.prepare('update tasks set review_approved=0 where id=?').run(task.id);
    if(!previous) return enqueue(db,'review.start',payload,key).id;
    db.prepare(`update commands set payload=?,state='pending',attempts=0,error=null,claimed_by=null,
      started_at=null,finished_at=null,not_before=null,updated_at=? where id=?`)
      .run(JSON.stringify(payload),new Date().toISOString(),previous.id);
    appendEvent(db,'command.pending',null,{commandId:previous.id,type:'review.start',payload,idempotencyKey:key,
      state:'pending',rearmed:true,previousGeneration:JSON.parse(previous.payload as string).generation});
    return previous.id;
  });
}
