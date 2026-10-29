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
import { director } from './director.ts';
import { playRoutes } from './play.ts';
import { leases } from './leases.ts';
import { taskDepends } from './task-depends.ts';
import { taskClosing } from './task-closing.ts';
import { downloads } from './downloads.ts';
import { approvals } from './approvals.ts';
import { team } from './team.ts';
import { getTask } from '../repo/tasks.ts';
import { myId } from '../team.ts';
import type { Context } from './context.ts';

export { databaseDirectory } from '../data-paths.ts';

export async function production(context: Context): Promise<boolean> {
  if (context.req.method === 'POST' && context.url.pathname === '/seed') {
    const data = await body(context.req);
    if (data.force !== undefined && typeof data.force !== 'boolean') throw new Error('invalid_force');
    json(context.res, 201, seed(context.db, {force: data.force as boolean | undefined}));
    return true;
  }
  // hito 29: el panel y la CLI no mueven tareas de otra persona (en equipo, cada tarea lleva su dueño)
  const owned = context.req.method === 'POST' && context.dataDir ? /^\/tasks\/([^/]+)\/[^/]+$/.exec(context.url.pathname) : null;
  if (owned) {
    const owner = getTask(context.db, decodeURIComponent(owned[1]))?.owner;
    if (owner && owner !== myId(context.dataDir!)) throw new Error('foreign_task');
  }
  for (const handler of [tasks, taskDepends, taskClosing, taskWorker, taskReview, runs, decisions, budget, artifacts, catalog, capabilities, commands, downloads, leases, director, playRoutes, approvals, team]) {
    if (await handler(context)) return true;
  }
  return false;
}
