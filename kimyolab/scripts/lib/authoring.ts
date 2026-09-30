// Governed authoring (P1.9), build side. Derives AUTHORING TASKS from human decisions (and from machine flags a
// person must resolve), writes DRAFT skeletons for authors, previews a draft as a patch, and — only when a person
// runs `authoring:apply` outside CI/agent environments — applies a completed draft to ONE allowlisted content file.
//
// Nothing here chooses a chemistry value, a mapping or a release: drafts carry `null` placeholders the author fills.
// Applying a draft changes content hashes, so every earlier review of that content becomes STALE and needs a new
// human review. Candidate drafts are preview-only: a new reaction is authored by hand in a reviewed pull request.
import fs from 'node:fs';
import path from 'node:path';
import {buildWorkbenchModel,chemistryFilesOf,type WorkbenchModel} from './review-workbench.ts';
import {buildKbReports,CANDIDATE_REGISTER_FILE,REVIEW_REGISTER_FILE} from './chemistry-kb.ts';
import {parseReviewRegister,parseCandidateRegister} from '../../src/domain/chemistry/kb-review.ts';
import {parseSourceRegistry,provenanceOf,claimKindOf,ACCEPTABLE} from '../../src/domain/governance/source-policy.ts';
import {authoringTaskId,deriveTaskStatus,dedupeTasks,type AuthoringTask,type AuthoringAction,type AuthoringSurface} from '../../src/domain/governance/authoring-task.ts';
import {AUTOMATION_IDENTITY,assessmentItemHash,type AssessmentReviewRecord} from '../../src/domain/assessment/governance.ts';
import {releaseEntries,releaseRecords} from './release.ts';

export const DRAFT_DIR='authoring-drafts';
export const PATCH_DIR='authoring-output';
export const DRAFT_SCHEMA='kimyolab.authoring-draft.v1';
export const AUTHORING_REPORT='reports/authoring-status.json';
/** The ONLY files an authoring patch may touch: content-authoring roots. Registers, sources, code, CI and
 *  package manifests are never writable through authoring (they change in a reviewed pull request by a person). */
export const ALLOWED_FILES:readonly string[]=[
  'content-src/chemistry/reactions.json','content-src/chemistry/solubility.json','content-src/chemistry/hydrolysis.json',
  'content-src/chemistry/electrolysis.json','content-src/chemistry/condition-vocabulary.json',
  'content-src/assessment-items.json',
  'content-src/locales/uz-latn/chemistry-elements.json','content-src/locales/uz-latn/chemistry-species.json','content-src/locales/uz-latn/name-provenance.json',
];
/** Review / release / lifecycle bookkeeping is never authored through a draft. */
export const FORBIDDEN_FIELDS:readonly string[]=['review','reviewStatus','approvals','approved','lifecycle','lifecycleStatus','id','assertionId','nameKey'];
const DRAFT_FIELDS=['schema','status','canonical','taskId','action','surface','targetId','basisHash','author','file','select','current','set','context'];

const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const readOptional=(root:string,rel:string,fallback:any)=>fs.existsSync(path.join(root,rel))?readJson(root,rel):fallback;

// ------------------------------------------------------------------ what a task may edit

export interface Target { file:string; select:{path:string[];match?:Record<string,string>}; fields:string[]; draftable:boolean }

