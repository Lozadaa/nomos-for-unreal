import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { filtered } from '../../service/src/repo/rows.ts';
import { getTask } from '../../service/src/repo/tasks.ts';
import { recordTestRun } from '../../service/src/repo/artifacts.ts';
import type { Command } from '../../service/src/model.ts';
import { teamFixture } from './team-fixture.ts';

type Clone = ReturnType<ReturnType<typeof teamFixture>['clone']>;
/** La recomprobación sobre la base nueva terminó bien. */
function checksPassed(c: Clone, taskId: string) {
  const command = filtered<Command>(c.db, 'commands', {type: 'checks.run'}).filter(x => JSON.parse(x.payload as unknown as string).taskId === taskId).at(-1)!;
  c.db.prepare("update commands set state='done' where id=?").run(command.id);
  recordTestRun(c.db, {taskId, checkId: 'cpp', result: 'passed'});
}
/** El remoto rechaza los próximos `n` pushes. */
function rejectPushes(f: ReturnType<typeof teamFixture>, n: number) {
  writeFileSync(join(f.bare, 'rechazar'), String(n));
  writeFileSync(join(f.bare, 'hooks', 'pre-receive'), '#!/bin/sh\nn=$(cat "$GIT_DIR/rechazar" 2>/dev/null || echo 0)\n'
    + 'if [ "$n" -gt 0 ]; then echo $((n-1)) > "$GIT_DIR/rechazar"; echo "rechazado por la prueba" >&2; exit 1; fi\n');
}

test('main compartido: integra sobre origin/main, empuja, firma el commit y el main limpio del clon avanza', async () => {
  const f = teamFixture();
  try {
    const a = f.clone('Richard', 'combate'), t = a.task('vida', {'Source/Vida.cpp': 'int vida = 100;\n'});
    const result = await a.integrate(t.task.id);
    assert.equal(result.integrated, true);
    assert.equal(f.git(f.bare, 'rev-parse', 'master'), result.commit, 'publicado en origin');
    assert.equal(f.git(a.dir, 'rev-parse', 'master'), result.commit, 'el main limpio del clon avanza');
    assert.match(f.git(f.bare, 'log', '-1', '--format=%B', 'master'), /Nomos-Equipo: \w+ Richard \(combate\)/);
    assert.equal(getTask(a.db, t.task.id)!.state, 'cerrando');
  } finally { f.close(); }
});

test('main compartido: lo que otro publicó se trae antes de integrar; con el clon sucio solo avanza origin', async () => {
  const f = teamFixture();
  try {
    const a = f.clone('Richard', 'combate'), b = f.clone('Ana', 'UI');
    const tb = b.task('menu', {'Source/Menu.cpp': 'int menu;\n'}), ta = a.task('vida', {'Source/Vida.cpp': 'int vida;\n'});
    assert.equal((await b.integrate(tb.task.id)).integrated, true);
    writeFileSync(join(a.dir, 'notas.txt'), 'cambio sin commitear de la persona\n');
    assert.equal((await a.integrate(ta.task.id)).deferred, true, 'base nueva: recomprueba');
    checksPassed(a, ta.task.id);
    const result = await a.integrate(ta.task.id);
    assert.equal(result.integrated, true);
    assert.equal(f.git(f.bare, 'rev-parse', 'master'), result.commit);
    assert.deepEqual(f.git(f.bare, 'ls-tree', '--name-only', 'master', 'Source/').split('\n'), ['Source/Menu.cpp', 'Source/Vida.cpp']);
    assert.notEqual(f.git(a.dir, 'rev-parse', 'master'), result.commit, 'clon sucio: su main no se toca');
    assert.equal(f.git(a.dir, 'status', '--porcelain'), 'M notas.txt');
  } finally { f.close(); }
});

test('main compartido: un push rechazado se reintenta; tres rechazos bloquean «No se pudo publicar main»', async () => {
  const f = teamFixture();
  try {
    const a = f.clone('Richard', 'combate'), t1 = a.task('uno', {'Source/Uno.cpp': '1\n'}), t2 = a.task('dos', {'Source/Dos.cpp': '2\n'});
    rejectPushes(f, 1);
    assert.equal((await a.integrate(t1.task.id)).deferred, true);
    assert.match(a.events('integration.retry')[0].reason, /^No se pudo publicar master: .*rechazado por la prueba/);
    assert.equal((await a.integrate(t1.task.id)).integrated, true, 'segundo intento: trae y publica');
    rejectPushes(f, 3);
    // cada vuelta rehace la fusión sobre lo traído; su recomprobación pasa
    let last: Record<string, any> = {};
    for (let i = 0; i < 8 && !last.pushFailed; i++) {
      last = await a.integrate(t2.task.id);
      if (last.reason === 'Recomprobando sobre la rama objetivo') checksPassed(a, t2.task.id);
    }
    assert.equal(last.pushFailed, true);
    assert.equal(a.events('integration.retry').length, 3, 'uno del primer caso y dos de este');
    assert.equal(a.events('integration.push_failed').length, 1);
    assert.match(getTask(a.db, t2.task.id)!.blockedReason!, /^No se pudo publicar main: .*rechazado/);
    assert.equal(f.git(f.bare, 'ls-tree', '--name-only', 'master', 'Source/'), 'Source/Uno.cpp');
  } finally { f.close(); }
});

test('main compartido sin remoto: integra en local como siempre y avisa una sola vez', async () => {
  const f = teamFixture();
  try {
    const a = f.clone('Solo', 'todo', false);
    writeFileSync(join(a.dir, 'Juego.uproject'), '{}\n'); writeFileSync(join(a.dir, '.gitignore'), '.nomos/\n');
    f.git(a.dir, 'add', '.'); f.git(a.dir, 'commit', '-q', '-m', 'Base');
    const t1 = a.task('uno', {'Source/Uno.cpp': '1\n'}), t2 = a.task('dos', {'Source/Dos.cpp': '2\n'});
    assert.equal((await a.integrate(t1.task.id)).integrated, true);
    assert.equal((await a.integrate(t2.task.id)).deferred, true, 'la base cambió: recomprueba');
    checksPassed(a, t2.task.id);
    assert.equal((await a.integrate(t2.task.id)).integrated, true);
    assert.equal(a.events('integration.no_remote').length, 1);
  } finally { f.close(); }
});
