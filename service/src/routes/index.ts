import { dirname } from 'node:path';
import { body, json } from '../http.ts';
import { seed } from '../seed.ts';
import { tasks } from './tasks.ts';
import { taskWorker } from './task-worker.ts';
import { taskReview } from './task-review.ts';
import { runs } from './runs.ts';
import { decisions } from './decisions.ts';
import { budget } from './budget.ts';
import { artifacts } from './artifacts.ts';
import { catalog } from './catalog.ts';
import { capabilities } from './capabilities.ts';
import { commands } from './commands.ts';
import { leases } from './leases.ts';
import { taskDepends } from './task-depends.ts';
import type { Context } from './context.ts';

export function databaseDirectory(db: Context['db']): string | undefined {
  const row = db.prepare('pragma database_list').all().find(row => row.name === 'main');
  return row?.file ? dirname(row.file as string) : undefined;
}

export async function production(context: Context): Promise<boolean> {
  if (context.req.method === 'POST' && context.url.pathname === '/seed') {
    const data = await body(context.req);
    if (data.force !== undefined && typeof data.force !== 'boolean') throw new Error('invalid_force');
    json(context.res, 201, seed(context.db, {force: data.force as boolean | undefined}));
    return true;
  }
  for (const handler of [tasks, taskDepends, taskWorker, taskReview, runs, decisions, budget, artifacts, catalog, capabilities, commands, leases]) {
    if (await handler(context)) return true;
  }
  return false;
}
