import { concurrency,type SchedulerConfig,type WorkerProvider } from './config.ts';

const names:Record<WorkerProvider,string>={codex:'Codex',claude:'Claude',opencode:'OpenCode'};
export function chooseProvider(role:string,config:SchedulerConfig,usage:Record<WorkerProvider,number>,
  implementer?:WorkerProvider,preferred?:WorkerProvider):{provider?:WorkerProvider;reason:string;sameProvider?:boolean} {
  // Hito 12: OpenCode (barato) solo si la tarea lo pide; nunca por defecto, nunca arte/UI/QA ni revisor.
  const limits=concurrency(config),enabled=(['codex','claude'] as const).filter(p=>limits[p]>0);
  let candidates:WorkerProvider[];
  if(role==='revisor') {
    if(!implementer) return {reason:'Falta implementación para revisar'};
    if(implementer==='opencode') {
      // el revisor de OpenCode es siempre Claude, aunque solo quede cupo de OpenCode o Codex
      if(!limits.claude) return {reason:'El revisor de OpenCode es Claude: dale cupo a claude en config.json'};
      if(usage.claude>=limits.claude) return {reason:'El revisor de OpenCode es Claude: sin hueco en claude'};
      return {provider:'claude',reason:'Disponible',sameProvider:false};
    }
    candidates=enabled.length===1 ? enabled : enabled.filter(p=>p!==implementer);
  } else if(preferred==='opencode') {
    if(['arte','ui','qa'].includes(role)) return {reason:'OpenCode no hace arte, UI ni QA: asígnala a Claude'};
    candidates=limits.opencode>0 ? ['opencode'] : [];
  } else {
    // Claude es el proveedor por defecto; arte, UI y QA lo prefieren siempre.
    const first=['arte','ui','qa'].includes(role) || config.defaultProvider==='opencode' ? 'claude' : config.defaultProvider ?? 'claude';
    candidates=preferred ? enabled.filter(p=>p===preferred) : [...enabled].sort((a,b)=>Number(b===first)-Number(a===first));
  }
  const provider=candidates.find(p=>usage[p]<limits[p]);
  // hito 7: Codex viene apagado; una tarea que lo pide dice cuál y cómo encenderlo
  if(!provider) return {reason:candidates.length ? `Sin hueco en ${candidates[0]}`
    : preferred && limits[preferred]===0 ? `${names[preferred]} apagado: dale cupo en config.json` : 'Sin proveedor habilitado'};
  return {provider,reason:'Disponible',...(role==='revisor' ? {sameProvider:provider===implementer} : {})};
}