/** Where a target lives and which fields an author may set for the action. Deterministic; tooling picks no value. */
export function targetOf(surface:AuthoringSurface,targetId:string,action:AuthoringAction):Target|null{
  if(surface==='assessment'){
    const fields=action==='map-concept'?['conceptIds']:action==='map-outcome'?['outcomeIds']:['prompt','options','correctOptionId','explanation'];
    return {file:'content-src/assessment-items.json',select:{path:['items'],match:{id:targetId}},fields,draftable:true};
  }
  if(surface==='candidate') return {file:'content-src/chemistry/reactions.json',select:{path:[]},fields:[],draftable:false};
  if(surface!=='chemistry') return null;
  const i=targetId.indexOf(':'), kind=targetId.slice(0,i), rest=targetId.slice(i+1);
  const src=action==='add-source';
  switch(kind){
    case 'reaction': return {file:'content-src/chemistry/reactions.json',select:{path:[],match:{id:rest}},fields:src?['sourceRefs']:['reactants','products','reactionType','molecularEquation','direction'],draftable:true};
    case 'observation': return {file:'content-src/chemistry/reactions.json',select:{path:[],match:{id:rest}},fields:src?['sourceRefs']:['observations'],draftable:true};
    case 'condition': return {file:'content-src/chemistry/reactions.json',select:{path:[],match:{id:rest}},fields:src?['sourceRefs']:['conditions'],draftable:true};
    case 'condition-term': return {file:'content-src/chemistry/condition-vocabulary.json',select:{path:src?[]:['terms',rest]},fields:src?['sourceRefs']:['dimension','value'],draftable:true};
    case 'condition-context': return {file:'content-src/chemistry/condition-vocabulary.json',select:{path:src?[]:['contexts',rest]},fields:src?['sourceRefs']:['dimensions','description'],draftable:true};
    case 'dissociation': return {file:'content-src/chemistry/solubility.json',select:src?{path:[]}:{path:['dissociation'],match:{formula:rest}},fields:src?['sourceRefs']:['ions'],draftable:true};
    case 'insoluble': return {file:'content-src/chemistry/solubility.json',select:{path:[]},fields:src?['sourceRefs']:['insoluble'],draftable:true};
    case 'hydrolysis': return {file:'content-src/chemistry/hydrolysis.json',select:{path:['records'],match:{salt:rest}},fields:src?['sourceRefs']:['medium','explanation'],draftable:true};
    case 'indicator':{ const [,medium]=rest.split(':'); return {file:'content-src/chemistry/hydrolysis.json',select:{path:src?['indicator']:['indicator','colors']},fields:src?['sourceRefs']:[String(medium)],draftable:true}; }
    case 'electrolysis':{ const [electrolyte,phase,electrode]=rest.split('|'); return {file:'content-src/chemistry/electrolysis.json',select:{path:['records'],match:{electrolyte:String(electrolyte),phase:String(phase),electrode:String(electrode)}},fields:src?['sourceRefs']:['cathode','anode'],draftable:true}; }
    case 'species-name': return src?{file:'content-src/locales/uz-latn/name-provenance.json',select:{path:['entries'],match:{assertionId:targetId}},fields:['sourceRef'],draftable:true}:{file:'content-src/locales/uz-latn/chemistry-species.json',select:{path:['names']},fields:[rest],draftable:true};
    case 'element-name': return src?{file:'content-src/locales/uz-latn/name-provenance.json',select:{path:['entries'],match:{assertionId:targetId}},fields:['sourceRef'],draftable:true}:{file:'content-src/locales/uz-latn/chemistry-elements.json',select:{path:['names']},fields:[rest],draftable:true};
    default: return null;
  }
}

// ------------------------------------------------------------------ task derivation

const draftPath=(root:string,taskId:string)=>path.join(root,DRAFT_DIR,`${taskId}.json`);

