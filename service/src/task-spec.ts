import { normalizedPaths } from './handlers/worker-policy.ts';

/** Contrato Markdown español: ver docs/task-spec.md. El contenido se conserva como datos. */
export function parseTaskSpec(markdown: string): {spec: string; acceptance: string[]; scope: string[]} {
  taskEstados(markdown);
  const spec=markdown.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  const headings=['Qué','Por qué','Criterios de aceptación','Alcance','No tocar','Estados'];
  const sections=new Map<string,string[]>();let section: string | undefined,fence='',fenceLength=0;
  for (const line of spec.split('\n')) {
    const marker=/^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (marker && marker[1][0]===fence && marker[1].length>=fenceLength && /^\s*$/.test(line.slice(marker[0].length))) fence='';
      continue;
    }
    if (marker) {fence=marker[1][0];fenceLength=marker[1].length;continue;}
    if (/^#{1,6}\s/.test(line)) {
      section=undefined;
      const heading=/^## (.+)$/.exec(line);
      if (heading && headings.includes(heading[1])) {
        section=heading[1];if (sections.has(section)) throw new Error('invalid_task_spec: sección duplicada');
        sections.set(section,[]);
      }
      continue;
    }
    if (section) sections.get(section)!.push(line);
  }
  if (!headings.filter(h=>h!=='Estados').every(h=>sections.has(h)) || !['Qué','Por qué'].every(h=>sections.get(h)!.join('\n').trim()))
    throw new Error('invalid_task_spec: faltan encabezados o contenido');
  const acceptance=sections.get('Criterios de aceptación')!.flatMap(line=>{
    const match=/^\s*\d+\.\s+(\S.*?)\s*$/.exec(line);return match ? [match[1]] : [];
  });
  const scope=normalizedPaths(sections.get('Alcance')!.flatMap(line=>{
    const match=/^\s*-\s+(\S.*?)\s*$/.exec(line);if (!match) return [];
    const path=match[1];return [path.startsWith('`') && path.endsWith('`') ? path.slice(1,-1) : path];
  }));
  if (!acceptance.length || !scope.length) throw new Error('invalid_task_spec: requiere criterios y alcance');
  return {spec,acceptance,scope};
}

/** Un estado de la UI que la comprobación umg captura aparte: órdenes de consola (CVars o exec) que lo provocan. */
export type UiEstado = {nombre: string; comandos: string[]};

/** `## Estados` (opcional): `- nombre: orden1; orden2`. Las órdenes siguen la regla de `checks.captureCvars`
 *  (sin comas, comillas ni saltos de línea). Sin la sección, ninguno. Fuera de bloques de código, como el resto de la spec. */
export function taskEstados(markdown: string): UiEstado[] {
  const lines=markdown.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n'),out: UiEstado[]=[];
  let inside=false,fence='';
  for (const line of lines) {
    const marker=/^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) {fence=fence ? (marker[1][0]===fence ? '' : fence) : marker[1][0];continue;}
    if (fence) continue;
    if (/^#{1,6}\s/.test(line)) {inside=/^## Estados\s*$/.test(line);continue;}
    const item=inside && /^\s*-\s+(.*?)\s*$/.exec(line);
    if (!item) continue;
    const match=/^`?([^:`]+?)`?\s*:\s*(.+)$/.exec(item[1]);
    const nombre=match?.[1].trim() ?? '',comandos=(match?.[2] ?? '').split(';').map(c=>c.trim().replace(/^`|`$/g,'').trim()).filter(Boolean);
    if (!/^[\p{L}\p{N} _-]{1,40}$/u.test(nombre) || !comandos.length || comandos.some(c=>/[,"'\r\n]/.test(c)))
      throw new Error(`invalid_task_spec: estado inválido «${item[1]}» (usa «- nombre: orden1; orden2», sin comas ni comillas)`);
    if (out.some(e=>e.nombre===nombre)) throw new Error(`invalid_task_spec: estado repetido «${nombre}»`);
    out.push({nombre,comandos});
  }
  return out;
}
