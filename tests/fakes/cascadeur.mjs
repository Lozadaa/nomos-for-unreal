// Cascadeur falso: `--run-python-code` con el job de Kratos. KRATOS_CSC_FAKE: ok (exporta), noflag (sale sin hacer nada),
// license (informe con la exportación FBX bloqueada por la licencia).
import { readFileSync, writeFileSync } from 'node:fs';

const mode = process.env.KRATOS_CSC_FAKE ?? 'ok', args = process.argv.slice(2);
const code = args[args.indexOf('--run-python-code') + 1] ?? '';
const job = code.match(/main\(r'([^']+)'\)/)?.[1];
if (mode === 'noflag' || !job) process.exit(0);
const spec = JSON.parse(readFileSync(job, 'utf8'));
if (mode === 'license') {
  writeFileSync(spec.report, JSON.stringify({ok: false, needs: 'license', steps: [{step: 'import', ok: true}, {step: 'export', ok: false,
    detail: 'FBX export is not available in your license'}], errors: ['export: FBX export is not available in your license']}));
} else {
  writeFileSync(spec.output_fbx, `fbx limpio de ${spec.input_fbx} (${spec.action})`);
  writeFileSync(spec.report, JSON.stringify({ok: true, needs: null, steps: [{step: 'import', ok: true}, {step: spec.action, ok: true},
    {step: 'export', ok: true}], errors: [], output: spec.output_fbx, settings: {up_axis: 'Z', mode: 'Binary', meshes: false}}));
}