export function deriveAuthoringTasks(root:string,model:WorkbenchModel=buildWorkbenchModel(root)):AuthoringTask[]{
  const tasks:AuthoringTask[]=[];
  const chem=new Map(model.chemistry.map(a=>[a.id,a]));
  const items=new Map(model.assessment.map(a=>[a.itemId,a]));
  const hasDraft=(id:string)=>fs.existsSync(draftPath(root,id));
  const make=(t:Omit<AuthoringTask,'id'|'status'>&{supersededOnBasis:boolean;decisionOnCurrent:'closes'|'reopens'|null}):void=>{
    const id=authoringTaskId(t.surface,t.targetId,t.action,t.basisHash);
    const {supersededOnBasis,decisionOnCurrent,...rest}=t;
    tasks.push({id,...rest,status:deriveTaskStatus({basisHash:t.basisHash,currentHash:t.currentHash,supersededOnBasis,decisionOnCurrent,draftExists:hasDraft(id)})});
  };
  // chemistry decisions that send content back
  const chemRecords=parseReviewRegister(readOptional(root,REVIEW_REGISTER_FILE,{schema:'kimyolab.chemistry-reviews.v1',records:[]})).records;
  for(const r of chemRecords) if(r.decision!=='approve'){
    const a=chem.get(r.assertionId);
    const later=chemRecords.filter(x=>x.assertionId===r.assertionId&&Date.parse(x.reviewedAt)>Date.parse(r.reviewedAt));
    const onCurrent=a?later.filter(x=>x.assertionHash===a.currentHash).at(-1):undefined;
    make({sourceDecisionId:`chemistry:${r.assertionId}@${r.reviewedAt}`,surface:'chemistry',targetId:r.assertionId,action:'correct',basisHash:r.assertionHash,currentHash:a?.currentHash??null,
      affectedFiles:chemistryFilesOf(r.assertionId),affectedActivities:a?.affectedActivities??[],reviewerDecision:r.decision,...(r.comment?{reviewerComment:r.comment}:{}),priority:a?.priority??'E',
      context:{claim:a?.claim??null,category:a?.category??null},
      supersededOnBasis:later.some(x=>x.assertionHash===r.assertionHash),decisionOnCurrent:onCurrent?(onCurrent.decision==='approve'?'closes':'reopens'):null});
  }
  // assessment decisions (per role) and outcome-mapping decisions
  const assessRecords:AssessmentReviewRecord[]=readOptional(root,'content-src/assessment-reviews.json',{records:[]}).records??[];
  const bank=readJson(root,'content-src/assessment-items.json').items as any[];
  for(const r of assessRecords){
    const item=items.get(r.itemId); const raw=bank.find(i=>i.id===r.itemId);
    const current=raw?assessmentItemHash(raw):null;
    const later=assessRecords.filter(x=>x.itemId===r.itemId&&x.role===r.role&&x.reviewedAt>r.reviewedAt);
    const onCurrent=later.filter(x=>x.itemHash===current).at(-1);
    const base={surface:'assessment' as const,targetId:r.itemId,basisHash:r.itemHash,currentHash:current,affectedFiles:['content-src/assessment-items.json'],affectedActivities:[] as string[],priority:'B' as const,supersededOnBasis:later.some(x=>x.itemHash===r.itemHash),
      context:{questionStem:item?.prompt??null,currentConcepts:item?.concepts??[],currentOutcomes:item?.outcomes??[],role:r.role}};
    if(r.decision!=='approved') make({...base,sourceDecisionId:`assessment:${r.itemId}:${r.role}@${r.reviewedAt}`,action:'correct',reviewerDecision:r.decision,...(r.comment?{reviewerComment:r.comment}:{}),decisionOnCurrent:onCurrent?(onCurrent.decision==='approved'?'closes':'reopens'):null});
    if(r.role==='didactic'&&(r.outcomeDecision==='reject'||r.outcomeDecision==='change_required')) make({...base,sourceDecisionId:`assessment:${r.itemId}:outcome@${r.reviewedAt}`,action:'map-outcome',reviewerDecision:`outcome:${r.outcomeDecision}`,...(r.comment?{reviewerComment:r.comment}:{}),decisionOnCurrent:onCurrent?(onCurrent.outcomeDecision==='confirm'?'closes':'reopens'):null});
  }
  // machine flag MAPPING_REVIEW_REQUIRED: a task is prepared, the decision stays with the didactic reviewer
  for(const a of model.assessment) if(a.flags.length){
    const confirmed=assessRecords.some(r=>r.itemId===a.itemId&&r.role==='didactic'&&r.itemHash===a.itemHash&&r.outcomeDecision==='confirm');
    const didactic=assessRecords.filter(r=>r.itemId===a.itemId&&r.role==='didactic'&&r.itemHash===a.itemHash).at(-1);
    make({sourceDecisionId:`flag:MAPPING_REVIEW_REQUIRED:${a.itemId}`,surface:'assessment',targetId:a.itemId,action:'map-concept',basisHash:a.itemHash,currentHash:a.itemHash,affectedFiles:['content-src/assessment-items.json'],affectedActivities:[],
      reviewerDecision:didactic?`${didactic.decision}/outcome:${didactic.outcomeDecision??'-'}`:null,priority:'B',
      context:{questionStem:a.prompt,currentConcepts:a.concepts,currentOutcomes:a.outcomes,flags:a.flags,recommendedAction:'PLACEHOLDER — the didactic reviewer decides; tooling recommends no concept'},
      supersededOnBasis:false,decisionOnCurrent:confirmed?'closes':null});
  }
  // candidate triage: accept_for_authoring → a candidate DRAFT task (never KB truth)
  const candRecords=parseCandidateRegister(readOptional(root,CANDIDATE_REGISTER_FILE,{schema:'kimyolab.chemistry-candidate-reviews.v1',records:[]})).records;
  for(const r of candRecords) if(r.decision==='accept_for_authoring'){
    const c=model.candidates.find(x=>x.candidateId===r.candidateId);
    const later=candRecords.filter(x=>x.candidateId===r.candidateId&&Date.parse(x.reviewedAt)>Date.parse(r.reviewedAt));
    make({sourceDecisionId:`candidate:${r.candidateId}@${r.reviewedAt}`,surface:'candidate',targetId:r.candidateId,action:'author-candidate',basisHash:r.candidateHash,currentHash:c?.candidateHash??null,
      affectedFiles:['content-src/chemistry/reactions.json'],affectedActivities:c?.activitiesAffected??[],reviewerDecision:r.decision,...(r.comment?{reviewerComment:r.comment}:{}),priority:'B',
      context:{pair:c?.pair??null,kind:c?.candidate?.kind??null,badge:'CANDIDATE — NOT PART OF CANONICAL KB'},
      supersededOnBasis:later.some(x=>x.candidateHash===r.candidateHash),decisionOnCurrent:null});
  }
  // provenance: an assertion without acceptable provenance can never be approved → add-source
  const kb=buildKbReports(root);
  const sources=parseSourceRegistry(kb.kb.sourceRegistryRaw).registry;
  for(const a of kb.assertions){
    const p=provenanceOf(a.sourceRefs,sources,claimKindOf(a.category));
    if(p.acceptable) continue;
    const w=chem.get(a.id);
    make({sourceDecisionId:`policy:SOURCE_NOT_ACCEPTABLE:${a.id}`,surface:'chemistry',targetId:a.id,action:'add-source',basisHash:a.hash,currentHash:a.hash,affectedFiles:targetOf('chemistry',a.id,'add-source')?.file?[targetOf('chemistry',a.id,'add-source')!.file]:chemistryFilesOf(a.id),affectedActivities:a.affectedActivities,reviewerDecision:null,priority:w?.priority??'E',
      context:{claimKind:p.kind,currentSources:a.sourceRefs,currentCategories:p.categories,acceptableCategories:ACCEPTABLE[p.kind]},supersededOnBasis:false,decisionOnCurrent:null});
  }
  // release: a content owner's CHANGE_REQUIRED on the current basis → prepare-release
  const rel=releaseRecords(root).records;
  const entries=new Map(releaseEntries(root).map(e=>[e.activityId,e]));
  for(const r of rel) if(r.decision==='CHANGE_REQUIRED'){
    const e=entries.get(r.activityId);
    const later=rel.filter(x=>x.activityId===r.activityId&&Date.parse(x.decidedAt)>Date.parse(r.decidedAt));
    const onCurrent=e?later.filter(x=>x.basisHash===e.basisHash).at(-1):undefined;
    make({sourceDecisionId:`release:${r.activityId}@${r.decidedAt}`,surface:'activity',targetId:r.activityId,action:'prepare-release',basisHash:r.basisHash,currentHash:e?.basisHash??null,affectedFiles:['content-src/practice-activities.json'],affectedActivities:[r.activityId],reviewerDecision:r.decision,...(r.comment?{reviewerComment:r.comment}:{}),priority:'C',
      context:{eligibility:e?.eligibility??null},supersededOnBasis:later.some(x=>x.basisHash===r.basisHash),decisionOnCurrent:onCurrent?(onCurrent.decision==='CHANGE_REQUIRED'?'reopens':'closes'):null});
  }
  return dedupeTasks(tasks);
}

