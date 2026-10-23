import { buildEditorTarget } from '../adapters/unreal-build.ts';
import { buildOf, type Executor } from './run.ts';

/** C++: compila el target de editor del proyecto (Build.bat, 20 min). */
export const cppCheck: Executor = async (ctx, {project}, deps) => {
  const build = await buildEditorTarget(project.uproject, buildOf(ctx, deps));
  return {result: build.ok ? 'passed' : 'failed', log: build.log, config: 'Development Editor Win64',
    summary: build.ok ? ['Compilación correcta'] : build.errors.length ? build.errors : ['La compilación falló sin líneas de error: revisa el log']};
};
