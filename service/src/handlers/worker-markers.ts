import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Marcadores NOMOS_*; hasta el 2026-11-24 también los KRATOS_* de workers lanzados con briefs anteriores al hito 11.
export type Finding={file:string;line:number;severity:string;note:string};
export type Marker = {kind:'DONE';summary:string;commits:string[];tests:string} | {kind:'ASK'|'INVALID_REVIEW';question:string}
  | {kind:'REVIEW';approved:boolean;findings:Finding[]} | {kind:'SKILLS';skills:string[]};
export const compactMarkerText=(text:string)=>text.replace(/\s/g,'');
export function markerId(marker: Extract<Marker,{kind:'DONE'}>): string {
  return createHash('sha256').update(JSON.stringify({summary:compactMarkerText(marker.summary),
    commits:marker.commits.map(compactMarkerText),tests:marker.tests})).digest('hex');
}
function decode(kind:string,text:string): Marker | undefined {
  try {
    const data=JSON.parse(text);
    if(kind==='SKILLS' && Array.isArray(data) && data.every(s=>typeof s==='string'&&s.trim()))
      return {kind:'SKILLS',skills:[...new Set(data)]};
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
/** Hito 13: una marca partida se reensambla hasta 40 líneas u 8 KB; más allá se abandona. */
export const markerLimits={lines:40,bytes:8192};
const prefixes=['NOMOS_DONE ','NOMOS_ASK ','NOMOS_REVIEW ','NOMOS_SKILLS ','KRATOS_DONE ','KRATOS_ASK ','KRATOS_REVIEW ','KRATOS_SKILLS '];
/** Sangría o viñeta delante de la marca (hito 13). */
const lead=/^\s*(?:[•●⏺] )?/;
/**
 * Filas de una marca partida → marcador. El terminal parte de dos formas: corte duro por el ancho de columna (la fila
 * siguiente continúa tal cual) o salto suave con sangría (la palabra sigue tras un espacio): se prueban las dos.
 */
function assemble(kind:string,rows:string[]): Marker | undefined {
  let raw=rows[0],tight=rows[0],spaced=rows[0];
  for(let k=1;k<rows.length;k++) {
    raw+=rows[k];tight+=rows[k].trimStart();spaced+=' '+rows[k].trimStart();
  }
  return decode(kind,raw) ?? decode(kind,tight) ?? decode(kind,spaced);
}
export function streamMarkers(lines:string[],buffer:string,fence=''): {found:Marker[];buffer:string;fence:string} {
  const found:Marker[]=[];
  // el búfer guarda las filas de la marca en curso separadas por \n (una marca de antes del hito 13 es una sola fila)
  let rows=buffer ? buffer.split('\n') : [];
  for(const original of lines) {
    let line=original;
    const nextFence=fenceLine(line,fence);
    if(nextFence!==undefined) {fence=nextFence;rows=[];continue;}
    if(fence) {rows=[];continue;}
    const bare=line.replace(lead,'');
    if(rows.length && !/^(?:NOMOS|KRATOS)_/.test(bare)) {
      const head=/^(?:NOMOS|KRATOS)_(DONE|ASK|REVIEW|SKILLS) ([\[{].*)$/.exec(rows[0]);
      if(!head) {line=rows.join('')+line;rows=[];}
      else {
        rows.push(line);
        const marker=assemble(head[1],[head[2],...rows.slice(1)]);
        if(marker) {found.push(marker);rows=[];}
        else if(rows.length>=markerLimits.lines || rows.join('').length>markerLimits.bytes) rows=[];
        continue;
      }
    }
    rows=[];
    const text=line.replace(lead,'');
    const match=/^(?:NOMOS|KRATOS)_(DONE|ASK|REVIEW|SKILLS) ([\[{].*)$/.exec(text);
    if(!match) {
      if(prefixes.some(prefix=>prefix.startsWith(text)) && text) rows=[text];
      else if(/^(?:NOMOS|KRATOS)_REVIEW\b/.test(text)) found.push({kind:'INVALID_REVIEW',question:text});
      continue;
    }
    const marker=decode(match[1],match[2]);
    if(marker) found.push(marker);
    else if(text.length<=65536) {
      try {
        JSON.parse(match[2]);if(match[1]==='REVIEW') found.push({kind:'INVALID_REVIEW',question:text});
      } catch {
        if(match[1]==='REVIEW') found.push({kind:'INVALID_REVIEW',question:text});
        if(match[1]!=='REVIEW' || !/}\s*$/.test(text)) rows=[text];
      }
    }
  }
  return {found,buffer:rows.join('\n'),fence};
}
/**
 * Hito 13: canal sin terminal. El worker deja el JSON de la marca en `.nomos-inbox/done.json`, `review.json` o `ask.json`
 * de su worktree (excluido de Git); el sondeo lo lee antes que el terminal. Un JSON a medio escribir espera al siguiente.
 */
export function inboxMarkers(treePath:string): {found:Marker[];consume:()=>void} {
  const found:Marker[]=[],files:string[]=[];
  for(const [name,kind] of [['done','DONE'],['review','REVIEW'],['ask','ASK']]) {
    const file=join(treePath,'.nomos-inbox',`${name}.json`);
    if(!existsSync(file)) continue;
    const marker=decode(kind,readFileSync(file,'utf8'));
    if(marker) {found.push(marker);files.push(file);}
  }
  return {found,consume:()=>{for(const file of files) rmSync(file,{force:true});}};
}
/** Codex y Claude sangran las líneas siguientes de un mensaje con viñeta; la salida de herramienta usa └ o ⎿. */
function bulletContinuation(lines:string[],i:number):boolean {
  for(let j=i-1;j>=0;j--) {
    if(/^[•●⏺] /.test(lines[j])) return true;
    // las continuaciones de una lista dentro del mensaje llevan cuatro o más espacios (Claude, hito 5)
    if(!/^ {2,}[^\s└│⎿]/.test(lines[j])) return false;
  }
  // hito 7: en un mensaje largo la viñeta ya salió del frame; todo lo de arriba es continuación
  return i>0;
}
/** Cada frame es autónomo; nunca se conserva JSON parcial de pantalla entre lecturas. */
export function screenMarkers(lines:string[]): Marker[] {
  const found:Marker[]=[];let fence='';
  const width=Math.max(0,...lines.map(l=>l.length));
  for(let i=0;i<lines.length;i++) {
    const nextFence=fenceLine(lines[i],fence);
    if(nextFence!==undefined) {fence=nextFence;continue;}
    if(fence) continue;
    const line=/^ {2}(?:NOMOS|KRATOS)_/.test(lines[i]) && bulletContinuation(lines,i) ? lines[i].slice(2) : lines[i];
    // hito 7: Claude Code parte la línea justo tras el marcador si el JSON no cabe; el JSON sigue en las líneas sangradas
    const bare=/^(?:[•●⏺] )?(?:NOMOS|KRATOS)_(DONE|ASK|REVIEW|SKILLS)\s*$/.exec(line);
    const match=bare && /^ {2,}[\[{]/.test(lines[i+1] ?? '') ? [line,bare[1],lines[++i].trimStart()]
      : /^(?:[•●⏺] )?(?:NOMOS|KRATOS)_(DONE|ASK|REVIEW|SKILLS) ([\[{].*)$/.exec(line);
    if(!match) {
      if(/^(?:[•●⏺] )?(?:NOMOS|KRATOS)_REVIEW\b/.test(line)) found.push({kind:'INVALID_REVIEW',question:lines[i]});
      continue;
    }
    const original=lines[i];
    let text=match[2],marker=decode(match[1],text),tight=text;
    // hito 13: una fila que llena el ancho del terminal sigue en la de abajo aunque esta no lleve sangría (corte duro)
    const continues=(j:number)=>j<lines.length && !/^\s*(`{3,}|~{3,})/.test(lines[j])
      && (/^ {2,}\S/.test(lines[j]) || lines[j-1].length>=width && !!lines[j] && !/^(?:[•●⏺] )?(?:NOMOS|KRATOS)_/.test(lines[j]));
    let hard=false;
    for(let joined=1;!marker && continues(i+1) && joined<markerLimits.lines;joined++) {
      // hito 5b: una línea que llena el ancho del terminal se partió a mitad de palabra («"sev» / «erity"»): sin espacio
      // el corte duro conserva la fila tal cual (un espacio inicial es el del texto); la sangría de Claude es de dos o más
      const full=lines[i].length>=width,indented=/^ {2,}/.test(lines[i+1]),next=lines[++i].trimStart().replace(/^⎿ /,'');
      text+=' '+next; tight+=(full ? '' : ' ')+(indented ? next : lines[i]);hard||=!indented;
      if(tight.length>markerLimits.bytes) break;
      // con un corte duro manda la unión exacta; con solo sangría, la de espacios (y la exacta si la clave quedó partida)
      marker=hard ? decode(match[1],tight) ?? decode(match[1],text) : decode(match[1],text) ?? decode(match[1],tight);
    }
    if(marker) found.push(marker);
    else if(match[1]==='REVIEW') found.push({kind:'INVALID_REVIEW',question:original});
  }
  return found;
}
