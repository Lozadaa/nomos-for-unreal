import { dirname } from 'node:path';
import { json } from '../http.ts';
import type { Context } from './context.ts';
import { installedSkills } from '../skills.ts';
import { concurrency, readConfig } from '../config.ts';
import { assetConfig } from '../catalog/paths.ts';
import { capabilityList, saveCheck } from '../capability-checks.ts';
import { checkCapability, doctor } from '../doctor.ts';

export async function capabilities({db, req, res, url, dataDir}: Context): Promise<boolean> {
  const check = /^\/capabilities\/([a-z_]+)\/check$/.exec(url.pathname);
  if (req.method === 'POST' && check) {
    // «Comprobar ahora» y «Abrir Orca»: comprobación real, guardada con fecha
    if (!dataDir) throw new Error('missing_config');
    const config = assetConfig(dataDir);
    saveCheck(db, check[1], await checkCapability(check[1], {dataDir, unrealPath: config.unrealPath, blenderPath: config.blenderPath}));
    json(res, 200, capabilityList(dataDir, db).find(c => c.id === check[1]) ?? {id: check[1], state: 'ausente'});
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/doctor') {
    if (!dataDir) throw new Error('missing_config');
    json(res, 200, {rows: await doctor(dataDir, db)});
    return true;
  }
  if (req.method !== 'GET' || url.pathname !== '/capabilities') return false;
  const detected = capabilityList(dataDir, db);
  if(url.searchParams.get('details')==='1') {
    if(!dataDir) throw new Error('missing_config');
    json(res,200,{capabilities:detected,skills:installedSkills(dirname(dataDir)),concurrency:concurrency(readConfig(dataDir))});
  } else json(res,200,detected);
  return true;
}
