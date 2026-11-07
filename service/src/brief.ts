import type { Task, Run } from './model.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nomosSkills } from './skills-install.ts';
/** `turn` (hito 22): la orden con la que el worker pide Unreal al planificador antes de abrirlo. */
export type BriefRules = {projectContext?: string; continuation?: string; turn?: string};
export function workerSkillsBrief(run:Pick<Run,'provider'|'skills'>):string {
  return `Carga las skills enumeradas antes de empezar: ${run.skills.join(', ') || '(ninguna solicitada)'}.\n`
    +'Responde en tu primera línea NOMOS_SKILLS […] con la lista JSON de skills realmente cargadas.\n'
    +'Si alguna no está disponible, omítela de la confirmación y continúa; no afirmes haberla cargado.\n\n';
}
export function renderBrief(task: Task, run: Run, rules: BriefRules = {}): string {
  const template=readFileSync(join(nomosSkills,'nomos','references','brief-worker.md'),'utf8');
  const values: Record<string,string>={title:task.title,spec:task.spec,
    acceptance:task.acceptance.map((item,index)=>`${index+1}. ${item}`).join('\n'),
    scope:task.scope.map(path=>`- ${path}`).join('\n') || '(vacío: no autoriza archivos)',
    provider:run.provider,role:run.role,skills:run.skills.join(', '),providerInstructions:workerSkillsBrief(run),
    context:rules.projectContext ?? 'Sin contexto adicional.',continuation:rules.continuation ? `\n${rules.continuation}\n` : '',
    turn:rules.turn ? `- Antes de abrir Unreal (editor, build, empaquetado, PIE) pide turno y espera: \`${rules.turn} --wait\`. `
      +`Al cerrarlo, devuélvelo: \`${rules.turn} --release\`. No escribas bucles propios de espera de RAM.\n`
      // x10: el Python del editor va al editor caliente (0,1 s por script frente a 12-15 s de arranque en frío)
      +`- Con el turno, el Python del editor va por \`${rules.turn.replace(/worker turn \S+/, 'ue py')} <script.py> [--env K=V]\`, no por UnrealEditor-Cmd -ExecutePythonScript: `
      +`el editor queda abierto entre scripts y se cierra al devolver el turno.\n` : ''};
  return template.replace(/\{\{(\w+)\}\}/g,(_,key)=>values[key] ?? '');
}
