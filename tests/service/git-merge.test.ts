import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGit } from '../../service/src/adapters/git.ts';
import { gameRepo } from './integration-fixture.ts';

test('merge --no-ff limpio en un workspace separado y la rama avanza en el checkout del usuario', async () => {
  const repo = gameRepo(), git = createGit();
  try {
    const tree = repo.tree('vida', {'Source/Vida.cpp': 'int vida = 100;\n'});
    const ws = join(repo.root, 'integracion');
    await git.worktreeAdd(repo.dir, ws, 'master');
    const before = await git.head(ws);
    const merged = await git.merge(ws, tree.branch, {noFf: true, message: 'Integrar vida'});
    assert.equal(merged.ok, true);
    const commit = (merged as {commit: string}).commit;
    assert.equal(repo.git(ws, 'rev-list', '--parents', '-n', '1', commit).split(' ').length, 3, 'commit de merge con dos padres');
    assert.deepEqual(await git.filesBetween(ws, before, commit), ['Source/Vida.cpp']);
    await git.advanceBranch(repo.dir, 'master', commit, before);
    assert.equal(repo.git(repo.dir, 'rev-parse', 'master'), commit);
    assert.ok(existsSync(join(repo.dir, 'Source', 'Vida.cpp')), 'el checkout del usuario queda al día');
    assert.equal(await git.contains(repo.dir, 'master', commit), true);
    assert.equal(await git.branchExists(repo.dir, tree.branch), true);
    assert.equal(await git.branchExists(repo.dir, 'kratos/nada'), false);
  } finally { repo.close(); }
});

test('conflicto de texto: diff3 legible y abortMerge deja el workspace limpio', async () => {
  const repo = gameRepo(), git = createGit();
  try {
    const tree = repo.tree('notas', {'notas.txt': 'uno\nDOS rama\ntres\n'});
    repo.commitMaster({'notas.txt': 'uno\nDOS master\ntres\n'});
    const ws = join(repo.root, 'integracion');
    await git.worktreeAdd(repo.dir, ws, 'master');
    const merged = await git.merge(ws, tree.branch, {noFf: true});
    assert.deepEqual(merged, {ok: false, conflicts: ['notas.txt']});
    const kinds = await git.conflictKinds(ws);
    assert.deepEqual([kinds.text, kinds.binary], [['notas.txt'], []]);
    assert.match(await git.conflictText(ws, 'notas.txt'), /<<<<<<<[\s\S]*\|\|\|\|\|\|\|[\s\S]*>>>>>>>/);
    await git.abortMerge(ws);
    assert.deepEqual(await git.status(ws), {clean: true, files: []});
  } finally { repo.close(); }
});

test('conflicto binario (.uasset): shas de cada lado y nada se resuelve', async () => {
  const repo = gameRepo(), git = createGit();
  try {
    const tree = repo.tree('mapa', {'Content/BP_Puerta.uasset': Buffer.from([0, 1, 2, 3])});
    repo.commitMaster({'Content/BP_Puerta.uasset': Buffer.from([0, 9, 9, 9])});
    const ws = join(repo.root, 'integracion');
    await git.worktreeAdd(repo.dir, ws, 'master');
    const merged = await git.merge(ws, tree.branch, {noFf: true});
    assert.equal(merged.ok, false);
    const kinds = await git.conflictKinds(ws);
    assert.deepEqual([kinds.text, kinds.binary], [[], ['Content/BP_Puerta.uasset']]);
    const v = kinds.versions['Content/BP_Puerta.uasset'];
    assert.equal(v.ours, repo.git(repo.dir, 'rev-parse', 'master:Content/BP_Puerta.uasset'));
    assert.equal(v.theirs, repo.git(repo.dir, 'rev-parse', `${tree.branch}:Content/BP_Puerta.uasset`));
    await git.abortMerge(ws);
    assert.equal((await git.status(ws)).clean, true);
  } finally { repo.close(); }
});

test('status ve cambios sin registrar e ignora los locales de Kratos; worktreeRemove sin force se niega con cambios', async () => {
  const repo = gameRepo(), git = createGit();
  try {
    const tree = repo.tree('sucio', {'a.txt': 'a\n'});
    await git.excludeLocal(tree.path);
    writeFileSync(join(tree.path, '.kratos-brief.md'), 'brief');
    assert.equal((await git.status(tree.path)).clean, true);
    writeFileSync(join(tree.path, 'b.txt'), 'b\n');
    assert.deepEqual(await git.status(tree.path), {clean: false, files: ['b.txt']});
    await assert.rejects(git.worktreeRemove(repo.dir, tree.path));
    assert.equal(readFileSync(join(tree.path, 'b.txt'), 'utf8'), 'b\n', 'nada se borra');
  } finally { repo.close(); }
});
