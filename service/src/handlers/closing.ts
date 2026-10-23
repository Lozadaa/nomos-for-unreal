import type { Handler } from '../runner.ts';
import { integrateRun } from './integrate.ts';

/** Integración y cierre (hito 6): órdenes sin modelo que trabajan sobre la tarea existente. */
export function createClosingHandlers(): Record<string, Handler> {
  return {'integrate.run': integrateRun};
}
