import * as fs from 'node:fs';
import { join, dirname } from 'node:path';
import { json } from '../http.ts';
import { detectCapabilities } from '../repo/capabilities.ts';
import type { Context } from './context.ts';
import { installedSkills } from '../skills.ts';
import { concurrency, readConfig } from '../config.ts';

export async function capabilities({req, res, url, dataDir}: Context): Promise<boolean> {
  if (req.method !== 'GET' || url.pathname !== '/capabilities') return false;
  const adapter = {
    existsSync: fs.existsSync,
    readFileSync: (path: string, encoding: any) => {
      if (path === '.kratos/config.json') {
        if (!dataDir) throw new Error('missing_config');
        return fs.readFileSync(join(dataDir, 'config.json'), encoding);
      }
      return fs.readFileSync(path, encoding);
    }
  };
  const detected=detectCapabilities(process.env, adapter);
  if(url.searchParams.get('details')==='1') {
    if(!dataDir) throw new Error('missing_config');
    json(res,200,{capabilities:detected,skills:installedSkills(dirname(dataDir)),concurrency:concurrency(readConfig(dataDir))});
  } else json(res,200,detected);
  return true;
}
