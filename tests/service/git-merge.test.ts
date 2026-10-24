import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    assert.equal(await git.branchExists(repo.dir, 'nomos/nada'), false);
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

test('status ve cambios sin registrar e ignora los locales de Nomos; worktreeRemove sin force se niega con cambios', async () => {
  const repo = gameRepo(), git = createGit();
  try {
    const tree = repo.tree('sucio', {'a.txt': 'a\n'});
    await git.excludeLocal(tree.path);
    writeFileSync(join(tree.path, '.nomos-brief.md'), 'brief');
    assert.equal((await git.status(tree.path)).clean, true);
    writeFileSync(join(tree.path, 'b.txt'), 'b\n');
    assert.deepEqual(await git.status(tree.path), {clean: false, files: ['b.txt']});
    await assert.rejects(git.worktreeRemove(repo.dir, tree.path));
    assert.equal(readFileSync(join(tree.path, 'b.txt'), 'utf8'), 'b\n', 'nada se borra');
  } finally { repo.close(); }
});

test('hito 7: sin seguir e idéntico al que llega (asset migrado) se sustituye; uno distinto (Config con secreto) se conserva y se rechaza', async () => {
  const repo = gameRepo(), git = createGit();
  try {
    const racket = 'Content/Fab/Raqueta_🎾/raqueta.uasset';
    const tree = repo.tree('raqueta', {[racket]: 'UASSET', 'Config/DefaultEngine.ini': '[GameMode]\n'});
    const ws = join(repo.root, 'integracion');
    await git.worktreeAdd(repo.dir, ws, 'master');
    const before = await git.head(ws);
    const commit = (await git.merge(ws, tree.branch, {noFf: true}) as {commit: string}).commit;
    mkdirSync(join(repo.dir, 'Content', 'Fab', 'Raqueta_🎾'), {recursive: true}); mkdirSync(join(repo.dir, 'Config'), {recursive: true});
    writeFileSync(join(repo.dir, racket), 'UASSET');
    writeFileSync(join(repo.dir, 'Config', 'DefaultEngine.ini'), '[Android]\nSecurityToken=secreto\n');
    await assert.rejects(git.advanceBranch(repo.dir, 'master', commit, before), (e: Error) =>
      /untracked working tree files would be overwritten/.test(e.message) && /\tConfig\/DefaultEngine\.ini/.test(e.message) && !e.message.includes('Raqueta'));
    assert.equal(readFileSync(join(repo.dir, 'Config', 'DefaultEngine.ini'), 'utf8'), '[Android]\nSecurityToken=secreto\n');

    rmSync(join(repo.dir, 'Config', 'DefaultEngine.ini'));
    const only = repo.tree('solo-raqueta', {[racket]: 'UASSET'});
    await git.checkout(ws, 'master');
    const ws2 = join(repo.root, 'integracion2'); await git.worktreeAdd(repo.dir, ws2, 'master');
    const second = (await git.merge(ws2, only.branch, {noFf: true}) as {commit: string}).commit;
    await git.advanceBranch(repo.dir, 'master', second, before);
    assert.equal(repo.git(repo.dir, 'rev-parse', 'master'), second);
    assert.equal(readFileSync(join(repo.dir, racket), 'utf8'), 'UASSET');
  } finally { repo.close(); }
});

test('hito 5b: un cambio local igual al que llega (LiveLink ya puesto) no frena el avance; uno distinto sí y no se toca', async () => {
  const repo = gameRepo(), git = createGit();
  try {
    const live = '{"Plugins":[{"Name":"LiveLink","Enabled":true}]}\n';
    const tree = repo.tree('livelink', {'Juego.uproject': live});
    const ws = join(repo.root, 'integracion');
    await git.worktreeAdd(repo.dir, ws, 'master');
    const before = await git.head(ws);
    const commit = (await git.merge(ws, tree.branch, {noFf: true}) as {commit: string}).commit;
    writeFileSync(join(repo.dir, 'Juego.uproject'), '{"Plugins":[]}\n');
    await assert.rejects(git.advanceBranch(repo.dir, 'master', commit, before), /local changes[\s\S]*\tJuego\.uproject/);
    assert.equal(readFileSync(join(repo.dir, 'Juego.uproject'), 'utf8'), '{"Plugins":[]}\n', 'el cambio distinto del usuario sigue');
    writeFileSync(join(repo.dir, 'Juego.uproject'), live);
    await git.advanceBranch(repo.dir, 'master', commit, before);
    assert.equal(repo.git(repo.dir, 'rev-parse', 'master'), commit);
    assert.equal(repo.git(repo.dir, 'status', '--porcelain'), '');
  } finally { repo.close(); }
});

test('hito 5b: discard deja como en HEAD lo que tocó un lote de pruebas (mapa re-guardado, clip nuevo, Build/)', async () => {
  const repo = gameRepo(), git = createGit();
  try {
    const tree = repo.tree('heroe', {'Content/Kratos/Maps/AnimTest.umap': 'MAPA'});
    writeFileSync(join(tree.path, 'Content/Kratos/Maps/AnimTest.umap'), 'MAPA RE-GUARDADO');
    mkdirSync(join(tree.path, 'Build', 'Windows'), {recursive: true});
    writeFileSync(join(tree.path, 'Build', 'Windows', 'Juego.exe'), 'exe');
    writeFileSync(join(tree.path, 'Content/Kratos/Clip2.uasset'), 'clip');
    await git.discard(tree.path, (await git.status(tree.path)).files);
    assert.deepEqual(await git.status(tree.path), {clean: true, files: []});
    assert.equal(readFileSync(join(tree.path, 'Content/Kratos/Maps/AnimTest.umap'), 'utf8'), 'MAPA');
  } finally { repo.close(); }
});
