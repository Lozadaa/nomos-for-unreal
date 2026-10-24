import type { Task, Run } from './model.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export type BriefRules = {projectContext?: string; continuation?: string};
export function workerSkillsBrief(run:Pick<Run,'provider'|'skills'>):string {
  return `Carga las skills enumeradas antes de empezar: ${run.skills.join(', ') || '(ninguna solicitada)'}.\n`
    +'Responde en tu primera línea NOMOS_SKILLS […] con la lista JSON de skills realmente cargadas.\n'
    +'Si alguna no está disponible, omítela de la confirmación y continúa; no afirmes haberla cargado.\n\n';
}
export function renderBrief(task: Task, run: Run, rules: BriefRules = {}): string {
  const template=readFileSync(fileURLToPath(new URL('../../skills/nomos/references/brief-worker.md',import.meta.url)),'utf8');
  const values: Record<string,string>={title:task.title,spec:task.spec,
    acceptance:task.acceptance.map((item,index)=>`${index+1}. ${item}`).join('\n'),
    scope:task.scope.map(path=>`- ${path}`).join('\n') || '(vacío: no autoriza archivos)',
    provider:run.provider,role:run.role,skills:run.skills.join(', '),providerInstructions:workerSkillsBrief(run),
    context:rules.projectContext ?? 'Sin contexto adicional.',continuation:rules.continuation ? `\n${rules.continuation}\n` : ''};
  return template.replace(/\{\{(\w+)\}\}/g,(_,key)=>values[key] ?? '');
}
