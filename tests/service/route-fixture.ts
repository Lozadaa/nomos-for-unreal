import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { createServer } from '../../service/src/server.ts';
export async function fixture(memory = false) {
  const dir = mkdtempSync(join(tmpdir(), 'kratos-routes-'));
  const db = openDb(memory ? ':memory:' : join(dir, 'kratos.db'));
  const server = createServer(db, 'secret', 'service/web', dir);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = (path: string, data?: unknown, auth = true) => fetch(base + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: auth ? {Authorization:'Bearer secret'} : {},
    ...(data === undefined ? {} : {body: JSON.stringify(data)})
  });
  return {db, dir, request, async close() {
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close(); rmSync(dir, {recursive:true, force:true});
  }};
}
