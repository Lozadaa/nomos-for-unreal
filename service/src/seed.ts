import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './repo/rows.ts';
import { writer, productionRows, catalogRows } from './seed-data.ts';
import { artifactRows } from './seed-artifacts.ts';

export function seed(db: DatabaseSync, opts: {force?: boolean, now?: Date} = {}): {
  tasks: number; runs: number; events: number; catalog: number;
} {
  const now = opts.now ?? new Date('2026-10-22T20:00:00Z');
  const timestamp = now.toISOString();
  return transaction(db, () => {
    if (db.prepare('select 1 from tasks limit 1').get() && !opts.force) throw new Error('not_empty');
    if (opts.force) {
      for (const table of ['spends','budgets','decisions','artifacts','test_runs','worktrees','runs','tasks','catalog_entries','commands']) {
        db.exec(`delete from ${table}`);
      }
      // Retain hito 0 envelopes and AUTOINCREMENT high-water mark for SSE consumers.
      db.exec("delete from events where message_id is null and (type like 'task.%' or type like 'run.%' or type like 'decision.%' or type like 'artifact.%' or type like 'command.%')");
    }
    const put = writer(db,timestamp);
    productionRows(put); catalogRows(put); artifactRows(db,put);
    db.prepare('update runs set started_at=?').run(new Date(now.getTime()-3600000).toISOString());
    const sources = ['Kratos','Codex','Claude Code','Meshy','Blender','Unreal','builds'];
    for (let i=0;i<60;i++) {
      const decision = i===59;
      const payload = decision ? {source:'Kratos',taskId:'seed-task-04',decisionId:'seed-decision-01',
        reason:'Elegir personaje base: 3 candidatos del catálogo',priorBlockedReason:null,runId:null,correlation:'seed-event-59'} :
        {source:sources[i%7],taskId:`seed-task-${String(i%12+1).padStart(2,'0')}`,
          runId:({5:'seed-run-01',7:'seed-run-02',6:'seed-run-03'} as Record<number,string>)[i%12+1] ?? null,correlation:i ? `seed-event-${String(i).padStart(2,'0')}` : null};
      db.prepare('insert into events(id,type,message_id,payload,created_at) values(?,?,null,?,?)').run(
        `seed-event-${String(i+1).padStart(2,'0')}`,decision ? 'decision.opened' : 'task.activity',
        JSON.stringify(payload),new Date(now.getTime()-(60-i)*60000).toISOString());
    }
    const last = db.prepare("select max(seq) seq from events where json_extract(payload,'$.taskId')='seed-task-04'").get()!;
    put('decisions','seed-decision-01',{taskId:'seed-task-04',reason:'Elegir personaje base: 3 candidatos del catálogo',
      evidence:[{kind:'catalog',ref:'seed-catalog-04'},{kind:'catalog',ref:'seed-catalog-05'},{kind:'catalog',ref:'seed-catalog-06'}],
      options:[4,5,6].map(n=>({id:`seed-catalog-0${n}`,label:`Candidato ${n-3}`,description:'Personaje del catálogo local'})),
      chosenOptionId:null,resolvedBy:null,resolvedAt:null,
      contextHash:createHash('sha256').update('seed-task-04:'+last.seq).digest('hex'),state:'open'});
    return {tasks:12,runs:3,events:60,catalog:30};
  });
}
