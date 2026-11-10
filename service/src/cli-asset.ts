import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { request, serviceInfo } from './client.ts';
import { createMeshy } from './adapters/meshy.ts';
import { balances, meshyAccounts } from './adapters/meshy-accounts.ts';

/** `nomos asset index|search|migrate|prepare|download|generate|candidates|character|metahuman|cascadeur`: envoltorios de GET /catalog y POST /commands. */
export async function assetCli(argv: string[]): Promise<boolean> {
  if (argv[0] === 'meshy') {
    // `nomos meshy cuentas`: nombre, origen y saldo de cada cuenta, en este proceso y sin claves
    if (argv[1] !== 'cuentas' || argv.slice(2).some(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--data')) throw new Error('Uso: nomos meshy cuentas');
    const accounts = meshyAccounts();
    if (!accounts.length) { console.log('Sin cuentas de Meshy: MESHY_API_KEY o scripts/guardar-claves-meshy.ps1'); return true; }
    const known = await balances(accounts, a => createMeshy({apiKey: a.key()}));
    accounts.forEach((a, i) => console.log(`${a.name} (${a.origin}): ${known[i] === null ? 'sin respuesta de Meshy' : `${known[i]} créditos`}`));
    return true;
  }
  const at = argv.findIndex((arg, i) => arg === 'asset' && !['--data', '--target', '--task', '--animation', '--action', '--why', '--mesh'].includes(argv[i - 1] ?? ''));
  if (at < 0) return false;
  const {values, positionals} = parseArgs({args: argv, allowPositionals: true, options: {data: {type: 'string'},
    target: {type: 'string'}, kind: {type: 'string'}, 'params-file': {type: 'string'}, credits: {type: 'string'},
    'idempotency-key': {type: 'string'}, task: {type: 'string'}, animation: {type: 'string', multiple: true}, metahuman: {type: 'boolean'}, action: {type: 'string'}, why: {type: 'string'}, mesh: {type: 'string'}}});
  const [, action, arg, ...extra] = positionals;
  const call = (path: string, data?: unknown) => request(serviceInfo(resolve(values.data ?? '.nomos')), path, data);
  const minute = new Date().toISOString().slice(0, 16);
  const send = (type: string, payload: object, key: string) =>
    call('/commands', {type, payload, idempotencyKey: values['idempotency-key'] ?? key});
  const needsArg = action !== 'index';
  if (extra.length || needsArg && !arg || !needsArg && arg) throw new Error('Uso: nomos asset index|search Q|migrate ID|prepare ID|download ID|generate TAREA|candidates --task TAREA Q|character MALLA --task TAREA|metahuman NOMBRE --task TAREA|cascadeur CLIP --task TAREA');
  const target = values.target ? {targetProject: values.target} : {};
  let result: unknown;
  if (action === 'index') result = await send('asset.index', {}, `asset.index:${minute}`);
  else if (action === 'search') result = await call(`/catalog?q=${encodeURIComponent(arg)}`);
  else if (action === 'migrate') result = await send('asset.migrate', {entryId: arg, ...target}, `migrate:${arg}:${values.target ?? 'juego'}`);
  else if (action === 'prepare') result = await send('asset.prepare', {entryId: arg, ...target}, `prepare:${arg}`);
  else if (action === 'download') result = await send('asset.request_download', {entryId: arg, ...target}, `download:${arg}:${minute}`);
  else if (action === 'cascadeur') {
    // solo si falta el clip (clip_missing), el QA rechazó el retarget (retarget_rejected) o lo pide el usuario (user_request)
    if (!values.task || !values.action || !values.why || !values.mesh)
      throw new Error('Uso: nomos asset cascadeur /Game/CLIP --task T --action cleanup|author|fix-retarget --why MOTIVO --mesh /Game/PERSONAJE [--metahuman]');
    result = await send('animation.cascadeur', {taskId: values.task, action: values.action, sourceClip: arg, why: values.why, mesh: values.mesh,
      ...(values.metahuman ? {targetSkeleton: 'metahuman'} : {}), ...target},
      `animation.cascadeur:${values.task}:${arg}:${minute}`);
  } else if (action === 'metahuman') {
    if (!values.task) throw new Error('Uso: nomos asset metahuman NOMBRE --task TAREA');
    result = await send('character.metahuman', {taskId: values.task, name: arg, ...target}, `character.metahuman:${values.task}:${arg}:${minute}`);
  } else if (action === 'character') {
    // monta el personaje con sus clips en el editor y pasa la comprobación animation (retarget, PIE, deformación, vídeo)
    if (!values.task || !values.animation?.length) throw new Error('Uso: nomos asset character /Game/MALLA --task TAREA --animation /Game/CLIP [--metahuman]');
    result = await send('character.setup', {taskId: values.task, mesh: arg, animations: values.animation,
      ...(values.metahuman ? {targetSkeleton: 'metahuman'} : {}), ...target}, `character.setup:${values.task}:${arg}:${minute}`);
  } else if (action === 'candidates') {
    // personajes: siempre candidatos primero; la Decisión la resuelve el usuario en el panel
    if (!values.task) throw new Error('Uso: nomos asset candidates --task TAREA "petición" [--animation AM_Clip ...]');
    result = await send('asset.candidates', {taskId: values.task, query: arg, ...(values.animation ? {animations: values.animation} : {}), ...target},
      `candidates:${values.task}:${arg.slice(0, 120)}`);
  } else if (action === 'generate') {
    // Meshy solo para piezas hard surface: text, image o remesh; el servicio rechaza cualquier otro con meshy_kind_not_allowed
    if (!values.kind || !values['params-file'] || values.credits === undefined) throw new Error('Uso: generate TAREA --kind text|image|remesh --params-file F --credits N');
    const params = JSON.parse(readFileSync(values['params-file'], 'utf8'));
    result = await send('asset.meshy_generate', {taskId: arg, kind: values.kind, params, estimatedCredits: Number(values.credits)},
      `meshy:${arg}:${values.kind}:${minute}`);
  } else throw new Error('Uso: subcomando de asset desconocido');
  console.log(JSON.stringify(result));
  return true;
}
