import type { DatabaseSync } from 'node:sqlite';
import type { Run, RunMetadata, Worktree } from '../model.ts';
import { read } from './rows.ts';
import { enqueue } from '../commands.ts';
import { randomUUID } from 'node:crypto';

export function requireRun(db: DatabaseSync, id: string): Run {
  const run=read<Run>(db,'runs',id);if (!run) throw new Error('unknown_run');return run;
}
export function updateRun(db: DatabaseSync,id: string,metadata: Partial<RunMetadata>, fields: {
  state?: Run['state']; sessionRef?: string; finishedAt?: string | null; summary?: string | null;
} = {}): Run {
  const run=requireRun(db,id),next={...run.metadata,...metadata};
  db.prepare('update runs set metadata=?,updated_at=? where id=?').run(JSON.stringify(next),new Date().toISOString(),id);
  for (const [key,value] of Object.entries(fields)) {
    const column=key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase());
    db.prepare(`update runs set ${column}=? where id=?`).run(value,id);
  }
  return requireRun(db,id);
}
export function runTree(db: DatabaseSync,run: Run): Worktree {
  const tree=run.metadata.worktreeId && read<Worktree>(db,'worktrees',run.metadata.worktreeId);
  if (!tree || !run.sessionRef) throw new Error('invalid_worker_session');return tree;
}
export function invalidateImplementation(db:DatabaseSync,runId:string):void {
  const run=requireRun(db,runId);if(run.role==='revisor') return;
  updateRun(db,runId,{implementationGeneration:(run.metadata.implementationGeneration ?? 0)+1});
  db.prepare('update tasks set review_approved=0 where id=?').run(run.taskId);
}
export function queuePoll(db: DatabaseSync,run: Run): void {
  const generation=run.metadata.pollGeneration ?? 0;
  const type=run.role==='revisor' ? 'review.poll' : 'worker.poll';
  enqueue(db,type,{runId:run.id,generation},
    `${type}:${run.id}:${generation}:${run.metadata.cursor ?? 'inicio'}:${randomUUID()}`,
    {notBefore:new Date(Date.now()+5000).toISOString()});
}
