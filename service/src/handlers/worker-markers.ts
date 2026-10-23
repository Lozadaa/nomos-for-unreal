import { createHash } from 'node:crypto';

export type Marker = {kind:'DONE';summary:string;commits:string[];tests:string} | {kind:'ASK';question:string};
export const compactMarkerText=(text:string)=>text.replace(/\s/g,'');
export function markerId(marker: Extract<Marker,{kind:'DONE'}>): string {
  return createHash('sha256').update(JSON.stringify({summary:compactMarkerText(marker.summary),
    commits:marker.commits.map(compactMarkerText),tests:marker.tests})).digest('hex');
}
function decode(kind:string,text:string): Marker | undefined {
  try {
    const data=JSON.parse(text);
    if(kind==='DONE' && typeof data.summary==='string' && Array.isArray(data.commits)
      && data.commits.every((s:unknown)=>typeof s==='string') && ['passed','failed','none'].includes(data.tests)) {
      return {kind:'DONE',summary:data.summary,commits:data.commits,tests:data.tests};
    }
    if(kind==='ASK' && typeof data.question==='string' && data.question.trim()) return {kind:'ASK',question:data.question};
  } catch {}
}
function fenceLine(line:string,fence:string): string | undefined {
  const delimiter=/^\s*(`{3,}|~{3,})/.exec(line);
  if(!delimiter) return undefined;
  const token=delimiter[1],suffix=line.slice(delimiter[0].length);
  if(!fence) return token;
  return token[0]===fence[0] && token.length>=fence.length && /^\s*$/.test(suffix) ? '' : fence;
}
export function streamMarkers(lines:string[],buffer:string,fence=''): {found:Marker[];buffer:string;fence:string} {
  const found:Marker[]=[];
  for(let line of lines) {
    const nextFence=fenceLine(line,fence);
    if(nextFence!==undefined) {fence=nextFence;buffer='';continue;}
    if(fence) {buffer='';continue;}
    if(!/^KRATOS_/.test(line) && buffer) line=buffer+line;
    buffer='';
    const match=/^KRATOS_(DONE|ASK) (\{.*)$/.exec(line);
    if(!match) {
      if(['KRATOS_DONE ','KRATOS_ASK '].some(prefix=>prefix.startsWith(line)) && line) buffer=line;
      continue;
    }
    const marker=decode(match[1],match[2]);
    if(marker) found.push(marker);
    else if(line.length<=65536) {
      try {JSON.parse(match[2]);} catch {buffer=line;}
    }
  }
  return {found,buffer,fence};
}
/** Cada frame es autónomo; nunca se conserva JSON parcial de pantalla entre lecturas. */
export function screenMarkers(lines:string[]): Marker[] {
  const found:Marker[]=[];let fence='';
  for(let i=0;i<lines.length;i++) {
    const nextFence=fenceLine(lines[i],fence);
    if(nextFence!==undefined) {fence=nextFence;continue;}
    if(fence) continue;
    const match=/^(?:• )?KRATOS_(DONE|ASK) (\{.*)$/.exec(lines[i]);
    if(!match) continue;
    let text=match[2],marker=decode(match[1],text);
    while(!marker && i+1<lines.length && /^ {2,}\S/.test(lines[i+1]) && !/^\s*(`{3,}|~{3,})/.test(lines[i+1])) {
      text+=' '+lines[++i].trimStart();
      if(text.length>65536) break;
      marker=decode(match[1],text);
    }
    if(marker) found.push(marker);
  }
  return found;
}
