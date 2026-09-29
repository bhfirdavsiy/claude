import type {LearningUnitProgress,LearningUnitProgressStatus} from './types.ts';
import {PROGRESS_SCHEMA_VERSION} from './types.ts';

// Progress record migrations (P0.6). Every load goes through
//   load → validate → version check → migrate if possible → otherwise isolate → return
// and the registry below is the only way a record changes format.

export type ProgressMigration=(record:Record<string,unknown>)=>Record<string,unknown>;

const STATUSES=new Set<LearningUnitProgressStatus>(['not_started','in_progress','practice_complete','assessment_complete','mastered','needs_review']);
/** Records written before `schemaVersion` existed are treated as this version. */
export const LEGACY_PROGRESS_SCHEMA_VERSION='0';

function object(v:unknown):v is Record<string,unknown>{return typeof v==='object'&&v!==null&&!Array.isArray(v);}
function text(v:unknown):v is string{return typeof v==='string'&&v.length>0;}

function sanitizeStates(value:unknown):Record<string,string>{
  if(!object(value)) return {};
  const out:Record<string,string>={};
  for(const [k,v] of Object.entries(value)) if(typeof v==='string') out[k]=v;
  return out;
}

export const progressMigrations:Record<string,ProgressMigration>={
  // Pre-schema records: `complete` was the only terminal status.
  '0→1.0.0':(src)=>({
    ...src,
    status:src.status==='complete'?'practice_complete':(src.status??'not_started'),
    activityStates:sanitizeStates(src.activityStates),
    schemaVersion:'1.0.0',
  }),
  // 1.0.0 stored the *content* schema version in `schemaVersion`; 2.0.0 separates it.
  '1.0.0→2.0.0':(src)=>({
    learningUnitId:src.learningUnitId,
    status:src.status==='complete'?'practice_complete':src.status,
    activityStates:sanitizeStates(src.activityStates),
    lastVisitedAt:src.lastVisitedAt,
    contentVersion:src.contentVersion,
    schemaVersion:'2.0.0',
    contentSchemaVersion:'1.0.0',
  }),
};

export class ProgressMigrationError extends Error {
  code:string;
  constructor(code:string,detail=''){super(detail?`${code}:${detail}`:code);this.name='ProgressMigrationError';this.code=code;}
}

/** Returns the ordered list of registry keys that lead from `from` to `to`, or undefined if no path exists. */
export function resolveMigrationPath(from:string,to:string,registry:Record<string,ProgressMigration>=progressMigrations):string[]|undefined{
  if(from===to) return [];
  const edges=new Map<string,string[]>();
  for(const key of Object.keys(registry)){
    const [a,b]=key.split('→');
    if(!a||!b) continue;
    edges.set(a,[...(edges.get(a)??[]),b]);
  }
  const queue:Array<{version:string;path:string[]}>=[{version:from,path:[]}];
  const seen=new Set([from]);
  while(queue.length){
    const {version,path}=queue.shift()!;
    for(const next of edges.get(version)??[]){
      const step=[...path,`${version}→${next}`];
      if(next===to) return step;
      if(!seen.has(next)){seen.add(next);queue.push({version:next,path:step});}
    }
  }
  return undefined;
}

export function validateProgressRecord(input:unknown,expectedSchemaVersion:string=PROGRESS_SCHEMA_VERSION):LearningUnitProgress{
  if(!object(input)) throw new ProgressMigrationError('PROGRESS_RECORD_INVALID','record required');
  for(const key of ['learningUnitId','contentVersion','lastVisitedAt','schemaVersion']) if(!text(input[key])) throw new ProgressMigrationError('PROGRESS_RECORD_INVALID',`${key} required`);
  if(input.schemaVersion!==expectedSchemaVersion) throw new ProgressMigrationError('PROGRESS_SCHEMA_VERSION_MISMATCH',String(input.schemaVersion));
  if(!STATUSES.has(input.status as LearningUnitProgressStatus)) throw new ProgressMigrationError('PROGRESS_MIGRATION_UNSUPPORTED_STATUS',String(input.status));
  if(!object(input.activityStates)||Object.values(input.activityStates).some(v=>typeof v!=='string')) throw new ProgressMigrationError('PROGRESS_RECORD_INVALID','activityStates');
  if(input.contentSchemaVersion!==undefined&&!text(input.contentSchemaVersion)) throw new ProgressMigrationError('PROGRESS_RECORD_INVALID','contentSchemaVersion');
  return input as unknown as LearningUnitProgress;
}

export type ProgressLoadResult =
  | {status:'current';record:LearningUnitProgress}
  | {status:'migrated';record:LearningUnitProgress;from:string;steps:string[]}
  | {status:'isolated';code:string;reason:string};

/** load → validate → version check → migrate if possible → otherwise isolate. Never throws. */
export function loadProgressRecord(input:unknown,options:{targetSchemaVersion?:string;registry?:Record<string,ProgressMigration>}={}):ProgressLoadResult{
  const target=options.targetSchemaVersion??PROGRESS_SCHEMA_VERSION;
  const registry=options.registry??progressMigrations;
  try{
    if(!object(input)) throw new ProgressMigrationError('PROGRESS_RECORD_INVALID','record required');
    if(!text(input.learningUnitId)||!text(input.contentVersion)||!text(input.lastVisitedAt)) throw new ProgressMigrationError('PROGRESS_RECORD_INVALID','identity/version fields required');
    const from=input.schemaVersion===undefined?LEGACY_PROGRESS_SCHEMA_VERSION:String(input.schemaVersion);
    if(from===target) return {status:'current',record:validateProgressRecord(input,target)};
    const steps=resolveMigrationPath(from,target,registry);
    if(!steps) throw new ProgressMigrationError('PROGRESS_MIGRATION_PATH_MISSING',`${from}→${target}`);
    let record:Record<string,unknown>={...input};
    for(const step of steps) record=registry[step]!(record);
    return {status:'migrated',record:validateProgressRecord(record,target),from,steps};
  }catch(error){
    const code=error instanceof ProgressMigrationError?error.code:'PROGRESS_MIGRATION_FAILED';
    return {status:'isolated',code,reason:error instanceof Error?error.message:String(error)};
  }
}
