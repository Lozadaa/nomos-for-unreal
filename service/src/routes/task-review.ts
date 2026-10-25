import { body, json } from '../http.ts';
import { id, type Context } from './context.ts';
import { createGit } from '../adapters/git.ts';
import { requestReview } from '../review-request.ts';

export async function taskReview({db,req,res,url,dataDir}:Context):Promise<boolean> {
  const match=/^\/tasks\/([^/]+)\/review$/.exec(url.pathname);
  if(req.method!=='POST'||!match) return false;
  const taskId=id(match[1]),data=await body(req);
  if(data.implementerRunId!==undefined && typeof data.implementerRunId!=='string') throw new Error('invalid_review_target');
  const commandId=await requestReview(db,dataDir,createGit(),taskId,data.implementerRunId as string|undefined);
  json(res,202,{commandId});return true;
}
