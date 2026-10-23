import { normalizedPaths } from './handlers/worker-policy.ts';

/** Contrato Markdown español: ver docs/task-spec.md. El contenido se conserva como datos. */
export function parseTaskSpec(markdown: string): {spec: string; acceptance: string[]; scope: string[]} {
  const spec=markdown.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  const headings=['Qué','Por qué','Criterios de aceptación','Alcance','No tocar'];
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
  if (!headings.every(h=>sections.has(h)) || !['Qué','Por qué'].every(h=>sections.get(h)!.join('\n').trim()))
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