// ------------------------------------------------------------------ drafts, preview, apply

/** A draft skeleton for a task: the current values and a `null` placeholder per editable field. */
export function draftFor(root:string,task:AuthoringTask){
  const t=targetOf(task.surface,task.targetId,task.action);
  if(!t) throw new Error(`AUTHORING_TARGET_UNKNOWN:${task.targetId}`);
  if(task.surface==='candidate'){
    const m=buildWorkbenchModel(root).candidates.find(c=>c.candidateId===task.targetId);
    const proposed=(value:unknown)=>({value,status:'PROPOSED'});
    const kind=m?.candidate?.kind;
    return {schema:DRAFT_SCHEMA,status:'DRAFT',canonical:false,taskId:task.id,action:task.action,surface:task.surface,targetId:task.targetId,basisHash:task.basisHash,author:null,file:t.file,select:t.select,current:{},set:{},
      context:{notice:'CANDIDATE DRAFT — NOT CANONICAL CHEMISTRY. Preview only: author the record by hand in a reviewed pull request; it is then reviewed as a chemistry assertion.',
        candidateId:task.targetId,kind:kind??null,reactants:m?.reagents??[],
        proposedProducts:proposed(kind==='no-reaction-candidate'?'none (no-reaction record)':(m?.candidate?.swaps??[]).map((s:any)=>s.formula).filter(Boolean)),
        proposedConditions:proposed('solution-mixing (room temperature, dilute, no ignition)'),proposedObservation:proposed(null),sourceRefs:proposed([]),reviewRequired:true}};
  }
  const current=resolveTarget(readJson(root,t.file),t.select);
  return {schema:DRAFT_SCHEMA,status:'DRAFT',canonical:false,taskId:task.id,action:task.action,surface:task.surface,targetId:task.targetId,basisHash:task.basisHash,author:null,file:t.file,select:t.select,
    current:Object.fromEntries(t.fields.map(f=>[f,current?.[f]??null])),
    set:Object.fromEntries(t.fields.map(f=>[f,null])),
    context:{...task.context,reviewerDecision:task.reviewerDecision,reviewerComment:task.reviewerComment??null,instructions:'Fill `author` (a person) and the values in `set` you change (remove the others). Then: npm run authoring:preview -- <this file>. Only a person applies it (npm run authoring:apply) — every review of this content then becomes STALE and a new review is required.'}};
}

