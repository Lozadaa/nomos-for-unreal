import type { Task, Run } from './model.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nomosSkills } from './skills-install.ts';
import { skillSplit } from './skills.ts';
/** `turn` (hito 22): la orden con la que el worker pide Unreal al planificador antes de abrirlo. */
export type BriefRules = {projectContext?: string; continuation?: string; turn?: string; rapido?: boolean; engine?: string};
/** 5.9 MegaJam Preview: el worker usa lo nuevo con plan B de 5.8 y deja constancia de qué sirvió (NOMOS_UE59). */
const ue59Rules = `## Unreal 5.9 Preview\n\nEste proyecto corre en el 5.9 MegaJam Preview (inestable). Antes de planear, lee `
  +`\`ue-oficio/references/ue59-juego.md\`: usa lo nuevo del 5.9 que encaje con tu tarea (vidrio con AVBOIT, StateTree o Blueprints `
  +`por Python, notifies con sonido y Niagara…). Pruébalo 10 min como mucho; si falla o no se nota en la captura, vuelve al camino de 5.8 y sigue.\n`
  +`En el summary, una línea por feature probada: \`NOMOS_UE59 <feature>: usada | descartada — <motivo>\`.`;
/** Modo rápido: sin TDD estricto ni pulido; en las metras los tests de física frágiles se comieron media hora de una pista. */
const rapidoRules = `\n## Modo rápido\n\n- Velocidad antes que pulido: haz lo que piden los criterios y nada más.\n`
  +`- Sin TDD estricto: solo tests de humo y de reglas (nada de física ni de visual: eso se comprueba jugando la demo). Si un test se vuelve frágil más de 10 min, bórralo y comprueba ese criterio jugando la demo.\n`
  +`- No toques nada fuera del alcance, ni para arreglar: anótalo en el summary.\n`
  +`- Compila y prueba una vez al final de cada paso, no tras cada línea.\n`;
export function workerSkillsBrief(run:Pick<Run,'provider'|'skills'>):string {
  // metras 4.ª vuelta: cargar 12 skills al empezar costó contexto y tiempo (56 min frente a 37); ahora se cargan al usarlas
  return `Carga las skills de esta tarea cuando las uses: ${run.skills.join(', ') || '(ninguna solicitada)'}.\n`
    +'Al empezar, solo `ue-oficio` (si está en la lista) y las que necesite tu primer paso; cada una de las demás, '
    +'cuando un paso toque su tema (física, cámara, input, luz…). No las cargues todas de golpe.\n'
    +'Responde en tu primera línea NOMOS_SKILLS […] con la lista JSON de las de la lista que existen en este entorno.\n'
    +'Si alguna no está disponible, omítela de la confirmación y continúa; no afirmes que existe.\n\n';
}
/** Jam 2026-11-10: la tabla «Quiero / Usa / No uses» de ue-oficio (una sola fuente), para todo rol que construye. */
const camino = (role: string) => ['revisor', 'qa', 'director'].includes(role) ? ''
  : `## Camino corto

${readFileSync(join(nomosSkills, 'ue-oficio', 'references', 'camino-corto.md'), 'utf8').trim()}

`;
const extraSkills = (task: Task, run: Run, rules: BriefRules) => {
  const extra = rules.rapido ? skillSplit(run.role, task.area).extra.filter(s => !run.skills.includes(s)) : [];
  return extra.length ? `Solo si las necesitas: ${extra.join(', ')}. No hace falta confirmarlas.

` : '';
};
export function renderBrief(task: Task, run: Run, rules: BriefRules = {}): string {
  const template=readFileSync(join(nomosSkills,'nomos','references','brief-worker.md'),'utf8');
  const values: Record<string,string>={title:task.title,spec:task.spec,
    acceptance:task.acceptance.map((item,index)=>`${index+1}. ${item}`).join('\n'),
    scope:task.scope.map(path=>`- ${path}`).join('\n') || '(vacío: no autoriza archivos)',
    provider:run.provider,role:run.role,skills:run.skills.join(', '),providerInstructions:workerSkillsBrief(run)+extraSkills(task,run,rules),camino:camino(run.role),
    context:[rules.engine?.startsWith('5.9') ? ue59Rules : '',rules.projectContext ?? ''].filter(Boolean).join('\n\n') || 'Sin contexto adicional.',rapido:rules.rapido ? rapidoRules : '',continuation:rules.continuation ? `\n${rules.continuation}\n` : '',
    // x10: el Python del editor y los tests van al editor caliente (0,1 s por script frente a 12-15 s en frío) y piden
    // y sueltan el turno solos en cada orden, para que las comprobaciones de Nomos no esperen detrás de un turno retenido
    turn:rules.turn ? `- El Python del editor va por \`${rules.turn.replace(/worker turn (\S+)/, 'ue py --tarea $1')} <script.py> [--env K=V]\` `
      +`y los tests de automatización por \`${rules.turn.replace(/worker turn (\S+)/, 'ue test --tarea $1')} <filtro>\` (JSON con pasados y fallidos, exit 1 si falla), `
      +`no por UnrealEditor-Cmd. Cada orden pide el turno de Unreal, espera si está ocupado y lo suelta al acabar; el editor queda abierto entre órdenes.\n`
      // acelera C: montar escenas, sondear assets y crear BP + DataAsset sin escribir Python (los scripts que más se repetían)
      +`- Para colocar actores en un mapa, inventariar assets, crear un Blueprint hijo con su DataAsset, importar una malla, ajustar la cámara del pawn, `
      +`dejar la luz exterior lista para capturas o esparcir mallas con PCG, escribe una receta JSON en vez de un script: `
      +`\`${rules.turn.replace(/worker turn (\S+)/, 'ue receta --tarea $1')} <receta.json>\` (plantillas y campos: \`${rules.turn.replace(/worker turn \S+/, 'ue recetas')}\`; repetida sin cambios no abre el editor). `
      +`Si Unreal se cae, lee el informe con \`${rules.turn.replace(/worker turn \S+/, 'ue crash')}\` antes de relanzar.\n`
      +`- Para abrir Unreal por otra vía (build, empaquetado, -game) pide turno y espera: \`${rules.turn} --wait\`; al terminar, devuélvelo: \`${rules.turn} --release\`. `
      +`Un turno retenido sin ningún Unreal abierto se libera solo a los 3 min. No escribas bucles propios de espera de RAM.\n` : ''};
  return template.replace(/\{\{(\w+)\}\}/g,(_,key)=>values[key] ?? '');
}
