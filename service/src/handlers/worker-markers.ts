import { createHash } from 'node:crypto';

export type Finding={file:string;line:number;severity:string;note:string};
export type Marker = {kind:'DONE';summary:string;commits:string[];tests:string} | {kind:'ASK'|'INVALID_REVIEW';question:string}
  | {kind:'REVIEW';approved:boolean;findings:Finding[]};
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
    if(kind==='REVIEW' && typeof data.approved==='boolean' && Array.isArray(data.findings)
      && data.findings.every((f:any)=>f && typeof f.file==='string'&&f.file.trim()
        &&Number.isSafeInteger(f.line)&&f.line>0&&typeof f.severity==='string'&&f.severity.trim()
        &&typeof f.note==='string'&&f.note.trim())) return {kind:'REVIEW',approved:data.approved,findings:data.findings};
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
    const match=/^KRATOS_(DONE|ASK|REVIEW) (\{.*)$/.exec(line);
    if(!match) {
      if(['KRATOS_DONE ','KRATOS_ASK ','KRATOS_REVIEW '].some(prefix=>prefix.startsWith(line)) && line) buffer=line;
      else if(/^KRATOS_REVIEW\b/.test(line)) found.push({kind:'INVALID_REVIEW',question:line});
      continue;
    }
    const marker=decode(match[1],match[2]);
    if(marker) found.push(marker);
    else if(line.length<=65536) {
      try {
        JSON.parse(match[2]);if(match[1]==='REVIEW') found.push({kind:'INVALID_REVIEW',question:line});
      } catch {
        if(match[1]==='REVIEW') found.push({kind:'INVALID_REVIEW',question:line});
        if(match[1]!=='REVIEW' || !/}\s*$/.test(line)) buffer=line;
      }
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
    const match=/^(?:• )?KRATOS_(DONE|ASK|REVIEW) (\{.*)$/.exec(lines[i]);
    if(!match) {
      if(/^(?:• )?KRATOS_REVIEW\b/.test(lines[i])) found.push({kind:'INVALID_REVIEW',question:lines[i]});
      continue;
    }
    const original=lines[i];
    let text=match[2],marker=decode(match[1],text);
    while(!marker && i+1<lines.length && /^ {2,}\S/.test(lines[i+1]) && !/^\s*(`{3,}|~{3,})/.test(lines[i+1])) {
      text+=' '+lines[++i].trimStart();
      if(text.length>65536) break;
      marker=decode(match[1],text);
    }
    if(marker) found.push(marker);
    else if(match[1]==='REVIEW') found.push({kind:'INVALID_REVIEW',question:original});
  }
  return found;
}
