import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../service/src/db.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { enqueue } from '../../service/src/commands.ts';
import { listEvents } from '../../service/src/store.ts';
import { cancelDecisionZombies } from '../../service/src/zombies.ts';

// Hito 22: un checks.run de J1.2 ligado a una Decisión caducada se aplazó 14 787 veces con la tarea ya hecha.
function setup() {
  const db = openDb(':memory:');
  const task = createTask(db, {title: 'J1.2 Golpes', area: 'animacion', state: 'probando'});
  const command = (state: string, at: string) => {
    const cmd = enqueue(db, 'checks.run', {taskId: task.id}, `checks:${crypto.randomUUID()}`);
    db.prepare("update commands set error='Esperando decisión: Comprobación no disponible: animation',updated_at=? where id=?").run(at, cmd.id);
    db.prepare(`insert into decisions(id,created_at,updated_at,task_id,reason,evidence,options,chosen_option_id,resolved_by,resolved_at,context_hash,state)
      values(?,?,?,?,?,?,'[]',null,null,null,'h',?)`).run(crypto.randomUUID(), '2026-10-24T13:30:00Z', '2026-10-24T13:32:42Z', task.id,
      'Comprobación no disponible: animation', JSON.stringify([{kind: 'command', ref: cmd.id}]), state);
    return cmd;
  };
  const state = (id: string) => ({...db.prepare('select state,error from commands where id=?').get(id)}) as any;
  return {db, task, command, state};
}

test('un comando aplazado tras caducar su Decisión se cancela con command.cancelled; uno que espera una abierta, no', () => {
  const f = setup();
  const zombie = f.command('stale', '2026-10-25T16:13:22Z'), waiting = f.command('open', '2026-10-25T16:13:22Z');
  assert.equal(cancelDecisionZombies(f.db), 1);
  assert.deepEqual(f.state(zombie.id), {state: 'failed', error: 'Cancelado: decisión caducada'});
  assert.equal(f.state(waiting.id).state, 'pending');
  const cancelled = listEvents(f.db, 0).filter(e => e.type === 'command.cancelled').map(e => e.payload);
  assert.deepEqual(cancelled, [{commandId: zombie.id, type: 'checks.run', taskId: f.task.id, reason: 'decisión caducada'}]);
  assert.equal(cancelDecisionZombies(f.db), 0);
});

test('si la Decisión se resolvió y el comando aún no la ha visto, se le deja actuar', () => {
  const f = setup();
  const fresh = f.command('resolved', '2026-10-24T13:31:00Z');
  assert.equal(cancelDecisionZombies(f.db), 0);
  assert.equal(f.state(fresh.id).state, 'pending');
});

test('con la tarea ya hecha, cualquier espera de Decisión es un zombi', () => {
  const f = setup();
  const cmd = f.command('open', '2026-10-24T13:31:00Z');
  f.db.prepare("update tasks set state='done' where id=?").run(f.task.id);
  assert.equal(cancelDecisionZombies(f.db), 1);
  assert.equal(f.state(cmd.id).state, 'failed');
});

test('al abrir la base el zombi ya no está (migración)', async t => {
  const {mkdtempSync} = await import('node:fs'), {tmpdir} = await import('node:os'), {join} = await import('node:path');
  const file = join(mkdtempSync(join(tmpdir(), 'nomos-zombi-')), 'nomos.db');
  const db = openDb(file);
  const task = createTask(db, {title: 'J1.2', area: 'animacion', state: 'done'});
  const cmd = enqueue(db, 'checks.run', {taskId: task.id}, 'checks:zombi');
  db.prepare("update commands set error='Esperando decisión: x' where id=?").run(cmd.id); db.close();
  const again = openDb(file); t.after(() => again.close());
  assert.equal((again.prepare('select state from commands where id=?').get(cmd.id) as any).state, 'failed');
});