function resolveTarget(doc:any,select:{path:string[];match?:Record<string,string>}):any{
  let node=doc;
  for(const k of select.path){ if(node===null||typeof node!=='object'||!Object.prototype.hasOwnProperty.call(node,k)) return undefined; node=node[k]; }
  if(!select.match) return node&&typeof node==='object'&&!Array.isArray(node)?node:undefined;
  if(!Array.isArray(node)) return undefined;
  const hits=node.filter((x:any)=>x&&Object.entries(select.match!).every(([k,v])=>String(x[k])===v));
  return hits.length===1?hits[0]:undefined;
}

/** A content path an authoring patch may write: relative, normalized, inside the repo, allowlisted, not a link. */
export function safeContentPath(root:string,file:unknown):{ok:true;abs:string}|{ok:false;issue:string}{
  if(typeof file!=='string'||!file||file.includes('\0')) return {ok:false,issue:'AUTHORING_PATH_INVALID'};
  if(path.isAbsolute(file)||file.includes('\\')||/^[a-zA-Z]:/.test(file)) return {ok:false,issue:`AUTHORING_PATH_NOT_RELATIVE:${file}`};
  if(file.split('/').some(s=>s==='..'||s==='.'||s==='')||path.posix.normalize(file)!==file) return {ok:false,issue:`AUTHORING_PATH_TRAVERSAL:${file}`};
  if(!ALLOWED_FILES.includes(file)) return {ok:false,issue:`AUTHORING_PATH_NOT_ALLOWED:${file}`};
  const abs=path.resolve(root,file);
  if(!abs.startsWith(path.resolve(root)+path.sep)) return {ok:false,issue:`AUTHORING_PATH_TRAVERSAL:${file}`};
  if(!fs.existsSync(abs)) return {ok:false,issue:`AUTHORING_TARGET_FILE_MISSING:${file}`};
  if(fs.lstatSync(abs).isSymbolicLink()) return {ok:false,issue:`AUTHORING_PATH_SYMLINK:${file}`};
  return {ok:true,abs};
}

