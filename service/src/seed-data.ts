import type { DatabaseSync } from 'node:sqlite';
import { insert } from './repo/rows.ts';
export type Writer = (table: string, id: string, data: object) => void;
export const taskId = (n: number) => `seed-task-${String(n).padStart(2, '0')}`;
export function writer(db: DatabaseSync, now: string): Writer {
  return (table, id, data) => { insert(db, table, {id, createdAt:now, updatedAt:now, ...data}); };
}
export function productionRows(put: Writer): void {
  const states = ['pendiente','pendiente','preparada','preparada','implementando','implementando',
    'revisando','revisando','probando','integrando','cerrando','done'];
  const areas = ['gameplay','ui','escenarios','assets','animacion','audio','qa','builds'];
  const titles = ['Definir salto','Diseñar HUD','Componer plaza','Elegir personaje base',
    'Implementar locomoción','Generar estatua','Revisar combate','Revisar sonido',
    'Probar recorrido','Integrar iluminación','Retirar worktree','Publicar informe'];
  states.forEach((state, i) => put('tasks', taskId(i+1), {
    title:titles[i], spec:`Producción de ejemplo: ${titles[i]}`, acceptance:['Entrega revisada y documentada'],
    state, area:areas[i % areas.length], blockedReason:i===10 ? 'No se pudo retirar el worktree: archivos sin registrar' :
      i===3 ? 'Elegir personaje base: 3 candidatos del catálogo' : null,
    decisionId:i===3 ? 'seed-decision-01' : null, assigneeRole:i===5 ? 'generador' : 'desarrollador',
    assigneeProvider:i===5 ? 'meshy' : i===6 ? 'claude' : 'codex', parentTaskId:null,
    dependsOn:i===9 ? [taskId(9)] : [], worktreeId:i===4 ? 'seed-worktree-01' : null,
    budgetId:i===5 ? 'seed-budget-task' : null,
  }));
  ['codex','claude','meshy'].forEach((provider,i) => put('runs',`seed-run-0${i+1}`,{
    taskId:taskId([5,7,6][i]), role:['implementador','revisor','generador'][i], provider,
    model:null, sessionRef:`seed-session-${i+1}`, attempt:1, state:'running',
    startedAt:'2026-10-22T19:00:00.000Z', finishedAt:null,
    summary:['Implementando locomoción','Revisando combate','Generando estatua'][i], skills:[],
  }));
  put('worktrees','seed-worktree-01',{taskId:taskId(5),path:'worktrees/locomocion',branch:'seed/locomocion',
    baseCommit:'0000000000000000000000000000000000000000',state:'active',closedReason:null});
  ['workspace','task'].forEach((scope,i) => {
    const id = i ? 'seed-budget-task' : 'seed-budget-workspace';
    put('budgets',id,{scope,scopeId:i ? taskId(6) : 'workspace',meshyCredits:100,
      elevenlabsCredits:null,tokens:null,buildMinutes:null});
    put('spends',`seed-spend-0${i+1}`,{budgetId:id,runId:'seed-run-03',kind:'meshyCredits',amount:60,note:'Generación de ejemplo'});
  });
}
export function catalogRows(put: Writer): void {
  const names = ['Advanced Cel Shader Lite','Free_Tennisball','Nude_Tennis_Racket_🎾',
    'MetaHuman Ada','MetaHuman Bruno','Personaje explorador', 'Modelo ' + 'a'.repeat(52) + '🎾'];
  for (let i=0;i<30;i++) put('catalog_entries',`seed-catalog-${String(i+1).padStart(2,'0')}`,{
    name:names[i] ?? `Recurso de producción ${i+1}`, category:i===0 ? 'shader' : 'model',
    description:i===1 || i===2 ? 'Accesorio para tenis' : 'Recurso de muestra para producción',
    source:i===3 || i===4 ? 'megascans' : 'fab', sourceUrl:null, fabUid:null, entitlementUid:null,
    state:'owned', projects:['demo'], formats:['glb'],engineVersions:['5.8'],
    license:i===5 ? null : 'Licencia de ejemplo; comprobar antes de producción', aiForbidden:i===4 ? 1 : 0,
    thumbnailPath:null,localPath:null,tags:i===1 || i===2 ? ['tenis'] : ['demo'],
  });
}
