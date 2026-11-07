// Tabla del benchmark FASTVFX a partir de los datos crudos de docs/fastvfx/bench-*.json (mediana y p95 por flujo).
// Uso: node scripts/fastvfx-informe.ts docs/fastvfx/bench-A.json docs/fastvfx/bench-B-frio.json ...
import { readFileSync } from 'node:fs';

type Fila = Record<string, unknown> & {ok?: boolean};
const pct = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const seg = (ms: number | null) => ms === null ? '—' : (ms / 1000).toLocaleString('es-ES', {maximumFractionDigits: 1});
const num = (f: Fila, k: string) => typeof f[k] === 'number' ? f[k] as number : null;

const filas: string[] = [];
for (const archivo of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(archivo, 'utf8'));
  const tareas: Fila[] = d.lote ? d.lote.recetas.map((r: Fila) => ({...r, ms_total: d.lote.ms_total})) : d.tareas;
  const serie = (k: string) => tareas.map(t => num(t, k)).filter((x): x is number => x !== null);
  const suma = (k: string) => serie(k).reduce((a, b) => a + b, 0);
  const nombre = d.flujo ? `A (${d.flujo === 'A' ? 'Python a mano' : d.flujo})` : `${d.modo}`;
  const total = d.lote ? [d.lote.ms_total] : serie('ms_total');
  filas.push(`| ${nombre} | ${tareas.length} | ${tareas.filter(t => t.ok).length}/${tareas.length} | ${seg(pct(total, 0.5))} | ${seg(pct(total, 0.95))} | ${seg(total.reduce((a, b) => a + b, 0))} | `
    + `${seg(pct(d.lote ? [d.lote.ms_primer_preview] : serie('ms_primer_preview'), 0.5))} | ${seg(pct(serie('ms_compilacion'), 0.5))} | ${seg(pct(serie('ms_guardado'), 0.5))} | `
    + `${d.lote ? d.lote.aperturas : suma('aperturas')} | ${d.lote ? d.lote.acciones : suma('acciones')} | ${suma('llamadas_llm')} | ${d.lote ? d.lote.aciertos : suma('aciertos')} |`);
}
console.log('| Flujo | Tareas | Éxito | Mediana (s) | p95 (s) | Total (s) | 1.ª preview mediana (s) | Compilación mediana (s) | Guardado mediana (s) | Aperturas del editor | Operaciones de editor | Llamadas LLM | Aciertos de caché |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const f of filas) console.log(f);
