// P2.4 — governed content operations (ADR-P2-005): theory packet import/apply, source intake apply, and the theory
// authoring status report. NOTHING here writes chemistry: it moves text a person wrote, after the reviews a person gave,
// through checks a machine can make. Every write is deterministic and fail-closed.
//
//   working drafts   authoring-drafts/theory/<learningUnitId>.json   (packets; never packed, never canonical)
//   canonical theory content-src/theory-structured/<theoryId>.json  (only via applyTheoryPacket: all blocks APPROVED)
//   source intake    content-src/source-intake/<sourceId>.json       (submissions; never cited until applied)
//   source registry  content-src/source-registry.json               (only via applySourceIntake: human-APPROVED)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createContentAjv} from './content-schema.ts';
import {loadSourceRegistry,STRUCTURED_THEORY_DIR,collectStructuredTheory} from './structured-theory.ts';
import {parseSourceRegistry,canonicalSourceIssues} from '../../src/domain/governance/source-policy.ts';
import {loadGovernedSourceRegistry,sourceReadiness} from './source-registry.ts';
import {validateStructuredTheory,theoryReviewState,blockGovernance,contentBlocks} from '../../src/domain/theory/structured-theory.ts';
import {packetToEntry,THEORY_PACKET_SCHEMA} from '../../src/authoring/authoring-packet.ts';
import {SOURCE_INTAKE_DIR,sourceGovernance,detectSourceDuplicates,validateSourceIntake} from '../../src/authoring/source-intake.ts';

export const THEORY_DRAFT_DIR='authoring-drafts/theory';
export const THEORY_STATUS_REPORT='reports/theory-authoring-status.json';
const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
// the JSON Schemas are code (versioned with these checks), not content: resolve them next to this module
const SCHEMA_DIR=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../schemas');
let ajv:any=null; const schema=(name:string)=>(ajv??=createContentAjv(SCHEMA_DIR)).getSchema(name)!;
const sortKeys=(v:any):any=>Array.isArray(v)?v.map(sortKeys):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sortKeys(v[k])])):v;
/** Deterministic JSON: object keys sorted, array order (the author's order) kept exactly. */
export const canonicalJson=(v:unknown)=>`${JSON.stringify(sortKeys(v),null,2)}\n`;

function theoryLinks(root:string){
  const theories=new Set((readJson(root,'content-src/theory-activities.json') as any[]).map(t=>t.id));
  const links=readJson(root,'content-src/mapping-links.json') as any[];
  return {known:(theoryId:string,lu:string)=>theories.has(theoryId)&&links.some(l=>l.theoryActivityId===theoryId&&l.learningUnitId===lu)};
}

export interface TheoryCheck { ok:boolean; entry:any|null; issues:string[]; review:string|null }
/** Every check the governed apply makes, without writing anything. */
export function checkTheoryPacket(root:string,packet:any):TheoryCheck{
  const {entry,issues:packetIssues}=packetToEntry(packet);
  const issues:string[]=[...packetIssues];
  if(!entry) return {ok:false,entry:null,issues,review:null};
  if(!theoryLinks(root).known(entry.theoryId,entry.learningUnitId)) issues.push(`THEORY_UNIT_UNKNOWN:${entry.theoryId}/${entry.learningUnitId}`);
  const validate=schema('structured-theory.schema.json');
  if(!validate(entry)) issues.push(`SCHEMA:${(validate.errors??[]).map((e:any)=>`${e.instancePath} ${e.message}`).join('; ')}`);
  const v=validateStructuredTheory(entry,loadSourceRegistry(root));
  // source gate (P2.4 closeout A1): the contract's category check is replaced by the canonical-authoring taxonomy —
  // SOURCE_UNREGISTERED / SOURCE_CATEGORY_NOT_ACCEPTABLE / SOURCE_NOT_HUMAN_ACCEPTED, per block and source
  for(const i of v.issues) if(i.code!=='SOURCE_UNREGISTERED'&&i.code!=='SOURCE_NOT_ACCEPTABLE') issues.push(`${i.code}:${i.where}`);
  const {registry}=loadGovernedSourceRegistry(root);
  for(const {name,block} of contentBlocks(entry)) for(const i of canonicalSourceIssues(Array.isArray(block?.sourceRefs)?block.sourceRefs:[],registry)) issues.push(`${i.code}:${name}:${i.ref}`);
  const review=theoryReviewState(entry);
  if(review!=='APPROVED') issues.push(`NOT_APPROVED:${review}`);
  return {ok:!issues.length,entry,issues:[...new Set(issues)],review};
}

