import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { request, serviceInfo } from './client.ts';

/** `kratos asset index|search|migrate|prepare|download|generate`: envoltorios de GET /catalog y POST /commands. */
export async function assetCli(argv: string[]): Promise<boolean> {
  const at = argv.findIndex((arg, i) => arg === 'asset' && !['--data', '--target'].includes(argv[i - 1] ?? ''));
  if (at < 0) return false;
  const {values, positionals} = parseArgs({args: argv, allowPositionals: true, options: {data: {type: 'string'},
    target: {type: 'string'}, kind: {type: 'string'}, 'params-file': {type: 'string'}, credits: {type: 'string'},
    'idempotency-key': {type: 'string'}}});
  const [, action, arg, ...extra] = positionals;
  const call = (path: string, data?: unknown) => request(serviceInfo(resolve(values.data ?? '.kratos')), path, data);
  const minute = new Date().toISOString().slice(0, 16);
  const send = (type: string, payload: object, key: string) =>
    call('/commands', {type, payload, idempotencyKey: values['idempotency-key'] ?? key});
  const needsArg = action !== 'index';
  if (extra.length || needsArg && !arg || !needsArg && arg) throw new Error('Uso: kratos asset index|search Q|migrate ID|prepare ID|download ID|generate TAREA');
  const target = values.target ? {targetProject: values.target} : {};
  let result: unknown;
  if (action === 'index') result = await send('asset.index', {}, `asset.index:${minute}`);
  else if (action === 'search') result = await call(`/catalog?q=${encodeURIComponent(arg)}`);
  else if (action === 'migrate') result = await send('asset.migrate', {entryId: arg, ...target}, `migrate:${arg}:${values.target ?? 'juego'}`);
  else if (action === 'prepare') result = await send('asset.prepare', {entryId: arg, ...target}, `prepare:${arg}`);
  else if (action === 'download') result = await send('asset.request_download', {entryId: arg, ...target}, `download:${arg}:${minute}`);
  else if (action === 'generate') {
    // Meshy solo para piezas hard surface: text, image o remesh; el servicio rechaza cualquier otro con meshy_kind_not_allowed
    if (!values.kind || !values['params-file'] || values.credits === undefined) throw new Error('Uso: generate TAREA --kind text|image|remesh --params-file F --credits N');
    const params = JSON.parse(readFileSync(values['params-file'], 'utf8'));
    result = await send('asset.meshy_generate', {taskId: arg, kind: values.kind, params, estimatedCredits: Number(values.credits)},
      `meshy:${arg}:${values.kind}:${minute}`);
  } else throw new Error('Uso: subcomando de asset desconocido');
  console.log(JSON.stringify(result));
  return true;
}
