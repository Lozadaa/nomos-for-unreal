import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

/**
 * Pedidos manuales: lo que solo puede hacer una persona con una herramienta sin API (PBRGen en el navegador, por ejemplo).
 * El worker deja el pedido con el prompt y la carpeta de destino, sigue con un sustituto y no espera. Cada pedido es un
 * archivo en `docs/pedidos/` del juego (viaja por Git con la tarea); está hecho cuando hay una imagen en su destino.
 */
export type Pedido = {id: string; para: string; prompt: string; encargo: string; destino: string; sustituto: string | null; creado: string};
export type PedidoEstado = Pedido & {estado: 'pendiente' | 'hecho'};

const carpeta = (juego: string) => join(resolve(juego), 'docs', 'pedidos');
const IMAGEN = /\.(png|jpe?g|tga|exr|tiff?|webp)$/i;

/** Un pedido lo ejecuta una persona sin el contexto del worker: el prompt tiene que bastarse solo. */
export const PROMPT_MIN = 200;
const VAGO = `El prompt del pedido tiene que ser ultra específico (≥ ${PROMPT_MIN} caracteres): qué superficie u objeto es y dónde sale en el juego, `
  + 'tamaño real en cm, colores exactos de la paleta, estilo, desgaste y detalle, que repita sin costuras, resolución, qué mapas o archivos hacen falta y qué evitar';

export function crearPedido(juego: string, p: {id: string; prompt: string; encargo: string; destino: string; para?: string; sustituto?: string}): Pedido {
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(p.id)) throw new Error('El id del pedido va en minúsculas, cifras y guiones (2-49 caracteres): tierra-ruedo');
  if (p.prompt.trim().length < PROMPT_MIN) throw new Error(VAGO);
  if (!p.encargo?.trim()) throw new Error('--encargo: la frase literal del usuario que pide esto (de su encargo o de su mensaje), para que sepa por qué se lo pides');
  const destino = p.destino.replace(/\\/g, '/').replace(/\/$/, '');
  if (!destino || isAbsolute(destino) || destino.split('/').includes('..')) throw new Error('--destino es una carpeta dentro del juego: Importar/Materiales/tierra-ruedo');
  const pedido: Pedido = {id: p.id, para: p.para?.trim() || 'PBRGen', prompt: p.prompt.trim(), encargo: p.encargo.trim(), destino, sustituto: p.sustituto?.trim() || null, creado: new Date().toISOString()};
  mkdirSync(carpeta(juego), {recursive: true});
  writeFileSync(join(carpeta(juego), `${p.id}.json`), JSON.stringify(pedido, null, 2) + '\n');
  return pedido;
}

export function listarPedidos(juego: string): PedidoEstado[] {
  const dir = carpeta(juego);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json')).sort().flatMap(f => {
    try {
      const p = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Pedido, destino = join(resolve(juego), p.destino);
      const hecho = existsSync(destino) && (readdirSync(destino, {recursive: true}) as string[]).some(x => IMAGEN.test(x));
      return [{...p, estado: hecho ? 'hecho' as const : 'pendiente' as const}];
    } catch { return []; }  // un archivo roto no tumba la lista
  });
}

const texto = (p: PedidoEstado) => `${p.estado.toUpperCase()}  ${p.id}  (${p.para})\n  Pediste: «${p.encargo}»\n  Prompt: ${p.prompt}\n  Deja el resultado en: ${p.destino}/`
  + (p.sustituto ? `\n  Mientras tanto: ${p.sustituto}` : '');

const USO = 'Uso: nomos pedido crear ID "PROMPT ULTRA ESPECÍFICO" --encargo "FRASE LITERAL DEL USUARIO" --destino CARPETA [--para PBRGen] [--sustituto "QUÉ SE USA MIENTRAS"] [--juego .]'
  + ' | pedido lista [--juego .] [--json]';
export function pedidoCli(argv: string[]): boolean {
  const first = argv.find((a, i) => !a.startsWith('--') && !['--data', '--destino', '--para', '--sustituto', '--juego', '--encargo'].includes(argv[i - 1] ?? ''));
  if (first !== 'pedido') return false;
  const {values, positionals} = parseArgs({args: argv, allowPositionals: true, options: {data: {type: 'string'}, destino: {type: 'string'},
    para: {type: 'string'}, sustituto: {type: 'string'}, juego: {type: 'string'}, encargo: {type: 'string'}, json: {type: 'boolean'}}});
  const [, accion, id, ...resto] = positionals, juego = values.juego ?? '.';
  if (accion === 'crear' && id && resto.length && values.destino) {
    console.log(JSON.stringify(crearPedido(juego, {id, prompt: resto.join(' '), encargo: values.encargo ?? '', destino: values.destino, para: values.para, sustituto: values.sustituto}), null, 2));
    return true;
  }
  if (accion === 'lista' && !id) {
    const lista = listarPedidos(juego);
    console.log(values.json ? JSON.stringify(lista, null, 2) : lista.map(texto).join('\n\n') || 'Sin pedidos.');
    return true;
  }
  throw new Error(USO);
}
