import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editorCmdIn, enginePathFor, iniInstall } from '../../service/src/engine-path.ts';
import { assetConfig } from '../../service/src/catalog/paths.ts';
import { necessary } from '../../service/src/doctor.ts';
import { removeDir } from '../remove-dir.ts';

function game(association: string) {
  const root = mkdtempSync(join(tmpdir(), 'nomos-motor-')), uproject = join(root, 'Juego', 'Juego.uproject');
  mkdirSync(join(root, 'Juego', '.nomos'), {recursive: true});
  writeFileSync(uproject, JSON.stringify({FileVersion: 3, EngineAssociation: association}));
  const engine = (base: string) => { mkdirSync(join(base, 'Engine', 'Binaries', 'Win64'), {recursive: true}); return base; };
  return {root, uproject, engine, close: () => removeDir(root)};
}
const cmd = /UE_5\.9[\\/]Engine[\\/]Binaries[\\/]Win64[\\/]UnrealEditor-Cmd\.exe$/;

test('jam (a): EngineAssociation 5.9 y LauncherInstalled.dat → el UnrealEditor-Cmd de esa instalación', () => {
  const g = game('5.9');
  try {
    const install = g.engine(join(g.root, 'Epic', 'UE_5.9')), dat = join(g.root, 'LauncherInstalled.dat');
    writeFileSync(dat, JSON.stringify({InstallationList: [{AppName: 'UE_5.9', InstallLocation: install}]}));
    const found = enginePathFor(g.uproject, {launcherDat: dat, programFiles: join(g.root, 'nada')});
    assert.ok(found && 'cmd' in found);
    assert.match(found.cmd, cmd);
    assert.equal(found.version, '5.9');
  } finally { g.close(); }
});

test('jam (b): sin .dat pero con <Program Files>/Epic Games/UE_5.9 → lo mismo', () => {
  const g = game('5.9');
  try {
    g.engine(join(g.root, 'PF', 'Epic Games', 'UE_5.9'));
    const found = enginePathFor(g.uproject, {launcherDat: join(g.root, 'no.dat'), programFiles: join(g.root, 'PF')});
    assert.ok(found && 'cmd' in found);
    assert.match(found.cmd, cmd);
  } finally { g.close(); }
});

test('jam (c): pide 5.9 y no está → {missing: "5.9"}; (d) asociación GUID → null', () => {
  const g = game('5.9');
  try {
    assert.deepEqual(enginePathFor(g.uproject, {launcherDat: join(g.root, 'no.dat'), programFiles: join(g.root, 'PF')}), {missing: '5.9'});
    writeFileSync(g.uproject, JSON.stringify({EngineAssociation: '{9D6A3B1C-0000-4E2A-8B1F-123456789ABC}'}));
    assert.equal(enginePathFor(g.uproject, {launcherDat: join(g.root, 'no.dat'), programFiles: join(g.root, 'PF')}), null);
  } finally { g.close(); }
});

test('jam: unrealPath de config.json manda; si no, el motor del .uproject; doctor dice qué motor falta', async () => {
  const g = game('5.42');
  try {
    const data = join(g.root, 'Juego', '.nomos');
    assert.equal(assetConfig(data).unrealPath, null, 'motor ausente: sin ruta, no el 5.8 en silencio');
    const unreal = (await necessary(data, {env: {PATH: ''}})).find(r => r.name === 'Unreal')!;
    assert.equal(unreal.present, false);
    assert.match(unreal.detail, /Este juego pide Unreal 5\.42 y no está instalado/);
    writeFileSync(join(data, 'config.json'), JSON.stringify({unrealPath: 'D:/Motor/UnrealEditor-Cmd.exe'}));
    assert.equal(assetConfig(data).unrealPath, 'D:/Motor/UnrealEditor-Cmd.exe');
  } finally { g.close(); }
});

test('revisión final: con un config.json que no valida, doctor sigue diagnosticando', async () => {
  const g = game('5.9');
  try {
    const data = join(g.root, 'Juego', '.nomos');
    writeFileSync(join(data, 'config.json'), JSON.stringify({limits: {inventado: 1}}));
    const rows = await necessary(data, {env: {PATH: ''}});
    assert.ok(rows.some(r => r.name === 'Unreal'));
  } finally { g.close(); }
});

test('macOS y Linux: /Users/Shared/Epic Games/UE_5.9, NOMOS_UNREAL_ROOT y el GUID de Install.ini; binario por plataforma', () => {
  const g = game('5.9');
  try {
    const none = join(g.root, 'no.dat');
    const mac = (base: string) => { mkdirSync(join(base, 'Engine', 'Binaries', 'Mac'), {recursive: true}); return base; };
    mac(join(g.root, 'PF', 'Epic Games', 'UE_5.9'));
    const found = enginePathFor(g.uproject, {platform: 'darwin', env: {}, launcherDat: none, programFiles: join(g.root, 'PF')});
    assert.ok(found && 'cmd' in found);
    assert.match(found.cmd, /UE_5\.9[\\/]Engine[\\/]Binaries[\\/]Mac[\\/]UnrealEditor\.app[\\/]Contents[\\/]MacOS[\\/]UnrealEditor$/);
    // si la instalación trae UnrealEditor-Cmd, se usa ese
    const linux = join(g.root, 'motor'), bin = join(linux, 'Engine', 'Binaries', 'Linux');
    mkdirSync(bin, {recursive: true});
    writeFileSync(join(bin, 'UnrealEditor-Cmd'), '');
    assert.equal(editorCmdIn(linux, 'linux'), join(bin, 'UnrealEditor-Cmd'));
    // Linux sin launcher: pide 5.9 y solo NOMOS_UNREAL_ROOT lo da
    assert.deepEqual(enginePathFor(g.uproject, {platform: 'linux', env: {}, installIni: none}), {missing: '5.9'});
    assert.deepEqual(enginePathFor(g.uproject, {platform: 'linux', env: {NOMOS_UNREAL_ROOT: linux}}), {cmd: join(bin, 'UnrealEditor-Cmd'), version: '5.9'});
    // motor compilado: el GUID de EngineAssociation en Install.ini
    const guid = '{9D6A3B1C-0000-4E2A-8B1F-123456789ABC}', ini = join(g.root, 'Install.ini');
    writeFileSync(g.uproject, JSON.stringify({EngineAssociation: guid}));
    writeFileSync(ini, `[Installations]\n9D6A3B1C-0000-4E2A-8B1F-123456789ABC=${linux}\n`);
    assert.deepEqual(enginePathFor(g.uproject, {platform: 'linux', env: {}, installIni: ini}), {cmd: join(bin, 'UnrealEditor-Cmd'), version: guid});
    assert.equal(iniInstall(ini, '{00000000-0000-0000-0000-000000000000}'), null);
  } finally { g.close(); }
});
