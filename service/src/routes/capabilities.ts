import * as fs from 'node:fs';
import { join } from 'node:path';
import { json } from '../http.ts';
import { detectCapabilities } from '../repo/capabilities.ts';
import type { Context } from './context.ts';

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
  json(res, 200, detectCapabilities(process.env, adapter));
  return true;
}
