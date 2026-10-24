import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { integrateRun } from '../../service/src/handlers/integrate.ts';
import { integrateLfs } from '../../service/src/integration/lfs.ts';
import { createGit } from '../../service/src/adapters/git.ts';
import { filtered } from '../../service/src/repo/rows.ts';
import { getTask } from '../../service/src/repo/tasks.ts';
import { listDecisions, resolveDecision } from '../../service/src/repo/decisions.ts';
import { listLeases } from '../../service/src/leases.ts';
import type { Command } from '../../service/src/model.ts';
import { integrationFixture } from './integration-fixture.ts';

const lfs = (() => { try { execFileSync('git', ['lfs', 'version'], {stdio: 'pipe', windowsHide: true}); return true; } catch { return false; } })();
type F = ReturnType<typeof integrationFixture>;
const integrate = (f: F, taskId: string) => integrateRun(f.command('integrate.run', {taskId}, `int-${taskId}`), f.ctx) as Promise<Record<string, any>>;
/** El carril largo ejecuta `integrate.lfs` y la orden queda hecha. */
async function runLfs(f: F) {
  const row = filtered<Command>(f.db, 'commands', {type: 'integrate.lfs'}).at(-1)!;
  const result = await integrateLfs({...row, payload: JSON.parse(row.payload as unknown as string)}, f.ctx);
  f.db.prepare("update commands set state='done' where id=?").run(row.id);
  return result as Record<string, any>;
}
const heavy = {'Content/MetaHumans/Hudson/Cara.uasset': Buffer.alloc(11 * 2 ** 20, 7), 'Content/MetaHumans/Hudson/BP_Hudson.uasset': Buffer.from([0, 1, 2]),
  'Juego.uproject': '{"Plugins":[{"Name":"LiveLink","Enabled":true}]}\n'};
const big = 'Content/MetaHumans/Hudson/Cara.uasset';

test('contenido pesado sin LFS: no se fusiona; Decisión con tamaño, archivos y las tres salidas', {skip: !lfs}, async () => {
  const f = integrationFixture(heavy);
  try {
    const a = f.addTask('heroe');
    const before = f.repo.git(f.repo.dir, 'rev-parse', 'master');
    assert.deepEqual(await integrate(f, a.task.id), {deferred: true, reason: 'Esperando decisión: contenido pesado'});
    const [decision] = listDecisions(f.db, 'open');
    assert.equal(decision.reason, 'Contenido pesado (11 MB): 3 archivos, 1 de más de 10 MB');
    assert.deepEqual(decision.options.map(o => o.label), ['Configurar Git LFS', 'Integrar sin LFS', 'Cancelar']);
    assert.equal(decision.options[0].recommended, true);
    assert.match(decision.options[0].description, /\.gitattributes[\s\S]*sin reescribir master/);
    assert.equal(f.repo.git(f.repo.dir, 'rev-parse', 'master'), before, 'master sin tocar');
    assert.deepEqual(listLeases(f.db), [], 'la Decisión no retiene la reserva de integración');
    assert.equal((await integrate(f, a.task.id)).deferred, true, 'mientras la Decisión está abierta, espera');
  } finally { f.close(); }
});