export interface Preview { ok:boolean; issues:string[]; taskId:string|null; patch:{file:string;targetId:string;changes:Array<{field:string;before:unknown;after:unknown}>}|null; applicable:boolean }

/** authoring:preview — validates a draft against the CURRENT content and returns the patch. Writes nothing canonical. */
export function previewDraft(root:string,draft:any,tasks:AuthoringTask[]=deriveAuthoringTasks(root)):Preview{
  const issues:string[]=[];
  const fail=(...i:string[])=>({ok:false,issues:[...issues,...i],taskId:draft?.taskId??null,patch:null,applicable:false});
  if(!draft||draft.schema!==DRAFT_SCHEMA) return fail('DRAFT_SCHEMA_INVALID');
  for(const k of Object.keys(draft).filter(k=>!DRAFT_FIELDS.includes(k))) issues.push(`DRAFT_FIELD_NOT_ALLOWED:${k}`);
  if(draft.status!=='DRAFT'||draft.canonical!==false) issues.push('DRAFT_STATUS_INVALID');
  const task=tasks.find(t=>t.id===draft.taskId);
  if(!task) return fail(`DRAFT_TASK_UNKNOWN:${draft.taskId}`);
  if(task.status!=='OPEN'&&task.status!=='IN_PROGRESS') issues.push(`DRAFT_TASK_NOT_OPEN:${task.status}`);
  if(draft.basisHash!==task.basisHash||task.currentHash!==task.basisHash) issues.push(`DRAFT_STALE:${task.targetId}`);
  for(const k of ['action','surface','targetId'] as const) if(draft[k]!==task[k]) issues.push(`DRAFT_TASK_MISMATCH:${k}`);
  if(typeof draft.author!=='string'||!draft.author.trim()) issues.push('DRAFT_AUTHOR_MISSING');
  else if(AUTOMATION_IDENTITY.test(draft.author)) issues.push('DRAFT_AUTHOR_NOT_HUMAN');
  const t=targetOf(task.surface,task.targetId,task.action);
  if(!t) return fail(`AUTHORING_TARGET_UNKNOWN:${task.targetId}`);
  const safe=safeContentPath(root,draft.file);
  if(!safe.ok) return fail(safe.issue);
  if(draft.file!==t.file) issues.push(`DRAFT_FILE_MISMATCH:${draft.file}`);
  if(JSON.stringify(draft.select)!==JSON.stringify(t.select)) issues.push('DRAFT_SELECT_MISMATCH');
  const set=draft.set&&typeof draft.set==='object'&&!Array.isArray(draft.set)?draft.set:null;
  if(!set) issues.push('DRAFT_SET_INVALID');
  const changes:Array<{field:string;before:unknown;after:unknown}>=[];
  if(set){
    const target=resolveTarget(readJson(root,t.file),t.select);
    if(t.draftable&&!target) issues.push(`AUTHORING_TARGET_NOT_FOUND:${task.targetId}`);
    for(const [f,v] of Object.entries(set)){
      if(FORBIDDEN_FIELDS.includes(f)) issues.push(`DRAFT_FIELD_FORBIDDEN:${f}`);
      else if(!t.fields.includes(f)) issues.push(`DRAFT_FIELD_NOT_EDITABLE:${f}`);
      if(v===null||v===undefined) issues.push(`DRAFT_INCOMPLETE:${f}`);
      changes.push({field:f,before:target?.[f]??null,after:v});
    }
    if(t.draftable&&!Object.keys(set).length) issues.push('DRAFT_EMPTY');
    if(task.action==='add-source'){
      const reg=parseSourceRegistry(readJson(root,'content-src/source-registry.json')).registry;
      for(const c of changes){ const ids=(Array.isArray(c.after)?c.after:[c.after]).map((x:any)=>typeof x==='string'?x:x?.id).filter(Boolean); for(const id of ids) if(!reg.byId.has(id)) issues.push(`DRAFT_SOURCE_UNREGISTERED:${id}`); }
    }
  }
  const applicable=t.draftable&&task.surface!=='candidate';
  if(!t.draftable&&task.surface!=='candidate') issues.push('DRAFT_UNSUPPORTED_TARGET');
  return {ok:issues.length===0,issues:[...new Set(issues)],taskId:task.id,patch:{file:t.file,targetId:task.targetId,changes},applicable};
}

