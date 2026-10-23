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
  } else candidates=preferred ? enabled.filter(p=>p===preferred)
    : ['arte','ui','qa'].includes(role) ? (['claude','codex'] as const).filter(p=>enabled.includes(p)) : enabled;
  const provider=candidates.find(p=>usage[p]<limits[p]);
  if(!provider) return {reason:candidates.length ? `Sin hueco en ${candidates[0]}` : 'Sin proveedor habilitado'};
  return {provider,reason:'Disponible',...(role==='revisor' ? {sameProvider:provider===implementer} : {})};
}
