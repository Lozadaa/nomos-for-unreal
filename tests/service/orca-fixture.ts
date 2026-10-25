import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrca, OrcaError } from '../../service/src/adapters/orca.ts';
import { removeDir } from '../remove-dir.ts';

export function fixture(t: any, env: Record<string, string> = {}, extra: object = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-orca-'));
  const file = join(dir, 'terminal.json');
  t.after(() => removeDir(dir));
  const calls: any[] = [];
  const orca = createOrca({ bin: process.execPath,
    args: [fileURLToPath(new URL('../fakes/orca.ts', import.meta.url))],
    env: { FAKE_ORCA_STATE: file, ...env }, onCompleted: (event: any) => { calls.push(event); }, ...extra });
  return { orca, calls, file };
}
export const code = (expected: string) => (error: any) => error instanceof OrcaError && error.code === expected;