/** Governed apply: only a fully dual-reviewed, complete, sourced packet becomes canonical. Returns what it wrote. */
export function applyTheoryPacket(root:string,packet:any):{applied:boolean;file:string|null;issues:string[]}{
  const check=checkTheoryPacket(root,packet);
  if(!check.ok) return {applied:false,file:null,issues:check.issues};
  const file=`${STRUCTURED_THEORY_DIR}/${check.entry.theoryId}.json`;
  fs.mkdirSync(path.join(root,STRUCTURED_THEORY_DIR),{recursive:true});
  fs.writeFileSync(path.join(root,file),canonicalJson(check.entry),'utf8');
  return {applied:true,file,issues:[]};
}

/** Import a workbench packet as a NON-canonical working draft (any state; structure and unit identity checked). */
export function importTheoryDraft(root:string,packet:any):{imported:boolean;file:string|null;issues:string[]}{
  const {entry,issues}=packetToEntry(packet);
  const hard=issues.filter(i=>i!=='PACKET_VERSION_MISSING');
  if(!entry||hard.length) return {imported:false,file:null,issues};
  if(!theoryLinks(root).known(entry.theoryId,entry.learningUnitId)) return {imported:false,file:null,issues:[`THEORY_UNIT_UNKNOWN:${entry.theoryId}/${entry.learningUnitId}`]};
  const file=`${THEORY_DRAFT_DIR}/${entry.learningUnitId}.json`;
  fs.mkdirSync(path.join(root,THEORY_DRAFT_DIR),{recursive:true});
  fs.writeFileSync(path.join(root,file),canonicalJson(packet),'utf8');
  return {imported:true,file,issues};
}