/**
 * authoring:apply — writes ONE validated draft into ONE allowlisted content file. The CLI refuses to call this in
 * CI or agent environments; this function refuses candidate drafts and anything the preview refuses.
 */
export function applyDraft(root:string,draft:any){
  const p=previewDraft(root,draft);
  if(!p.ok) return {applied:false,issues:p.issues};
  if(!p.applicable) return {applied:false,issues:['CANDIDATE_DRAFT_NOT_APPLICABLE: author the record by hand in a reviewed pull request']};
  const t=targetOf(draft.surface,draft.targetId,draft.action)!;
  const safe=safeContentPath(root,t.file);
  if(!safe.ok) return {applied:false,issues:[safe.issue]};
  const doc=readJson(root,t.file);
  const target=resolveTarget(doc,t.select);
  for(const c of p.patch!.changes) target[c.field]=c.after;
  fs.writeFileSync(safe.abs,`${JSON.stringify(doc,null,2)}\n`,'utf8');
  return {applied:true,issues:[] as string[],file:t.file,changes:p.patch!.changes.map(c=>c.field)};
}

export function authoringStatus(tasks:AuthoringTask[]){
  const count=(xs:AuthoringTask[])=>Object.fromEntries(['OPEN','IN_PROGRESS','READY_FOR_REVIEW','SUPERSEDED','CLOSED'].map(s=>[s,xs.filter(t=>t.status===s).length]));
  const group=(key:(t:AuthoringTask)=>string[])=>{ const m=new Map<string,AuthoringTask[]>(); for(const t of tasks) for(const k of key(t)) m.set(k,[...(m.get(k)??[]),t]); return Object.fromEntries([...m.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,xs])=>[k,count(xs)])); };
  return {
    schema:'kimyolab.authoring-status.v1',
    semantics:'Authoring tasks are DERIVED from human decisions (and machine flags a person must resolve). A task is work for an author — never a content change, an approval or a release. Content changes only through a person running authoring:apply; the new hash then needs a new human review.',
    totals:{tasks:tasks.length,...count(tasks)},
    bySurface:group(t=>[t.surface]),byAction:group(t=>[t.action]),byPriority:group(t=>[t.priority]),byAffectedActivity:group(t=>t.affectedActivities.length?t.affectedActivities:['(none)']),
    canonicalContentMutated:false,
    tasks,
  };
}
