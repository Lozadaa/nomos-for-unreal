import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { capabilityList } from '../../service/src/capability-checks.ts';
import { checkCapability } from '../../service/src/doctor.ts';
import { upsertEntry } from '../../service/src/repo/catalog.ts';

const touch = (file: string) => { mkdirSync(join(file, '..'), {recursive: true}); writeFileSync(file, ''); };

function engine(withPlugins: boolean) {
  const root = mkdtempSync(join(tmpdir(), 'kratos-caps-')), dataDir = join(root, '.kratos');
  const plugins = join(root, 'UE_5.8', 'Engine', 'Plugins'), cmd = join(root, 'UE_5.8', 'Engine', 'Binaries', 'Win64', 'UnrealEditor-Cmd.exe');
  touch(cmd);
  if (withPlugins) {
    touch(join(plugins, 'MetaHuman', 'MetaHumanCharacter', 'MetaHumanCharacter.uplugin'));
    touch(join(plugins, 'MetaHuman', 'MetaHumanCharacter', 'Content', 'Animation', 'Retargeting', 'IK_MH_IKRig.uasset'));
    touch(join(plugins, 'Animation', 'IKRig', 'IKRig.uplugin'));
  }
  mkdirSync(dataDir, {recursive: true});
  writeFileSync(join(dataDir, 'config.json'), JSON.stringify({unrealPath: cmd, ffmpegPath: join(root, 'no', 'ffmpeg.exe')}));
  return {root, dataDir, close: () => rmSync(root, {recursive: true, force: true})};
}

test('MetaHuman listo con plugin, IK_MH_IKRig y presets indexados; Retarget IK con IKRig', () => {
  const e = engine(true), db = openDb(':memory:');
  try {
    for (const name of ['Hudson', 'Emory']) upsertEntry(db, {name, category: 'metahuman-preset', description: '', source: 'megascans'});
    const caps = capabilityList(e.dataDir, db);
    const mh = caps.find(c => c.id === 'metahuman')!;
    assert.equal(mh.label, 'MetaHuman');
    assert.equal(mh.state, 'detectado');
    assert.match(mh.detail, /2 presets \(Hudson, Emory\)/);
    assert.equal(caps.find(c => c.id === 'retarget')!.label, 'Retarget IK');
    assert.equal(caps.find(c => c.id === 'retarget')!.state, 'detectado');
    assert.equal(caps.find(c => c.id === 'ffmpeg')!.label, 'Vídeo (ffmpeg)');
  } finally { db.close(); e.close(); }
});

test('MetaHuman ausente sin presets en el catálogo o sin el plugin, y lo dice', () => {
  const withPlugin = engine(true), without = engine(false), db = openDb(':memory:');
  try {
    const noPresets = capabilityList(withPlugin.dataDir, db).find(c => c.id === 'metahuman')!;
    assert.equal(noPresets.state, 'ausente');
    assert.match(noPresets.detail, /ningún preset/);
    upsertEntry(db, {name: 'Hudson', category: 'metahuman-preset', description: '', source: 'megascans'});
    const noPlugin = capabilityList(without.dataDir, db).find(c => c.id === 'metahuman')!;
    assert.equal(noPlugin.state, 'ausente');
    assert.match(noPlugin.detail, /MetaHumanCharacter/);
    assert.equal(capabilityList(without.dataDir, db).find(c => c.id === 'retarget')!.state, 'ausente');
  } finally { db.close(); withPlugin.close(); without.close(); }
});

test('Vídeo (ffmpeg): «Comprobar ahora» lee la versión real; sin ffmpeg, ausente', async () => {
  const fake = {bin: process.execPath, baseArgs: [join(import.meta.dirname, '..', 'fakes', 'ffmpeg.mjs')]};
  assert.deepEqual(await checkCapability('ffmpeg', {ffmpeg: fake}), {state: 'comprobado', detail: 'ffmpeg 8.1.2-fake'});
  assert.equal((await checkCapability('ffmpeg', {ffmpeg: null})).state, 'ausente');
});
