import * as fs from 'node:fs';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { detectCapabilities, type Capability } from './repo/capabilities.ts';

export type CheckResult = {state: 'ausente' | 'comprobado' | 'roto'; detail: string};

/** `detectCapabilities` lee `.kratos/config.json`; aquí esa ruta apunta al `config.json` del servicio. */
export function configFs(dataDir: string | undefined) {
  return {
    existsSync: fs.existsSync,
    readFileSync: (path: string, encoding: any) => {
      if (path === '.kratos/config.json') {
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
  return detected.map(capability => {
    const check = checks.get(capability.id);
    const merged: Capability = check && capability.state !== 'ausente'
      ? {...capability, state: check.state as Capability['state'], detail: check.detail as string, checkedAt: check.checked_at as string}
      : capability;
    return merged.id === 'orca' && merged.state === 'roto' ? {...merged, action: {id: 'open', label: 'Abrir Orca'}} : merged;
  });
}
