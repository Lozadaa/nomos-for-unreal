import type { DatabaseSync } from 'node:sqlite';
import type { Attribution, Run, Task } from './model.ts';
import { requireTask } from './repo/tasks.ts';

const areas: Record<string, string> = {
  ui: 'UI', gameplay: 'Gameplay', escenarios: 'Escenas', assets: 'Assets', animacion: 'Anim', audio: 'Audio', qa: 'QA', builds: 'Builds',
};
const roles: Record<string, string> = {
  implementacion: 'Worker', revisor: 'Master', arte: 'Artist', qa: 'Tester', integrador: 'Builder', coordinador: 'Lead',
  desarrollador: 'Worker', implementador: 'Worker', generador: 'Artist',
};
/** La misma regla que `panel/src/visual/art/agentName.ts` («{Área} {Rol}»), sin ordinales. */
export function agentName(role?: string | null, area?: string | null): string {
  if (role === 'director') return 'Nomos';
  return `${area && Object.hasOwn(areas, area) ? areas[area] : 'Proyecto'} ${role && Object.hasOwn(roles, role) ? roles[role] : 'Worker'}`;
}

/** Añade el run a `task.attribution[rol]` sin duplicarlo. Roles: implemento, reviso, genero, integro, verifico. */
export function attribute(db: DatabaseSync, taskId: string, role: string, run: Pick<Run, 'id' | 'provider' | 'role'>): Attribution {
  const task = requireTask(db, taskId), attribution: Attribution = {...task.attribution};
  const list = attribution[role] ?? [];
  if (list.some(entry => entry.runId === run.id)) return attribution;
  attribution[role] = [...list, {runId: run.id, provider: run.provider, agentName: agentName(run.role, task.area), at: new Date().toISOString()}];
  db.prepare('update tasks set attribution=?,updated_at=? where id=?').run(JSON.stringify(attribution), new Date().toISOString(), taskId);
  return attribution;
}

/** Nombres cortos de quien tocó la tarea, para una Decisión o un resumen. */
export const attributionText = (task: Task): string =>
  Object.entries(task.attribution).map(([role, list]) => `${role}: ${list.map(e => e.agentName).join(', ')}`).join(' · ');
