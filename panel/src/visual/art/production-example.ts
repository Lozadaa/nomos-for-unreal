import type { Area, Stage } from '@/lib/tasks'

// Mismos ids, etapas, áreas y proveedores que productionRows (service/src/seed-data.ts).
const states: Stage[] = ['pendiente', 'pendiente', 'preparada', 'preparada', 'implementando', 'implementando', 'revisando', 'revisando', 'probando', 'integrando', 'cerrando', 'done']
const areas: Area[] = ['gameplay', 'ui', 'escenarios', 'assets', 'animacion', 'audio', 'qa', 'builds']
export const productionExample = states.map((state, i) => ({
  id: `seed-task-${String(i + 1).padStart(2, '0')}`, state, area: areas[i % 8],
  provider: i === 5 ? 'meshy' : i === 6 ? 'claude' : 'codex',
  blockedReason: i === 3 ? 'Elegir personaje base' : i === 10 ? 'No se pudo cerrar' : null,
  decisionId: i === 3 ? 'seed-decision-01' : null,
}))
export const productionRuns = ['codex', 'claude', 'meshy'].map((provider, i) => ({ id: `seed-run-0${i + 1}`, provider }))
