import type { DatabaseSync } from 'node:sqlite';
import type { Command, Decision, Run, Worktree } from '../model.ts';
import { filtered, read, transaction } from '../repo/rows.ts';
import { requireTask } from '../repo/tasks.ts';
import { resumePolicyCommand } from '../commands.ts';

/** Solo un rechazo previo a efectos admite continuar el mismo arranque por POST explícito. */
export function resumeWorkerStart(db: DatabaseSync,commandId:string): void {
  transaction(db,()=>{
    const command=read<Command>(db,'commands',commandId)!;
    if(command.type!=='worker.start' || command.state!=='done') return;
    const payload=JSON.parse(command.payload as unknown as string);
    const task=requireTask(db,payload.taskId);
    if(task.state!=='preparada' || task.decisionId || task.blockedReason || task.worktreeId) return;
    const history=filtered<Run>(db,'runs',{taskId:task.id});
    if(history.some(r=>r.attempt===(payload.attempt ?? 1) || r.state==='running' || r.metadata.uncertain)
      || filtered<Worktree>(db,'worktrees',{taskId:task.id}).some(w=>w.state!=='closed')) return;
    const event=db.prepare("select payload from events where type='command.done' and json_extract(payload,'$.commandId')=? order by seq desc limit 1").get(commandId);
    const completion=event ? JSON.parse(event.payload as string) : undefined;
    if(completion?.attempts!==command.attempts || completion?.result?.policyBlocked!==true) return;
    const decisionId=completion.result.decisionId;
    const decision=typeof decisionId==='string' ? read<Decision>(db,'decisions',decisionId) : undefined;
    if(decision?.state!=='resolved' || decision.taskId!==task.id) return;
    resumePolicyCommand(db,commandId,decision.id);
  });
}
