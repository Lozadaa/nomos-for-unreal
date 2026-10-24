import type { Handler } from '../runner.ts';
import { appendEvent } from '../store.ts';
import { indexAll } from '../catalog/indexer.ts';
import { assetConfig } from '../catalog/paths.ts';
import { createMigrate, type AssetDeps } from './asset-migrate.ts';
import { assetPrepare } from './asset-prepare.ts';
import { assetCandidates } from './asset-candidates.ts';
import { createCharacterSetup } from './character-setup.ts';
import type { CheckDeps } from '../checks/run.ts';
import { createDetect, createRequestDownload, type DownloadDeps } from './asset-download.ts';
import { createMeshyGenerate, createMeshyPoll, type MeshyDeps } from './asset-meshy.ts';

const assetIndex: Handler = async (_command, ctx) => {
  const started = Date.now();
  const result = indexAll(ctx.db, assetConfig(ctx.dataDir));
  const summary = {...result, durationMs: Date.now() - started};
  appendEvent(ctx.db, 'catalog.indexed', null, summary);
  return summary;
};

/** Trabajo de assets de la bandeja de comandos; nunca se llama de forma síncrona desde una ruta. */
export function createAssetHandlers(deps: AssetDeps & DownloadDeps & MeshyDeps & Pick<CheckDeps, 'ffmpeg' | 'playSeconds'> = {}): Record<string, Handler> {
  return {'asset.index': assetIndex, 'asset.migrate': createMigrate(deps), 'asset.prepare': assetPrepare, 'asset.candidates': assetCandidates,
    'character.setup': createCharacterSetup({unreal: deps.unreal, ffmpeg: deps.ffmpeg, playSeconds: deps.playSeconds}),
    'asset.request_download': createRequestDownload(deps), 'asset.detect': createDetect(deps),
    'asset.meshy_generate': createMeshyGenerate(deps), 'asset.meshy_poll': createMeshyPoll(deps)};
}
