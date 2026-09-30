// Human Review Workbench (P1.8). ONE place where a person sees what is waiting for review — chemistry KB assertions,
// chemistry review candidates, assessment items and pilot sign-offs — and exports a decision file. This module:
//
//   * builds the read-only workbench MODEL (what the reviewer sees, pinned by the current content hashes);
//   * validates an exported decision file against the CURRENT content (review:validate — nothing is written);
//   * routes a valid file to the EXISTING importers (review:import) — chemistry → scripts/chemistry-review/import.ts,
//     assessment → scripts/assessment-review/lib.ts. It never writes a register itself; pilot sign-offs are never
//     written by any tool (ADR-P1-004: a pilot owner adds the sign-off in a pull request);
//   * derives the review reports (deterministic, no timestamps).
//
// It approves nothing. Every approval comes from a person's decision, pinned to the hash of what they reviewed.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildKbReports,reviewCandidates,CANDIDATE_REGISTER_FILE,CANDIDATE_BADGE,REVIEW_REGISTER_FILE} from './chemistry-kb.ts';
import {parseReviewRegister,reviewStateOf,parseCandidateRegister,candidateStateOf,CHEMISTRY_DECISION_FIELDS,CANDIDATE_DECISION_FIELDS,type ReviewState} from '../../src/domain/chemistry/kb-review.ts';
import {IonicEngine} from '../../src/domain/chemistry/ionic-engine.ts';
import {AUTOMATION_IDENTITY,ASSESSMENT_REVIEW_FIELDS,REVIEW_REGISTER_SCHEMA,assessmentItemHash,type AssessmentReviewRecord} from '../../src/domain/assessment/governance.ts';
import {PACKET_DIR as ASSESSMENT_PACKET_DIR,validateRegister,importRegister,sha256} from '../assessment-review/lib.ts';
import {validateChemistryDecisions,importDecisions} from '../chemistry-review/import.ts';
import {loadSources} from '../learning-readiness.ts';
import {compileReadiness,itemVerdicts,type ReadinessSources} from './readiness-compile.ts';
import {computeReviewHash} from '../../src/runtime/governance/approvals.ts';
import {buildMasteryView} from '../../src/domain/mastery/view.ts';

export const DECISIONS_SCHEMA='kimyolab.review-decisions.v1';
export const OUTPUT_DIR='review-output';
export const SURFACES=['chemistry','chemistry-candidate','assessment','pilot-signoff'] as const;
export type Surface=typeof SURFACES[number];
export const REVIEW_REPORTS={
  status:'reports/human-review-status.json',
  changeQueue:'reports/review-change-queue.json',
  impact:'reports/review-promotion-impact.json',
  candidates:'reports/chemistry-authoring-candidates.json',
  goldenSlice:'reports/golden-slice-dependencies.json',
};
export const MAPPING_FLAG='MAPPING_REVIEW_REQUIRED';
export const PILOT_SIGNOFF_FIELDS:readonly string[]=['learningUnitId','reviewerId','role','decision','signedAt','basisHash','comment'];
const ENVELOPE_FIELDS=['schema','exportedAt','workspaceFingerprint','decisions'];
/** Canonical reviewer roles — each surface accepts exactly its own. */
export const ROLES_BY_SURFACE:Record<Surface,readonly string[]>={chemistry:['chemistry'],'chemistry-candidate':['chemistry'],assessment:['chemistry','didactic'],'pilot-signoff':['pilot-owner']};

const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const readOptional=(root:string,rel:string,fallback:any)=>fs.existsSync(path.join(root,rel))?readJson(root,rel):fallback;
const uniq=<T>(xs:T[])=>[...new Set(xs)];

// ------------------------------------------------------------------ chemistry: display + priority

/** Files a change to an assertion would touch (for the change queue / authoring). */
export function chemistryFilesOf(id:string):string[]{
  const kind=id.split(':')[0]??'';
  const map:Record<string,string>={reaction:'content-src/chemistry/reactions.json','no-reaction':'content-src/chemistry/reactions.json',condition:'content-src/chemistry/reactions.json',observation:'content-src/chemistry/reactions.json','condition-term':'content-src/chemistry/condition-vocabulary.json','condition-context':'content-src/chemistry/condition-vocabulary.json',dissociation:'content-src/chemistry/solubility.json',insoluble:'content-src/chemistry/solubility.json',hydrolysis:'content-src/chemistry/hydrolysis.json',indicator:'content-src/chemistry/hydrolysis.json',electrolysis:'content-src/chemistry/electrolysis.json','species-name':'content-src/locales/uz-latn/chemistry-species.json','element-name':'content-src/locales/uz-latn/chemistry-elements.json'};
  return map[kind]?[map[kind]]:[];
}

const phaseText=(x:any)=>`${x.formula}${x.phase?`(${x.phase})`:''}`;
const obsText=(o:any)=>[o.type,o.to?`→ ${o.to}`:'',o.descriptionKey?`(${o.descriptionKey})`:'',o.description??''].filter(Boolean).join(' ');

