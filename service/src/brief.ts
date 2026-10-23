import type { Task, Run } from './model.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export type BriefRules = {projectContext?: string};
export function renderBrief(task: Task, run: Run, rules: BriefRules = {}): string {
  const template=readFileSync(fileURLToPath(new URL('../../skills/kratos/references/brief-worker.md',import.meta.url)),'utf8');
  const values: Record<string,string>={title:task.title,spec:task.spec,
    acceptance:task.acceptance.map((item,index)=>`${index+1}. ${item}`).join('\n'),
    scope:task.scope.map(path=>`- ${path}`).join('\n') || '(vacío: no autoriza archivos)',
    provider:run.provider,role:run.role,skills:run.skills.join(', '),context:rules.projectContext ?? 'Sin contexto adicional.'};
  return template.replace(/\{\{(\w+)\}\}/g,(_,key)=>values[key] ?? '');
}