export function readTheoryDrafts(root:string):any[]{
  const dir=path.join(root,THEORY_DRAFT_DIR);
  if(!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort().map(f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')));
}

// ------------------------------------------------------------------------------------------------ source operations
export function readSourceIntake(root:string):Array<{file:string;entry:any}>{
  const dir=path.join(root,SOURCE_INTAKE_DIR);
  if(!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort().map(f=>({file:`${SOURCE_INTAKE_DIR}/${f}`,entry:JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'))}));
}

/** The source-review queue: every intake entry with its derived state, issues and duplicates. */
export function sourceReviewQueue(root:string){
  const registryRaw=readJson(root,'content-src/source-registry.json');
  const intake=readSourceIntake(root);
  const dups=detectSourceDuplicates(intake.map(i=>i.entry),registryRaw.sources);
  return intake.map(({file,entry})=>{
    const g=sourceGovernance(entry);
    const validate=schema('source-intake.schema.json');
    const shape=validate(entry)?[]:[`JSON_SCHEMA:${(validate.errors??[]).map((e:any)=>`${e.instancePath} ${e.message}`).join('; ')}`];
    if(path.basename(file)!==`${entry.sourceId}.json`) shape.push('FILE_NAME_MUST_BE_SOURCE_ID');
    return {file,sourceId:entry.sourceId,category:entry.category,title:entry.title,state:shape.length&&g.state==='APPROVED'?'READY_FOR_REVIEW':g.state,currentHash:g.currentHash,
      decision:g.decision,staleDecisions:g.stale.length,issues:[...shape,...validateSourceIntake(entry).map(i=>`${i.code}:${i.where}`)],duplicates:dups.get(entry.sourceId)??[]};
  });
}

/** Registry file format: top-level pretty, one source per line (the existing reviewed layout). */
export function formatSourceRegistry(raw:any):string{
  const line=(s:any)=>`{${Object.entries(s).map(([k,v])=>`${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')}}`;
  const {sources,...head}=raw;
  const top=Object.entries(head).map(([k,v])=>`  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return `{\n${top.join(',\n')},\n  "sources": [\n${sources.map((s:any)=>`    ${line(s)}`).join(',\n')}\n  ]\n}\n`;
}

/** Governed source apply: a human-APPROVED, duplicate-free intake entry joins the registry with its decision record. */
export function applySourceIntake(root:string,entry:any):{applied:boolean;issues:string[]}{
  const g=sourceGovernance(entry);
  const issues:string[]=g.issues.map(String);
  const validate=schema('source-intake.schema.json');
  if(!validate(entry)) issues.push(`JSON_SCHEMA:${(validate.errors??[]).map((e:any)=>`${e.instancePath} ${e.message}`).join('; ')}`);
  if(g.state!=='APPROVED') issues.push(`NOT_APPROVED:${g.state}`);
  const registryRaw=readJson(root,'content-src/source-registry.json');
  const others=readSourceIntake(root).map(i=>i.entry).filter(e=>e.sourceId!==entry?.sourceId);
  for(const d of detectSourceDuplicates([entry,...others],registryRaw.sources).get(entry?.sourceId)??[]) if(!d.with.startsWith('intake:')||d.code!=='DUPLICATE_ID') issues.push(`${d.code}:${d.with}`);
  if(issues.length) return {applied:false,issues:[...new Set(issues)]};
  const {schema:_schema,status,reviews,submittedBy,sourceId,...metadata}=entry;
  const record={id:sourceId,category:entry.category,title:entry.title,classification:'HUMAN_ACCEPTED',
    evidence:`source intake ${SOURCE_INTAKE_DIR}/${sourceId}.json; category accepted by ${g.decision!.reviewerId} on ${g.decision!.reviewedAt}`,
    ...Object.fromEntries(Object.entries(metadata).filter(([k])=>!['category','title'].includes(k))),
    submittedBy,acceptedBy:g.decision!.reviewerId,acceptedAt:g.decision!.reviewedAt,reviewedHash:g.currentHash};
  const next={...registryRaw,sources:[...registryRaw.sources,record]};
  if(parseSourceRegistry(next).issues.length) return {applied:false,issues:parseSourceRegistry(next).issues};
  fs.writeFileSync(path.join(root,'content-src/source-registry.json'),formatSourceRegistry(next),'utf8');
  return {applied:true,issues:[]};
}

// ------------------------------------------------------------------------------------------- theory authoring status
type UnitState='notStarted'|'draft'|'missingSource'|'readyForReview'|'chemistryReviewed'|'didacticReviewed'|'approved'|'changesRequested'|'staleReview';
/** One unit's facts from its working draft (or canonical entry). Precedence keeps every unit in exactly one state. */
export function unitAuthoringState(entry:any,registry=null as any):{state:UnitState;missingChemistry:boolean;missingDidactic:boolean;sourced:boolean}{
  if(!entry) return {state:'notStarted',missingChemistry:true,missingDidactic:true,sourced:false};
  const blocks=contentBlocks(entry).map(b=>({block:b.block,g:blockGovernance(b.block)}));
  // sourced = every block cites ≥1 source and every cited source is canonical-authoring eligible (P2.4 closeout A1)
  const sourced=Boolean(registry)&&blocks.length>0&&blocks.every(b=>Array.isArray(b.block?.sourceRefs)&&b.block.sourceRefs.length>0&&!canonicalSourceIssues(b.block.sourceRefs,registry).length);
  const missingChemistry=blocks.some(b=>b.g.chemistry?.decision!=='approved'), missingDidactic=blocks.some(b=>b.g.didactic?.decision!=='approved');
  const states=blocks.map(b=>b.g.state);
  let state:UnitState;
  if(blocks.length&&states.every(s=>s==='APPROVED')&&sourced) state='approved';
  else if(states.includes('CHANGES_REQUESTED')) state='changesRequested';
  else if(!sourced) state='missingSource';
  else if(states.includes('STALE_REVIEW')) state='staleReview';
  else if(states.includes('DRAFT')||blocks.some(b=>b.block?.status==='draft')) state='draft';
  else if(!missingChemistry) state='chemistryReviewed';
  else if(!missingDidactic) state='didacticReviewed';
  else state='readyForReview';
  return {state,missingChemistry,missingDidactic,sourced};
}

export function buildTheoryAuthoringStatus(root:string){
  const {registry,pinIssues}=loadGovernedSourceRegistry(root);
  const registryRaw=readJson(root,'content-src/source-registry.json');
  const readiness=sourceReadiness(registry);
  const units=(readJson(root,'content-src/learning-units.json') as any[]).map(u=>u.id).sort((a:string,b:string)=>a.localeCompare(b,undefined,{numeric:true}));
  const canonical=new Map(collectStructuredTheory(root).map(c=>[c.entry.learningUnitId,c.entry]));
  const drafts=new Map(readTheoryDrafts(root).map(p=>[p.learningUnit?.id,packetToEntry(p).entry]));
  const rows=units.map(id=>{
    const entry=drafts.get(id)??canonical.get(id)??null;
    return {learningUnitId:id,origin:drafts.has(id)?'draft':canonical.has(id)?'canonical':null,...unitAuthoringState(entry,registry)};
  });
  const count=(s:UnitState)=>rows.filter(r=>r.state===s).length;
  const intake=sourceReviewQueue(root);
  return {schema:'kimyolab.theory-authoring-status.v1',
    semantics:`Facts only, from the repository: canonical entries (${STRUCTURED_THEORY_DIR}/) and working drafts (${THEORY_DRAFT_DIR}/). Each unit is in exactly one state. No priority score. Not part of the learning-product progress formula: drafts, pending reviews and source metadata are not content.`,
    totals:{units:rows.length,notStarted:count('notStarted'),draft:count('draft'),readyForReview:count('readyForReview'),chemistryReviewed:count('chemistryReviewed'),didacticReviewed:count('didacticReviewed'),approved:count('approved'),changesRequested:count('changesRequested'),missingSource:count('missingSource'),staleReview:count('staleReview')},
    canonicalEntries:canonical.size,workingDrafts:drafts.size,
    sources:{registeredSources:readiness.registeredSources,categoryCompatibleSources:readiness.categoryCompatibleSources,
      humanAcceptedSources:readiness.humanAcceptedSources,canonicalTheoryEligibleSources:readiness.canonicalTheoryEligibleSources,
      eligibleSourceIds:readiness.eligibleSourceIds,
      semantics:'categoryCompatible = the category is acceptable for chemistry claims (SOURCE_POLICY). humanAccepted = a person accepted the source through governed intake (HUMAN_ACCEPTED, pinned to the reviewed intake hash). Only sources that are both are canonical-theory eligible; a PROPOSED source never satisfies theory:apply.',
      proposedClassification:registryRaw.sources.filter((s:any)=>s.classification==='PROPOSED').length,
      unpinnedHumanAccepted:pinIssues,
      categories:Object.fromEntries(Object.entries(registryRaw.sources.reduce((m:any,s:any)=>(m[s.category]=(m[s.category]??0)+1,m),{})).sort()),
      intake:{entries:intake.length,byState:Object.fromEntries(['DRAFT','READY_FOR_REVIEW','APPROVED','CHANGES_REQUESTED','REJECTED'].map(s=>[s,intake.filter(i=>i.state===s).length]))}},
    blocked:{
      semantics:'Blockers of units that HAVE entered authoring are counted by state. Units not yet in authoring are counted separately: their source blocker is not measured per unit yet, but no unit can be canonically applied while canonicalTheoryEligibleSources is 0.',
      unitsNotYetInAuthoring:count('notStarted'),
      unitsInAuthoring:rows.length-count('notStarted'),
      canonicalApplyImpossibleForAllUnits:readiness.canonicalTheoryEligibleSources===0,
      inAuthoringBySources:count('missingSource'),
      inAuthoringByAuthoring:count('draft')+count('changesRequested'),
      inAuthoringByChemistryReview:rows.filter(r=>['readyForReview','didacticReviewed','staleReview'].includes(r.state)&&r.missingChemistry).length,
      inAuthoringByDidacticReview:rows.filter(r=>['readyForReview','chemistryReviewed','staleReview'].includes(r.state)&&r.missingDidactic).length},
    units:rows};
}

export function isTheoryPacket(v:any){ return v?.schema===THEORY_PACKET_SCHEMA; }
