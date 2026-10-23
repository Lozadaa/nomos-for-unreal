import type { Handler } from '../runner.ts';
import { appendEvent } from '../store.ts';
import { indexAll } from '../catalog/indexer.ts';
import { assetConfig } from '../catalog/paths.ts';

const assetIndex: Handler = async (_command, ctx) => {
  const started = Date.now();
  const result = indexAll(ctx.db, assetConfig(ctx.dataDir));
  const summary = {...result, durationMs: Date.now() - started};
  appendEvent(ctx.db, 'catalog.indexed', null, summary);
  return summary;
};

/** Trabajo de assets de la bandeja de comandos; nunca se llama de forma síncrona desde una ruta. */
export function createAssetHandlers(): Record<string, Handler> {
  return {'asset.index': assetIndex};
}