test('«Configurar Git LFS»: .gitattributes en master antes de integrar, rama del responsable migrada, ff-only y nada pesado suelto en .git',
  {skip: !lfs}, async () => {
    const f = integrationFixture(heavy);
    try {
      const a = f.addTask('heroe');
      const raw = f.repo.git(f.repo.dir, 'rev-parse', `${a.branch}:${big}`);
      const base = f.repo.git(f.repo.dir, 'rev-parse', 'master');
      // el checkout del usuario: el contenido migrado sin seguir, la línea de LiveLink ya puesta y su Config con secretos
      mkdirSync(join(f.repo.dir, 'Content', 'MetaHumans', 'Hudson'), {recursive: true}); mkdirSync(join(f.repo.dir, 'Config'));
      for (const [file, content] of Object.entries(heavy)) writeFileSync(join(f.repo.dir, file), content);
      writeFileSync(join(f.repo.dir, 'Config', 'DefaultEngine.ini'), '[Android]\nSecurityToken=secreto\n');
      await integrate(f, a.task.id);
      resolveDecision(f.db, listDecisions(f.db, 'open')[0].id, 'lfs', 'usuario');
      assert.deepEqual(await integrate(f, a.task.id), {deferred: true, reason: 'Configurando Git LFS'});
      const [order] = filtered<Command>(f.db, 'commands', {type: 'integrate.lfs'});
      assert.equal(order.lane, 'long', 'la migración va al carril largo');
      assert.equal((await integrate(f, a.task.id)).reason, 'Configurando Git LFS', 'espera a que termine');
      const configured = await runLfs(f);
      assert.equal(f.repo.git(f.repo.dir, 'rev-parse', 'master'), configured.commit, '.gitattributes en master antes de integrar');
      assert.equal(f.repo.git(f.repo.dir, 'rev-parse', `${configured.commit}^`), base);
      assert.match(f.repo.git(f.repo.dir, 'show', 'master:.gitattributes'), /^\*\.uasset filter=lfs diff=lfs merge=lfs -text$/m);
      assert.equal(f.repo.git(f.repo.dir, 'merge-base', 'master', a.branch), base, 'la rama migrada sigue saliendo de la base: master no se reescribió');
      const result = await integrate(f, a.task.id);
      assert.equal(result.integrated, true);
      assert.equal(f.repo.git(f.repo.dir, 'rev-parse', 'master'), result.commit, 'master avanzado');
      assert.match(f.repo.git(f.repo.dir, 'lfs', 'ls-files'), /Cara\.uasset[\s\S]*BP_Hudson\.uasset|BP_Hudson\.uasset[\s\S]*Cara\.uasset/);
      assert.match(f.repo.git(f.repo.dir, 'cat-file', '-p', `master:${big}`), /^version https:\/\/git-lfs\.github\.com\/spec\/v1/);
      assert.throws(() => f.repo.git(f.repo.dir, 'cat-file', '-e', raw), 'el blob completo ya no está en .git');
      assert.equal(readFileSync(join(f.repo.dir, big)).length, 11 * 2 ** 20, 'el checkout del usuario tiene el archivo de verdad');
      assert.equal(readFileSync(join(f.repo.dir, 'Config', 'DefaultEngine.ini'), 'utf8'), '[Android]\nSecurityToken=secreto\n');
      assert.match(f.repo.git(f.repo.dir, 'status', '--porcelain', '--', 'Config'), /^\?\? Config\//, 'Config sigue sin seguir');
      assert.equal(filtered<Command>(f.db, 'commands', {type: 'checks.run'}).length, 0, 'solo cambió .gitattributes: no recomprueba');
      assert.equal(f.events('integration.completed')[0].rechecked, false);
      assert.equal(f.events('integration.lfs').length, 1);
      assert.equal(getTask(f.db, a.task.id)!.state, 'cerrando');
      assert.equal(f.repo.git(a.path, 'status', '--porcelain'), '', 'el worktree del responsable queda limpio tras migrar');
    } finally { f.close(); }
  });

test('«Integrar sin LFS» mete los binarios tal cual; «Cancelar» devuelve la tarea a probando sin tocar master', {skip: !lfs}, async () => {
  const f = integrationFixture(heavy);
  try {
    const a = f.addTask('sin'), b = f.addTask('cancelada', {'Content/Otro.uasset': Buffer.alloc(11 * 2 ** 20, 3)});
    await integrate(f, a.task.id);
    resolveDecision(f.db, listDecisions(f.db, 'open')[0].id, 'nolfs', 'usuario');
    assert.equal((await integrate(f, a.task.id)).integrated, true);
    assert.equal(f.repo.git(f.repo.dir, 'lfs', 'ls-files'), '');
    assert.equal(f.repo.git(f.repo.dir, 'cat-file', '-s', `master:${big}`), String(11 * 2 ** 20));
    const before = f.repo.git(f.repo.dir, 'rev-parse', 'master');
    await integrate(f, b.task.id);
    resolveDecision(f.db, listDecisions(f.db, 'open')[0].id, 'cancel', 'usuario');
    assert.deepEqual(await integrate(f, b.task.id), {cancelled: true});
    assert.equal(getTask(f.db, b.task.id)!.state, 'probando');
    assert.equal(f.repo.git(f.repo.dir, 'rev-parse', 'master'), before);
  } finally { f.close(); }
});

test('sin git-lfs instalado (fake de git): la opción recomendada no aparece y la Decisión lo dice', async () => {
  const f = integrationFixture(heavy);
  try {
    f.ctx.git = {...createGit(), lfsVersion: async () => null};
    const a = f.addTask('sinlfs');
    assert.equal((await integrate(f, a.task.id)).deferred, true);
    const [decision] = listDecisions(f.db, 'open');
    assert.deepEqual(decision.options.map(o => o.id), ['nolfs', 'cancel']);
    assert.match(decision.reason, /git-lfs no está instalado$/);
  } finally { f.close(); }
});

test('Capacidades: fila «Git LFS» con git-lfs junto a Git para Windows y si el proyecto ya lo usa', async () => {
  const {detectCapabilities} = await import('../../service/src/repo/capabilities.ts');
  const {win32} = await import('node:path');
  const files = new Map([[win32.join('C:\Git\cmd', 'git.exe'), ''], [win32.join('C:\Git\cmd', '..', 'mingw64', 'bin', 'git-lfs.exe'), '']]);
  const fs = (attributes?: string) => ({existsSync: (p: string) => files.has(p),
    readFileSync: (p: string) => { if (attributes !== undefined && p === win32.join('C:\Juego', '.gitattributes')) return attributes; throw new Error('ENOENT'); }});
  const row = (attributes?: string, path = 'C:\Git\cmd') => detectCapabilities({PATH: path}, fs(attributes), 'C:\Juego').find(c => c.id === 'git_lfs')!;
  assert.deepEqual([row().label, row().state, row().detail], ['Git LFS', 'detectado', 'git-lfs detectado · sin configurar en el proyecto']);
  assert.equal(row('*.uasset filter=lfs diff=lfs merge=lfs -text\n').detail, 'git-lfs detectado · configurado en el proyecto');
  assert.deepEqual([row(undefined, 'C:\Otro').state, row(undefined, 'C:\Otro').detail], ['ausente', 'git-lfs ausente']);
});
