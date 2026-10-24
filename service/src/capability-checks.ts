import * as fs from 'node:fs';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { detectCapabilities, type Capability } from './repo/capabilities.ts';

export type CheckResult = {state: 'ausente' | 'comprobado' | 'roto'; detail: string};

/** `detectCapabilities` lee `.nomos/config.json`; aquí esa ruta apunta al `config.json` del servicio. */
export function configFs(dataDir: string | undefined) {
  return {
    existsSync: fs.existsSync,
    readFileSync: (path: string, encoding: any) => {
      if (path === '.nomos/config.json') {
        if (!dataDir) throw new Error('missing_config');
        return fs.readFileSync(join(dataDir, 'config.json'), encoding);
      }
      return fs.readFileSync(path, encoding);
    },
  };
}

export function saveCheck(db: DatabaseSync, id: string, result: CheckResult, now = new Date()): void {
  if (result.state === 'ausente') { db.prepare('delete from capability_checks where id=?').run(id); return; }
  db.prepare(`insert into capability_checks(id,state,detail,checked_at) values(?,?,?,?)
    on conflict(id) do update set state=excluded.state,detail=excluded.detail,checked_at=excluded.checked_at`)
    .run(id, result.state, result.detail, now.toISOString());
}

/** Detección de presencia + última comprobación real (gana mientras la herramienta siga presente). */
export function capabilityList(dataDir: string | undefined, db?: DatabaseSync): Capability[] {
  const detected = detectCapabilities(process.env, configFs(dataDir), dataDir ? dirname(dataDir) : undefined);
  const checks = new Map((db?.prepare('select id,state,detail,checked_at from capability_checks').all() ?? [])
    .map(row => [row.id as string, row]));
  // MetaHuman necesita además al menos un preset en el catálogo (Megascans/Bridge)
  const presets = (db?.prepare("select name from catalog_entries where category='metahuman-preset' order by rowid").all() ?? []).map(r => r.name as string);
  return detected.map(capability => capability.id !== 'metahuman' ? capability : capability.state === 'ausente'
    ? {...capability, detail: 'Falta el plugin MetaHumanCharacter (o su IK_MH_IKRig) en el motor'}
    : presets.length ? {...capability, detail: `Plugin MetaHumanCharacter, IK_MH_IKRig y ${presets.length} presets (${presets.slice(0, 4).join(', ')})`}
      : {...capability, state: 'ausente', detail: 'Plugin presente; ningún preset MetaHuman en el catálogo: indexa Megascans Library'}).map(capability => {
    const check = checks.get(capability.id);
    const merged: Capability = check && capability.state !== 'ausente'
      ? {...capability, state: check.state as Capability['state'], detail: check.detail as string, checkedAt: check.checked_at as string}
      : capability;
    return merged.id === 'orca' && merged.state === 'roto' ? {...merged, action: {id: 'open', label: 'Abrir Orca'}} : merged;
  });
}
