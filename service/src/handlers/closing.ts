import type { Handler } from '../runner.ts';
import { integrateRun } from './integrate.ts';
import { createFinalize, type FinalizeDeps } from './finalize.ts';
import { taskContinue } from './continue.ts';

/** Integración y cierre (hito 6): órdenes sin modelo que trabajan sobre la tarea existente. */
export function createClosingHandlers(deps: FinalizeDeps = {}): Record<string, Handler> {
  return {'integrate.run': integrateRun, 'finalize.run': createFinalize(deps), 'task.continue': taskContinue};
}
