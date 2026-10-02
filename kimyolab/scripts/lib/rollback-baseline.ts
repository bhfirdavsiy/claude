// P2.8 — rollback baseline resolver. The rollback drill must roll back to the previous known-good MAINLINE
// deployment, never to an arbitrary parent commit (on a feature branch with 2+ commits, HEAD^1 is just the previous
// feature commit, which was never deployed).
//
//   1. KIMYOLAB_ROLLBACK_FROM (any git ref) always wins — it is still checked to be a commit on the mainline.
//   2. Otherwise start at merge-base(HEAD, mainline) — on a feature/PR branch that is the mainline state the branch
//      (or the CI merge commit) is based on. When HEAD itself is on the mainline (post-merge CI on main), the current
//      deployment IS that commit, so the walk starts at its FIRST PARENT (the previous mainline state).
//   3. Walk the mainline's first-parent chain from there and take the first commit whose deployment artefact differs
//      from the current one (a release that changes nothing to deploy is not a rollback target).
// Every candidate must be a commit and an ancestor of the mainline ref; the result is reported with its full SHA.
import {spawnSync} from 'node:child_process';

export interface BaselineResolution { commit:string; method:'explicit'|'merge-base'|'first-parent-of-mainline-head'; mainline:string; mergeBase:string|null; walked:string[] }

const git=(cwd:string,args:string[])=>{ const r=spawnSync('git',args,{cwd,encoding:'utf8'}); return {ok:r.status===0,out:(r.stdout??'').trim()}; };
const isCommit=(cwd:string,ref:string)=>{ const r=git(cwd,['rev-parse','--verify','--quiet',`${ref}^{commit}`]); return r.ok?r.out:null; };

/** The mainline ref: KIMYOLAB_MAINLINE_REF, else origin/<GITHUB_BASE_REF> in a PR, else origin/main, else main. */
export function mainlineRef(cwd:string,env:Record<string,string|undefined>=process.env):string|null{
  const candidates=[env.KIMYOLAB_MAINLINE_REF,env.GITHUB_BASE_REF?`origin/${env.GITHUB_BASE_REF}`:undefined,'origin/main','main'].filter(Boolean) as string[];
  return candidates.find(r=>isCommit(cwd,r))??null;
}

export function resolveRollbackBaseline(cwd:string,opts:{env?:Record<string,string|undefined>;differs:(commit:string)=>boolean;maxWalk?:number}):BaselineResolution{
  const env=opts.env??process.env;
  const fail=(code:string,message:string)=>Object.assign(new Error(message),{code});
  const mainline=mainlineRef(cwd,env);
  if(!mainline) throw fail('DEPLOY_ROLLBACK_SOURCE_MISSING','No mainline ref (origin/main or main) is available: fetch the full history (CI: actions/checkout fetch-depth: 0).');
  const mainlineSha=isCommit(cwd,mainline)!;
  const onMainline=(sha:string)=>git(cwd,['merge-base','--is-ancestor',sha,mainlineSha]).ok;
  if(env.KIMYOLAB_ROLLBACK_FROM){
    const sha=isCommit(cwd,env.KIMYOLAB_ROLLBACK_FROM);
    if(!sha) throw fail('DEPLOY_ROLLBACK_SOURCE_MISSING',`KIMYOLAB_ROLLBACK_FROM=${env.KIMYOLAB_ROLLBACK_FROM} is not a commit in this clone.`);
    if(!onMainline(sha)) throw fail('DEPLOY_ROLLBACK_SOURCE_INVALID',`KIMYOLAB_ROLLBACK_FROM=${env.KIMYOLAB_ROLLBACK_FROM} is not on the mainline (${mainline}).`);
    if(!opts.differs(sha)) throw fail('DEPLOY_ROLLBACK_SOURCE_INVALID',`KIMYOLAB_ROLLBACK_FROM=${env.KIMYOLAB_ROLLBACK_FROM} builds the same artefact as the current deployment.`);
    return {commit:sha,method:'explicit',mainline,mergeBase:null,walked:[sha]};
  }
  const head=isCommit(cwd,'HEAD');
  if(!head) throw fail('DEPLOY_ROLLBACK_SOURCE_MISSING','HEAD is not a commit.');
  const base=git(cwd,['merge-base','HEAD',mainlineSha]);
  if(!base.ok) throw fail('DEPLOY_ROLLBACK_SOURCE_MISSING',`HEAD and ${mainline} share no history: fetch the full history.`);
  let start=base.out; let method:BaselineResolution['method']='merge-base';
  if(start===head){
    // HEAD is a mainline commit (post-merge): the current deployment is HEAD itself → its first parent
    const parent=isCommit(cwd,`${head}^1`);
    if(!parent) throw fail('DEPLOY_ROLLBACK_SOURCE_MISSING','The mainline head has no parent: there is no previous release.');
    start=parent; method='first-parent-of-mainline-head';
  }
  const chain=git(cwd,['rev-list','--first-parent',`--max-count=${opts.maxWalk??30}`,start]);
  const walked:string[]=[];
  for(const sha of chain.out.split('\n').filter(Boolean)){
    walked.push(sha);
    if(!onMainline(sha)) continue;
    if(opts.differs(sha)) return {commit:sha,method,mainline,mergeBase:base.out,walked};
  }
  throw fail('DEPLOY_ROLLBACK_SOURCE_MISSING',`No mainline commit within ${opts.maxWalk??30} first-parent steps builds a different artefact.`);
}