/** Category-specific label/value rows: what a chemistry reviewer reads instead of raw JSON. */
function chemistryDisplay(a:any,kb:any,engine:IonicEngine):Array<[string,string]>{
  const [kind,rest]=[a.id.slice(0,a.id.indexOf(':')),a.id.slice(a.id.indexOf(':')+1)];
  const rxn=(id:string)=>kb.reactions.find((r:any)=>r.id===id);
  switch(kind){
    case 'reaction':{
      const r=rxn(rest); const s=engine.support(rest);
      return [['Tenglama',r.molecularEquation],['Reaktantlar',r.reactants.map(phaseText).join(' + ')],['Mahsulotlar',r.products.map(phaseText).join(' + ')],['Reaksiya turi',r.reactionType],['Sharoit',(r.conditions?.tags??[]).join(', ')||'ko‘rsatilmagan (oddiy sharoit)'],['Kuzatuv',(r.observations??[]).map(obsText).join('; ')||'yo‘q'],['Net ionic',s.supported?'hosil qilinadi (derivable)':`qo‘llab-quvvatlanmaydi: ${s.unsupported.join(', ')}`]];
    }
    case 'no-reaction':{ const r=rxn(rest); return [['Reaktantlar',r.reactants.map(phaseText).join(' + ')],['Sharoit',(r.conditions?.tags??[]).join(', ')||'ko‘rsatilmagan'],['Da’vo','reaksiya bormaydi']]; }
    case 'condition':{ const d=a.data; return [['Reaksiya',rest],['Teglar',d.tags.join(', ')],['O‘lchovlar',Object.entries(d.dimensions).map(([k,v])=>`${k}: ${v}`).join(', ')]]; }
    case 'condition-term': return [['Teg',rest],['O‘lchov',a.data.dimension],['Qiymat',a.data.value]];
    case 'condition-context': return [['Kontekst',rest],['Tavsif',a.claim],['Haqiqiy sharoit',Object.entries(a.data).map(([k,v])=>`${k}: ${v}`).join(', ')]];
    case 'observation':{ const r=rxn(rest); return [['Reaksiya',r.molecularEquation],['Mahsulotlar',r.products.map(phaseText).join(' + ')],['Kuzatuv',(r.observations??[]).map(obsText).join('; ')||'yo‘q']]; }
    case 'dissociation': return [['Formula',a.data.formula],['Ionlar',a.data.ions.map((i:any)=>`${i.coefficient>1?i.coefficient:''}${i.formula}`).join(' + ')]];
    case 'insoluble': return [['Formula',a.data.formula],['Da’vo','suvda erimaydi (cho‘kma)']];
    case 'hydrolysis': return [['Tuz',a.data.salt],['Muhit',a.data.medium],['Tushuntirish',a.data.explanation??'']];
    case 'indicator': return [['Indikator',a.data.indicator],['Muhit',a.data.medium],['Rang',a.data.color]];
    case 'electrolysis': return [['Elektrolit',a.data.electrolyte],['Faza',a.data.phase],['Elektrod',a.data.electrode],['Katod',`${a.data.cathode.product} — ${a.data.cathode.observation??''}`],['Anod',`${a.data.anode.product} — ${a.data.anode.observation??''}`]];
    case 'species-name': return [['Formula',a.data.formula??'?'],['nameKey',a.data.nameKey],['O‘zbekcha nom',a.data.name]];
    case 'element-name': return [['Belgi',a.data.symbol],['O‘zbekcha nom',a.data.name]];
    default: return [['Da’vo',a.claim]];
  }
}

/**
 * Priority queue (a reviewer convenience — NOT an approval and not a gate):
 *   A chemistry anomalies (observation flags) · B foundational models (indicator, condition vocabulary, hydrolysis,
 *   ionic target reactions) · C golden slice (the electrolysis record the golden-slice pilot uses) ·
 *   D terminology (element and species names) · E everything else.
 */
export function priorityOf(a:{id:string;category:string;flags:string[];affectedActivities:string[]},ctx:{ionicTargets:Set<string>;goldenActivities:Set<string>}):'A'|'B'|'C'|'D'|'E'{
  if(a.category==='observation'&&a.flags.includes('CHEMISTRY_REVIEW_REQUIRED')) return 'A';
  if(a.category==='indicator'||a.category==='condition'||a.category==='hydrolysis'||(a.category==='reaction'&&ctx.ionicTargets.has(a.id))) return 'B';
  if(a.category==='electrolysis'&&a.affectedActivities.some(x=>ctx.goldenActivities.has(x))) return 'C';
  if(a.category==='species-name') return 'D';
  return 'E';
}
export const PRIORITY_LABELS={A:'A — kimyoviy anomaliyalar (kuzatuv flaglari)',B:'B — asosiy modellar (indikator, sharoit lug‘ati, gidroliz, ion reaksiya maqsadlari)',C:'C — golden slice (lu.9.15 elektroliz yozuvi)',D:'D — terminologiya (element va modda nomlari)',E:'E — qolgan assertion’lar'};

// ------------------------------------------------------------------ assessment: mapping flag

/**
 * MAPPING_REVIEW_REQUIRED (display flag, P1.8): the question text names a concept of its unit that the item is NOT
 * mapped to. It is a hint for the didactic reviewer — the agent never changes a mapping, and the flag does not
 * change the governance (APPROVED still needs the two reviews and a confirmed outcome).
 */
