import { concurrency,type SchedulerConfig,type WorkerProvider } from './config.ts';

export function chooseProvider(role:string,config:SchedulerConfig,usage:Record<WorkerProvider,number>,
  implementer?:WorkerProvider,preferred?:WorkerProvider):{provider?:WorkerProvider;reason:string;sameProvider?:boolean} {
  if(preferred==='opencode') return {reason:'OpenCode sin adaptador disponible'};
  // Proveedores elegibles con adaptador; OpenCode se reconoce aparte, sin ejecución disponible.
  const limits=concurrency(config),enabled=(['codex','claude'] as const).filter(p=>limits[p]>0);
  let candidates:WorkerProvider[];
  if(role==='revisor') {
    if(!implementer) return {reason:'Falta implementación para revisar'};
    candidates=enabled.length===1 ? enabled : enabled.filter(p=>p!==implementer);
  } else {
    // Claude es el proveedor por defecto; arte, UI y QA lo prefieren siempre.
    const first=['arte','ui','qa'].includes(role) ? 'claude' : config.defaultProvider ?? 'claude';
    candidates=preferred ? enabled.filter(p=>p===preferred) : [...enabled].sort((a,b)=>Number(b===first)-Number(a===first));
  }
  const provider=candidates.find(p=>usage[p]<limits[p]);
  if(!provider) return {reason:candidates.length ? `Sin hueco en ${candidates[0]}` : 'Sin proveedor habilitado'};
  return {provider,reason:'Disponible',...(role==='revisor' ? {sameProvider:provider===implementer} : {})};
}
