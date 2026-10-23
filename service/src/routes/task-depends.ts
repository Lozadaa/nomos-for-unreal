import { body,json } from '../http.ts';
import { requireTask,listTasks } from '../repo/tasks.ts';
import { id,type Context } from './context.ts';
import { transaction } from '../repo/rows.ts';
import { appendEvent } from '../store.ts';

export async function taskDepends({db,req,res,url}:Context):Promise<boolean> {
  const match=/^\/tasks\/([^/]+)\/depends$/.exec(url.pathname);
  if(req.method!=='POST' || !match) return false;
  const taskId=id(match[1]),data=await body(req);
  if(!Array.isArray(data.dependsOn) || !data.dependsOn.every(v=>typeof v==='string'&&v.trim()))
    throw new Error('invalid_dependencies');
  const result=transaction(db,()=>{
    const task=requireTask(db,taskId);
    if(task.state!=='pendiente') throw new Error('invalid_transition');
    const dependencies=[...new Set(data.dependsOn as string[])];
    dependencies.forEach(dep=>requireTask(db,dep));
    const tasks=new Map(listTasks(db).map(t=>[t.id,t]));
    const reaches=(current:string,visited=new Set<string>()):boolean=>{
      if(current===taskId) return true;
      if(visited.has(current)) return false;
      visited.add(current);return tasks.get(current)!.dependsOn.some(dep=>reaches(dep,visited));
    };
    if(dependencies.some(dep=>reaches(dep))) throw new Error('invalid_dependencies');
    db.prepare('update tasks set depends_on=?,updated_at=? where id=?')
      .run(JSON.stringify(dependencies),new Date().toISOString(),taskId);
    appendEvent(db,'task.dependencies.changed',null,{taskId,dependsOn:dependencies});
    return requireTask(db,taskId);
  });
  json(res,200,result);return true;
}