export function mappingFlags(item:any,unitConcepts:Array<{id:string;name:string}>):string[]{
  const text=String(item.prompt??'').toLowerCase();
  const out:string[]=[];
  for(const c of unitConcepts){
    const name=String(c.name??'').trim().toLowerCase();
    if(name.length<3) continue;
    const named=new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`,'u').test(text);
    if(named&&!item.conceptIds.includes(c.id)){
      const mapped=item.conceptIds.map((id:string)=>`${unitConcepts.find(u=>u.id===id)?.name??'?'} (${id})`).join(', ');
      out.push(`${MAPPING_FLAG}: savol “${c.name}” haqida, lekin “${c.name}” (${c.id}) konseptiga bog‘lanmagan; bog‘langan: ${mapped}`);
    }
  }
  return out;
}

// ------------------------------------------------------------------ the workbench model (read-only)

export interface AssessmentEntry {
  itemId:string;learningUnitId:string;prompt:string;
  options:Array<{id:string;text:string;correct:boolean}>;correctOptionId:string;explanation:string;
  concepts:Array<{id:string;name:string}>;outcomes:Array<{id:string;text:string}>;difficulty:string|null;
  distractors:Array<{id:string;text:string}>;itemHash:string;itemVersion:string;
  evidence:{packet:string;packetSha256:string}|null;
  review:Record<'chemistry'|'didactic',string>;outcome:string;lifecycle:string;reasons:string[];flags:string[];
}

export function buildWorkbenchModel(root:string){
  const r=buildKbReports(root);
  const kb=r.kb;
  const reg=parseReviewRegister(kb.register);
  const candReg=parseCandidateRegister(readOptional(root,CANDIDATE_REGISTER_FILE,{schema:'kimyolab.chemistry-candidate-reviews.v1',records:[]}));
  const engine=IonicEngine.from({reactions:kb.reactions,rules:kb.solubility});
  const ionicTargets=new Set<string>(r.ionic.shelves.map((s:any)=>`reaction:${s.targetReactionId}`));
  const src=loadSources(root);
  const pilotIds=src.pilot.learningUnits.map((u:any)=>u.id);
  const golden=pilotIds.find(id=>src.bank.items.some((i:any)=>i.learningUnitId===id&&i.lifecycle!=='RETIRED'))??null;
  const goldenActivities=new Set<string>(src.mappings.filter((m:any)=>m.learningUnitId===golden&&m.role==='primary').map((m:any)=>m.practiceActivityId));
  const chemistry=r.assertions.map(a=>{
    const st=reviewStateOf(a,reg.records);
    return {id:a.id,category:a.category,claim:a.claim,display:chemistryDisplay(a,kb,engine),currentHash:a.hash,sourceRefs:a.sourceRefs,affectedActivities:a.affectedActivities,
      reviewStatus:st.state,lastDecision:st.record?{decision:st.record.decision,reviewerId:st.record.reviewerId,reviewedAt:st.record.reviewedAt}:null,
      flags:a.flags,priority:priorityOf(a,{ionicTargets,goldenActivities}),canonical:true,files:chemistryFilesOf(a.id)};
  });
  const candidates=reviewCandidates(r.ionic).map(c=>{
    const st=candidateStateOf({id:c.candidateId,hash:c.candidateHash},candReg.records);
    return {...c,reviewStatus:st.state};
  });
  // assessment
  const conceptsRaw=readJson(root,'content-src/concepts.json');
  const conceptName=new Map<string,string>((Array.isArray(conceptsRaw)?conceptsRaw:conceptsRaw.concepts??[]).map((c:any)=>[c.id,c.name]));
  const assessment:AssessmentEntry[]=itemVerdicts(src).filter((v:any)=>v.verdict.lifecycle!=='RETIRED').map(({item,verdict}:any):AssessmentEntry=>{
    const unit=src.units.find((u:any)=>u.id===item.learningUnitId);
    const unitConcepts=uniq([...(unit?.conceptIds??[]),...src.mappings.filter((m:any)=>m.learningUnitId===item.learningUnitId).flatMap((m:any)=>m.conceptIds??[])]).map((id:any)=>({id,name:conceptName.get(id)??''}));
    const packet=`${ASSESSMENT_PACKET_DIR}/${item.id}.md`;
    const packetPath=path.join(root,packet);
    const outcomeText=(o:string)=>{const m=/#o([0-9]+)$/.exec(o);return m?unit?.learningOutcomes?.[Number(m[1])-1]??'(topilmadi)':'(noto‘g‘ri id)';};
    return {
      itemId:item.id,learningUnitId:item.learningUnitId,prompt:item.prompt,
      options:item.options.map((o:any)=>({id:o.id,text:o.text,correct:o.id===item.correctOptionId})),
      correctOptionId:item.correctOptionId,explanation:item.explanation,
      concepts:item.conceptIds.map((id:string)=>({id,name:conceptName.get(id)??'nomi topilmadi'})),
      outcomes:(item.outcomeIds??[]).map((id:string)=>({id,text:outcomeText(id)})),
      difficulty:item.difficulty??null,
      distractors:item.options.filter((o:any)=>o.id!==item.correctOptionId).map((o:any)=>({id:o.id,text:o.text})),
      itemHash:assessmentItemHash(item),itemVersion:item.version,
      evidence:fs.existsSync(packetPath)?{packet,packetSha256:sha256(fs.readFileSync(packetPath))}:null,
      review:verdict.review,outcome:verdict.outcome,lifecycle:verdict.lifecycle,reasons:verdict.reasons,
      flags:mappingFlags(item,unitConcepts),
    };
  });
  // pilot sign-off (read from the machine-derived matrix; the sign-off register is only read)
  const matrix=readOptional(root,'reports/pilot-acceptance-matrix.json',{rows:[]});
  const signoffs=readOptional(root,'content-src/pilot-signoffs.json',{records:[]}).records??[];
  const pilot=(matrix.rows??[]).map((row:any)=>({
    learningUnitId:row.learningUnitId,title:row.title??null,status:row.finalPilotStatus,technical:row.technical,signoff:row.signoff,basisHash:row.basisHash,
    pendingHuman:row.pendingHuman??[],blockers:row.blockers??[],canSignOff:row.finalPilotStatus==='SIGNOFF_PENDING',
    records:signoffs.filter((s:any)=>s.learningUnitId===row.learningUnitId).map((s:any)=>({reviewerId:s.reviewerId,decision:s.decision,signedAt:s.signedAt,basisHash:s.basisHash})),
  }));
  const fingerprint=createHash('sha256').update(JSON.stringify({c:chemistry.map(c=>[c.id,c.currentHash]),k:candidates.map(c=>[c.candidateId,c.candidateHash]),a:assessment.map(a=>[a.itemId,a.itemHash,a.evidence?.packetSha256??null]),p:pilot.map((p:any)=>[p.learningUnitId,p.basisHash])})).digest('hex');
  return {
    schema:'kimyolab.review-workbench.v1',
    fingerprint,
    decisionsSchema:DECISIONS_SCHEMA,
    roles:ROLES_BY_SURFACE,
    automationIdentityPattern:AUTOMATION_IDENTITY.source,
    candidateBadge:CANDIDATE_BADGE,
    priorities:PRIORITY_LABELS,
    goldenSlice:golden,
    chemistry,candidates,assessment,pilot,
  };
}
export type WorkbenchModel=ReturnType<typeof buildWorkbenchModel>;

// ------------------------------------------------------------------ decision file: validate (read-only) + import

const CATEGORY_OF:Array<[RegExp,string]>=[
  [/FIELD_NOT_ALLOWED|ENVELOPE_/,'tampering'],
  [/CONFLICT|DUAL_ROLE/,'conflicting'],
  [/STALE|PACKET_CHANGED|VERSION_STALE/,'stale'],
  [/UNKNOWN/,'unknown'],
  [/NOT_HUMAN|REVIEWER_MISSING|REVIEWER_REQUIRED|ROLE_INVALID|ROLE_MISMATCH/,'invalidIdentity'],
  [/COMMENT_REQUIRED/,'missingComment'],
];
export function categorize(issue:string):string{ return CATEGORY_OF.find(([re])=>re.test(issue))?.[1]??'invalid'; }

function validatePilotSignoffs(root:string,records:any[]):string[]{
  const matrix=readOptional(root,'reports/pilot-acceptance-matrix.json',{rows:[]});
  const issues:string[]=[];
  for(const r of records){
    const id=r?.learningUnitId??'?';
    for(const f of Object.keys(r??{}).filter(k=>!PILOT_SIGNOFF_FIELDS.includes(k))) issues.push(`PILOT_SIGNOFF_FIELD_NOT_ALLOWED:${id}:${f}`);
    if(typeof r?.reviewerId!=='string'||!r.reviewerId.trim()) issues.push(`PILOT_SIGNOFF_REVIEWER_MISSING:${id}`);
    else if(AUTOMATION_IDENTITY.test(r.reviewerId)) issues.push(`PILOT_SIGNOFF_REVIEWER_NOT_HUMAN:${id}`);
    if(r?.role!=='pilot-owner') issues.push(`PILOT_SIGNOFF_ROLE_INVALID:${id}`);
    if(!['signed_off','rejected'].includes(r?.decision)) issues.push(`PILOT_SIGNOFF_DECISION_INVALID:${id}`);
    if(typeof r?.signedAt!=='string'||!Number.isFinite(Date.parse(r.signedAt))) issues.push(`PILOT_SIGNOFF_DATE_INVALID:${id}`);
    if(r?.decision==='rejected'&&!String(r?.comment??'').trim()) issues.push(`PILOT_SIGNOFF_COMMENT_REQUIRED:${id}`);
    const row=(matrix.rows??[]).find((x:any)=>x.learningUnitId===r?.learningUnitId);
    if(!row) issues.push(`PILOT_SIGNOFF_UNIT_UNKNOWN:${id}`);
    else{
      if(row.basisHash!==r?.basisHash) issues.push(`PILOT_SIGNOFF_STALE:${id}`);
      if(r?.decision==='signed_off'&&row.finalPilotStatus!=='SIGNOFF_PENDING') issues.push(`PILOT_SIGNOFF_PREMATURE:${id}:${row.finalPilotStatus}`);
    }
  }
  const seen=new Map<string,string>();
  for(const r of records){ const k=String(r?.learningUnitId), v=JSON.stringify([r?.decision,r?.reviewerId]); if(seen.has(k)&&seen.get(k)!==v) issues.push(`PILOT_SIGNOFF_CONFLICT:${k}`); seen.set(k,v); }
  return uniq(issues);
}

/** Splits an exported decision file by surface (the `surface` tag is the workbench's; the importers never see it). */
function split(envelope:any){
  const by:Record<Surface,any[]>={chemistry:[],'chemistry-candidate':[],assessment:[],'pilot-signoff':[]};
  const issues:string[]=[];
  if(!envelope||envelope.schema!==DECISIONS_SCHEMA||!Array.isArray(envelope.decisions)) return {by,issues:['ENVELOPE_SCHEMA_INVALID']};
  for(const k of Object.keys(envelope).filter(k=>!ENVELOPE_FIELDS.includes(k))) issues.push(`ENVELOPE_FIELD_NOT_ALLOWED:${k}`);
  for(const d of envelope.decisions){
    const surface=d?.surface as Surface;
    if(!SURFACES.includes(surface)){ issues.push(`DECISION_SURFACE_UNKNOWN:${String(surface)}`); continue; }
    const {surface:_s,...rest}=d;
    if(rest.decision===null||rest.decision===undefined) continue;          // not decided — skipped, never defaulted
    by[surface].push(rest);
  }
  return {by,issues};
}

export interface DecisionValidation {
  schema:string;
  counts:{decisions:number;chemistry:number;candidates:number;assessment:number;pilotSignoffs:number;issues:number};
  categories:Record<'valid'|'stale'|'invalidIdentity'|'unknown'|'missingComment'|'conflicting'|'tampering'|'invalid',string[]>;
  issues:string[];
  importable:boolean;
  pilotSignoffsImportable:false;
  registersChanged:false;
}

/** review:validate — the import preview. Reads the current content; writes nothing. */
export function validateDecisionFile(root:string,envelope:any):DecisionValidation{
  const {by,issues}=split(envelope);
  const chem=validateChemistryDecisions(root,{decisions:by.chemistry,candidateDecisions:by['chemistry-candidate']});
  const assess=by.assessment.length?validateRegister(root,{schema:REVIEW_REGISTER_SCHEMA,records:by.assessment}):{rows:[],issues:[]};
  const pilot=validatePilotSignoffs(root,by['pilot-signoff']);
  const all=uniq([...issues,...chem.issues,...assess.issues,...pilot]);
  const categories:DecisionValidation['categories']={valid:[],stale:[],invalidIdentity:[],unknown:[],missingComment:[],conflicting:[],tampering:[],invalid:[]};
  for(const i of all) (categories as any)[categorize(i)].push(i);
  const idOf=(s:Surface,d:any)=>s==='chemistry'?d.assertionId:s==='chemistry-candidate'?d.candidateId:s==='assessment'?`${d.itemId}|${d.role}`:d.learningUnitId;
  for(const s of SURFACES) for(const d of by[s]){ const id=String(idOf(s,d)); const bare=s==='assessment'?String(d.itemId):id; if(!all.some(i=>i.includes(`:${bare}`)||i.endsWith(bare))) categories.valid.push(`${s}:${id}`); }
  const total=SURFACES.reduce((n,s)=>n+by[s].length,0);
  return {schema:'kimyolab.review-validation.v1',counts:{decisions:total,chemistry:by.chemistry.length,candidates:by['chemistry-candidate'].length,assessment:by.assessment.length,pilotSignoffs:by['pilot-signoff'].length,issues:all.length},categories,issues:all,importable:all.length===0&&total>0,pilotSignoffsImportable:false,registersChanged:false};
}

/**
 * review:import — the ONLY path from a decision file into the canonical registers, and only through the existing
 * importers. All-or-nothing: any issue anywhere refuses the whole file. Pilot sign-offs are validated but never
 * written (ADR-P1-004: a pilot owner adds the sign-off record in a reviewed pull request).
 */
export function importDecisionFile(root:string,envelope:any){
  const v=validateDecisionFile(root,envelope);
  if(v.issues.length) return {imported:{chemistry:0,candidates:0,assessment:0},pilotSignoffsNotImported:v.counts.pilotSignoffs,issues:v.issues};
  const {by}=split(envelope);
  const chem=(by.chemistry.length||by['chemistry-candidate'].length)?importDecisions(root,{decisions:by.chemistry,candidateDecisions:by['chemistry-candidate']}):{imported:0,importedCandidates:0,issues:[]};
  if(chem.issues.length) return {imported:{chemistry:0,candidates:0,assessment:0},pilotSignoffsNotImported:v.counts.pilotSignoffs,issues:chem.issues};
  const assess=by.assessment.length?importRegister(root,{schema:REVIEW_REGISTER_SCHEMA,records:by.assessment}):{imported:0};
  return {imported:{chemistry:chem.imported,candidates:chem.importedCandidates,assessment:assess.imported},pilotSignoffsNotImported:v.counts.pilotSignoffs,issues:[] as string[]};
}

// ------------------------------------------------------------------ reports

function assessmentFiles(){ return ['content-src/assessment-items.json']; }

export function changeQueue(model:WorkbenchModel,root:string){
  const entries:any[]=[];
  for(const c of model.chemistry) if(c.reviewStatus==='rejected'||c.reviewStatus==='change_required'){
    const rec=parseReviewRegister(readOptional(root,REVIEW_REGISTER_FILE,{schema:'kimyolab.chemistry-reviews.v1',records:[]})).records.filter(r=>r.assertionId===c.id).at(-1);
    entries.push({id:c.id,surface:'chemistry',category:c.category,reviewDecision:c.reviewStatus,reviewerComment:rec?.comment??null,reviewerId:rec?.reviewerId??null,affectedFiles:c.files,affectedActivities:c.affectedActivities,currentHash:c.currentHash});
  }
  const reviews:AssessmentReviewRecord[]=readOptional(root,'content-src/assessment-reviews.json',{records:[]}).records??[];
  for(const a of model.assessment){
    for(const role of ['chemistry','didactic'] as const){
      const d=(a.review as any)[role];
      const rec=reviews.filter(r=>r.itemId===a.itemId&&r.role===role&&r.itemHash===a.itemHash).sort((x,y)=>x.reviewedAt.localeCompare(y.reviewedAt)).at(-1);
      if(d==='rejected'||d==='changes_requested') entries.push({id:a.itemId,surface:'assessment',category:`assessment-${role}`,reviewDecision:d,reviewerComment:rec?.comment??null,reviewerId:rec?.reviewerId??null,affectedFiles:assessmentFiles(),affectedActivities:[],learningUnitId:a.learningUnitId,currentHash:a.itemHash});
      if(role==='didactic'&&(a.outcome==='reject'||a.outcome==='change_required')) entries.push({id:a.itemId,surface:'assessment',category:'assessment-outcome-mapping',reviewDecision:`outcome:${a.outcome}`,reviewerComment:rec?.comment??null,reviewerId:rec?.reviewerId??null,affectedFiles:assessmentFiles(),affectedActivities:[],learningUnitId:a.learningUnitId,currentHash:a.itemHash});
    }
  }
  return {
    schema:'kimyolab.review-change-queue.v1',
    semantics:'Items a PERSON sent back (reject / change_required / changes_requested, or an outcome mapping not confirmed) on the current hash. Input for the next AUTHORING task — no tool edits the content from here; after an author changes it, the new hash needs a new review.',
    sourceContentMutated:false,
    entries:entries.sort((x,y)=>`${x.surface}|${x.id}|${x.category}`.localeCompare(`${y.surface}|${y.id}|${y.category}`)),
    count:entries.length,
  };
}

export function authoringCandidates(model:WorkbenchModel){
  const supportingRule=(c:any)=>c.candidate?.kind==='reaction-candidate'?(c.candidate.swaps.some((s:any)=>s.water)?'H⁺ + OH⁻ → H₂O (ion-swap forms water)':`solubility.insoluble: ${c.candidate.swaps.filter((s:any)=>s.formula&&/insoluble/.test(c.candidate.basis)&&c.candidate.basis.includes(s.formula)).map((s:any)=>s.formula).join(', ')}`)
    :c.candidate?.kind==='no-reaction-candidate'?'solubility.dissociation: every ion-swap product is listed as soluble'
    :c.candidate?.kind==='unclassifiable'?'none — the solubility rules do not cover every ion-swap product'
    :'a matching record exists but needs other conditions (CONDITION_DEPENDENT)';
  const rows=model.candidates.map(c=>({
    candidateId:c.candidateId,candidateHash:c.candidateHash,badge:c.badge,canonical:false,
    pair:c.pair,reagents:c.reagents,currentClass:c.class,kind:c.candidate?.kind??'condition-dependent',
    derivation:c.candidate?{basis:c.candidate.basis,ionSwaps:c.candidate.swaps}:null,
    supportingRule:supportingRule(c),
    affectedActivity:c.activitiesAffected[0],
    requiredReviewerRole:'chemistry',
    status:c.reviewStatus,
    notCanonical:'products, reaction type and observation are NOT asserted here; an accepted candidate still has to be authored as a reaction / no-reaction record and reviewed as an assertion',
  }));
  const count=(k:string)=>rows.filter(r=>r.kind===k).length;
  const st=(s:string)=>rows.filter(r=>r.status===s).length;
  return {
    schema:'kimyolab.chemistry-authoring-candidates.v1',
    semantics:'Review candidates derived from the solubility rules (P1.7). A candidate is never canonical chemistry: a reviewer decision (accept_for_authoring | reject_candidate | needs_evidence) only triages authoring work.',
    summary:{total:rows.length,reactionCandidates:count('reaction-candidate'),noReactionCandidates:count('no-reaction-candidate'),unclassifiable:count('unclassifiable'),conditionDependent:count('condition-dependent'),pending:st('pending'),acceptedForAuthoring:st('accept_for_authoring'),rejected:st('reject_candidate'),needsEvidence:st('needs_evidence'),stale:st('stale'),addedToKnowledgeBase:0},
    candidates:rows,
  };
}

/** Everything that stands between the golden-slice pilot unit and PILOT_READY. */
export function goldenSliceDependencies(model:WorkbenchModel,root:string){
  const lu=model.goldenSlice;
  const matrix=readOptional(root,'reports/pilot-acceptance-matrix.json',{rows:[]});
  const row=(matrix.rows??[]).find((r:any)=>r.learningUnitId===lu);
  const check=(id:string)=>row?.checks?.find((c:any)=>c.id===id);
  const items=model.assessment.filter(a=>a.learningUnitId===lu);
  const electro=model.chemistry.filter(c=>c.category==='electrolysis'&&c.priority==='C');
  const renderer=readOptional(root,'reports/electrolysis-model-readiness.json',{renderer:null,rendererStartGate:{status:null}});
  const deps=[
    {id:'practice-technical',kind:'machine',status:row?.technical==='TECHNICAL_PASS'?'PASS':'FAIL',detail:row?`${row.technical}; route ${check('technical.route')?.detail??'?'}`:'no pilot row'},
    {id:'renderer-path',kind:'machine',status:check('ux.practice-e2e')?.verdict==='PASS'?'PASS':'FAIL',detail:`legacy beta2-advanced experiment UI (browser E2E: ${check('ux.practice-e2e')?.detail??'none'}); an electrolysis registry renderer is ${renderer.renderer??'NOT_STARTED'} — start gate ${renderer.rendererStartGate?.status}`},
    {id:'activity-content-review',kind:'human',status:check('content.activity-review')?.verdict??'PENDING',detail:check('content.activity-review')?.detail??''},
    {id:'electrolysis-chemistry-review',kind:'human',status:electro.length&&electro.every(e=>e.reviewStatus==='approved')?'PASS':'PENDING',detail:electro.map(e=>`${e.id}: ${e.reviewStatus}`).join('; ')||'no electrolysis assertion'},
    {id:'assessment-chemistry-review',kind:'human',status:items.length&&items.every(i=>i.review.chemistry==='approved')?'PASS':'PENDING',detail:`${items.filter(i=>i.review.chemistry==='approved').length}/${items.length} items approved by a chemistry reviewer on the current hash`},
    {id:'assessment-didactic-review',kind:'human',status:items.length&&items.every(i=>i.review.didactic==='approved')?'PASS':'PENDING',detail:`${items.filter(i=>i.review.didactic==='approved').length}/${items.length} items approved by a didactic reviewer on the current hash (a different person from the chemistry reviewer)`},
    {id:'outcome-mapping',kind:'human',status:items.length&&items.every(i=>i.outcome==='confirm')?'PASS':'PENDING',detail:`${items.filter(i=>i.outcome==='confirm').length}/${items.length} outcome mappings confirmed; ${MAPPING_FLAG}: ${items.filter(i=>i.flags.length).map(i=>i.itemId).join(', ')||'none'}`},
    {id:'pilot-owner-signoff',kind:'human',status:row?.signoff==='CURRENT'?'PASS':'PENDING',detail:`sign-off ${row?.signoff??'NONE'} (possible only once every other dependency passes: status ${row?.finalPilotStatus})`},
  ];
  return {
    schema:'kimyolab.golden-slice-dependencies.v1',
    learningUnitId:lu,primaryPractice:row?.primaryPractice??null,pilotStatus:row?.finalPilotStatus??null,
    dependencies:deps,
    pending:deps.filter(d=>d.status!=='PASS').map(d=>d.id),
    masteredReachable:row?.checks?.find((c:any)=>c.id==='mastery.no-false-mastery')?.detail?.includes('MASTERED unreachable')===false,
  };
}

/** Hypothetical: what WOULD change if every pending human review were approved. Computed in memory only. */
export async function promotionImpact(model:WorkbenchModel,root:string,evaluatePilot:(o:any)=>Promise<any>){
  const src=loadSources(root);
  const before=compileReadiness(src).pack;
  const approve=(a:any)=>{
    const hash=computeReviewHash(a);
    const rec=(role:string)=>({status:'approved',reviewerRole:role,reviewerId:'hypothetical',reviewedAt:'2000-01-01T00:00:00.000Z',reviewedVersion:a.version,reviewedHash:hash,notes:'hypothetical'});
    return {...a,approvals:{technical:rec('technical'),didactic:rec('didactic'),accessibility:rec('accessibility'),chemistry:a.approvals?.chemistry==='not_applicable'?'not_applicable':rec('chemistry')}};
  };
  const bank=src.bank.items.filter((i:any)=>i.lifecycle!=='RETIRED');
  const reviews:any[]=bank.flatMap((item:any)=>{
    const hash=assessmentItemHash(item);
    const base={itemHash:hash,itemVersion:item.version,reviewedAt:'2000-01-01T00:00:00.000Z',decision:'approved',evidence:{packet:`${ASSESSMENT_PACKET_DIR}/${item.id}.md`,packetSha256:'0'.repeat(64)}};
    return [{...base,itemId:item.id,role:'chemistry',reviewerRole:'chemistry',reviewerId:'hypothetical-chemist'},{...base,itemId:item.id,role:'didactic',reviewerRole:'didactic',reviewerId:'hypothetical-teacher',outcomeDecision:'confirm'}];
  });
  const hypo:ReadinessSources={...src,activities:src.activities.map(approve),reviews};
  const after=compileReadiness(hypo).pack;
  const byId=new Map(before.activities.map(a=>[a.activityId,a]));
  const contentApproved=after.activities.filter(a=>a.content==='APPROVED'&&byId.get(a.activityId)?.content!=='APPROVED').map(a=>a.activityId);
  const runtimeChanged=after.activities.filter(a=>byId.get(a.activityId)?.runtime!==a.runtime).map(a=>a.activityId);
  const stillNotReleaseReady=after.activities.filter(a=>!(a.runtime==='READY'&&a.content==='APPROVED')).map(a=>({activityId:a.activityId,runtime:a.runtime,reasons:a.reasons.filter(r=>r!=='ACTIVITY_REVIEW_PENDING'&&r!=='CHEMISTRY_REVIEW_REQUIRED')}));
  const unitsBefore=new Map((before.units??[]).map(u=>[u.learningUnitId,u.assessment.status]));
  const assessmentAvailable=(after.units??[]).filter(u=>u.assessment.status==='AVAILABLE'&&unitsBefore.get(u.learningUnitId)!=='AVAILABLE').map(u=>u.learningUnitId);
  const matrix=await evaluatePilot({base:root,sources:hypo,chemistryState:()=>'approved'});
  const current=readOptional(root,'reports/pilot-acceptance-matrix.json',{rows:[]});
  const pilots=matrix.rows.map((r:any)=>({learningUnitId:r.learningUnitId,now:current.rows.find((x:any)=>x.learningUnitId===r.learningUnitId)?.finalPilotStatus??null,ifApproved:r.finalPilotStatus,stillNeeds:r.finalPilotStatus==='SIGNOFF_PENDING'?['pilot-owner sign-off on the new basisHash (a person, in a pull request)']:r.pendingHuman.concat(r.blockers)}));
  const lu=model.goldenSlice;
  const unit=src.units.find((u:any)=>u.id===lu);
  const reach=(availability:string)=>buildMasteryView({learningUnitId:lu,conceptIds:unit.conceptIds,mastery:unit.conceptIds.map((c:string)=>({conceptId:c,evidenceIds:['e'],confidence:1,status:'mastered',scoringVersion:'1'})) as any,countedEvidence:[{id:'e',conceptId:unit.conceptIds[0],evidenceClass:'concept-assessment',source:'a',createdAt:'2026-01-01T00:00:00.000Z'}] as any,attempts:{practiceCompletedOrAbandoned:3,assessment:1},assessmentAvailability:availability as any}).band==='MASTERED';
  const sourceless=model.chemistry.filter(c=>!c.sourceRefs.length);
  return {
    schema:'kimyolab.review-promotion-impact.v1',
    hypothetical:true,
    canonicalStateChanged:false,
    semantics:'What would change IF every currently pending human review were approved on the current hash. Computed in memory; no register, approval or sign-off is written, and nothing here counts as a decision.',
    activities:{
      total:after.activities.length,
      wouldBecomeContentApproved:contentApproved.length,
      runtimeStatesUnchanged:runtimeChanged.length===0,
      runtimeChanged,
      wouldBeReleaseReady:after.activities.filter(a=>a.runtime==='READY'&&a.content==='APPROVED').length,
      remainNotReleaseReady:stillNotReleaseReady,
      note:'content approval never changes the runtime dimension: activities that are not released (ACTIVITY_NOT_RELEASED) or not routable stay as they are until a person releases them',
    },
    assessment:{items:bank.length,unitsWouldBecomeAvailable:assessmentAvailable,masteredReachable:{now:reach(unitsBefore.get(lu)??'NONE'),ifApproved:reach('AVAILABLE')},learningUnitId:lu},
    chemistry:{assertions:model.chemistry.length,pending:model.chemistry.filter(c=>c.reviewStatus==='pending').length,wouldRemainBlocked:{count:sourceless.length,reason:'APPROVED_WITHOUT_SOURCE — the gate refuses an approval of an assertion that cites no source (localized names today); a source must be added before an approval can count',ids:sourceless.map(c=>c.id)},candidatesAddedToKb:0},
    pilots,
    globalStrictEnforcement:false,
  };
}

export function humanReviewStatus(model:WorkbenchModel,root:string){
  const chemReg=readOptional(root,REVIEW_REGISTER_FILE,{records:[]}).records??[];
  const candReg=readOptional(root,CANDIDATE_REGISTER_FILE,{records:[]}).records??[];
  const assessReg=readOptional(root,'content-src/assessment-reviews.json',{records:[]}).records??[];
  const signoffs=readOptional(root,'content-src/pilot-signoffs.json',{records:[]}).records??[];
  const c=model.chemistry;
  const cs=(s:ReviewState)=>c.filter(x=>x.reviewStatus===s).length;
  const pr=Object.fromEntries((['A','B','C','D','E'] as const).map(p=>{const xs=c.filter(x=>x.priority===p);return [p,{label:PRIORITY_LABELS[p],total:xs.length,pending:xs.filter(x=>x.reviewStatus!=='approved').length,...(p==='E'?{}:{ids:xs.map(x=>x.id)})}];}));
  const a=model.assessment;
  const ks=(s:string)=>model.candidates.filter(x=>x.reviewStatus===s).length;
  const readiness=compileReadiness(loadSources(root)).pack;
  return {
    schema:'kimyolab.human-review-status.v1',
    semantics:'Derived from the human registers only. Tooling decides nothing: 0 decisions means nobody has reviewed yet, which is PENDING — not a CI failure.',
    humanDecisionsImported:{chemistry:chemReg.length,chemistryCandidates:candReg.length,assessment:assessReg.length,pilotSignoffs:signoffs.length,total:chemReg.length+candReg.length+assessReg.length+signoffs.length},
    chemistry:{total:c.length,pending:cs('pending'),approved:cs('approved'),rejected:cs('rejected'),changeRequired:cs('change_required'),stale:cs('stale'),flagged:c.filter(x=>x.flags.length).map(x=>x.id),priorityQueue:pr},
    chemistryCandidates:{total:model.candidates.length,pending:ks('pending'),acceptedForAuthoring:ks('accept_for_authoring'),rejected:ks('reject_candidate'),needsEvidence:ks('needs_evidence'),stale:ks('stale'),canonical:0},
    assessment:{total:a.length,chemistryApproved:a.filter(x=>x.review.chemistry==='approved').length,didacticApproved:a.filter(x=>x.review.didactic==='approved').length,outcomeConfirmed:a.filter(x=>x.outcome==='confirm').length,fullyApproved:a.filter(x=>x.lifecycle==='APPROVED').length,mappingReviewRequired:a.filter(x=>x.flags.length).map(x=>x.itemId)},
    activities:{total:readiness.activities.length,contentApproved:readiness.activities.filter(x=>x.content==='APPROVED').length,contentReviewPending:readiness.activities.filter(x=>x.content==='REVIEW_PENDING').length,contentRejected:readiness.activities.filter(x=>x.content==='REJECTED').length,runtimePending:readiness.activities.filter(x=>x.runtime==='PENDING').length,reviewSurface:'Beta activity approvals (existing beta registers → npm run beta:approvals:import)'},
    pilot:{units:model.pilot.length,pendingSignoff:model.pilot.filter((p:any)=>p.signoff!=='CURRENT').length,signedOff:model.pilot.filter((p:any)=>p.signoff==='CURRENT').length,statuses:Object.fromEntries(model.pilot.map((p:any)=>[p.learningUnitId,p.status]))},
    globalStrictEnforcement:false,
  };
}

export const REVIEW_FIELDS={chemistry:CHEMISTRY_DECISION_FIELDS,'chemistry-candidate':CANDIDATE_DECISION_FIELDS,assessment:ASSESSMENT_REVIEW_FIELDS,'pilot-signoff':PILOT_SIGNOFF_FIELDS};
