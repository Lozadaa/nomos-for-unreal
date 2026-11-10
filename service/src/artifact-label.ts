import { basename } from 'node:path';

/** Nombres que Entregas muestra en vez de `log.txt` o `review-<uuid>.json` (corrección del usuario, 2026-10-23). */
const checkNames: Record<string, string> = {acabado: 'Acabado', imagen: 'Imagen del modo demo', cpp: 'Compilación C++', blueprint: 'Blueprints', asset: 'Assets', map: 'Mapa', umg: 'UMG', build: 'Empaquetado', animation: 'Animación'};
export const checkReportLabel = (check: string) => `${checkNames[check] ?? check} · registro`;

export function checkArtifactLabel(check: string, kind: string, path: string, provenance: Record<string, unknown> = {}): string {
  if (kind === 'build') return `Empaquetado · ${basename(path)}`;
  const res = typeof provenance.resolution === 'string' ? ` ${provenance.resolution.replace('x', '×')}` : '';
  if (kind === 'screenshot' && provenance.visual === 'diff') return `Diferencia con la línea base${res}`;
  if (kind === 'screenshot') return check === 'umg' ? `Captura UMG${res}` : check === 'map' ? `Captura de control${res}` : `Captura del ejecutable${res}`;
  if (provenance.source === 'game-log') return `${checkNames[check] ?? check} · log del juego`;
  if (provenance.source === 'insights') return `${checkNames[check] ?? check} · traza de Insights`;
  return `${checkNames[check] ?? check} · ${kind}`;
}
/** «Caja de munición» → «caja de munición» para «Modelo Meshy · caja de munición». */
export const lowerFirst = (text: string) => text ? text[0].toLocaleLowerCase('es') + text.slice(1) : text;
