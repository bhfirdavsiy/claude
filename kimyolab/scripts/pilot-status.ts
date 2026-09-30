// pilot:status (P1.3) — the formal pilot gate. For each pilot LearningUnit it runs machine checks against the
// real code and content (routing, readiness, the browser practice path headless, chemistry consistency,
// mappings, versions, E2E coverage) and reads the human decisions (activity approvals, assessment reviews,
// pilot sign-offs). It writes reports/pilot-acceptance-matrix.json (deterministic, no timestamp) and exits:
//   PASS    — every pilot unit is PILOT_READY (signed off by a person on the current basis)
//   PENDING — no failure, human review / sign-off outstanding  (exit 0 — not a CI failure)
//   FAIL    — invalid route, broken evidence, stale approval/sign-off, bad mapping … (exit 1)
// It never writes approvals or sign-offs.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadSources} from './learning-readiness.ts';
import {compileReadiness,itemVerdicts,type ReadinessSources} from './lib/readiness-compile.ts';
import {assessmentItemHash,AUTOMATION_IDENTITY} from '../src/domain/assessment/governance.ts';
import {deriveActivityExecutionPlan,CONFIG_SOURCE_NAMES} from '../src/runtime/practice-router/execution-plan.ts';
import {launchDecision,READINESS_PACK_SCHEMA,READINESS_PACK_PATH} from '../src/domain/readiness/readiness.ts';
import {buildMasteryView} from '../src/domain/mastery/view.ts';
import {parseFormula} from '../src/domain/chemistry/formula-parser.ts';
import {ElectrolysisModel} from '../src/domain/chemistry/electrolysis-model.ts';
import {validateEvidence} from '../src/runtime/evidence/types.ts';
import {isPracticeResultComplete} from '../src/runtime/learning-orchestrator/selectors.ts';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {buildPracticeUiModel} from '../src/features/practice/ui-model.ts';
import {atomIntent} from '../src/renderers/atom-builder/renderer.ts';
import {derivePilotStatus,pilotBasis,pilotGate,type PilotCheck,type PilotSignoffRecord,type SignoffState,type CheckVerdict} from '../src/domain/pilot/acceptance.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const SIGNOFF_FILE='content-src/pilot-signoffs.json';
export const SIGNOFF_SCHEMA='kimyolab.pilot-signoffs.v1';
export const MATRIX_FILE='reports/pilot-acceptance-matrix.json';
const sha256=(s:string)=>createHash('sha256').update(s).digest('hex');

/** Serves the built content pack from disk, exactly as the browser receives it (checksums included). */
export function diskFetch(base:string){
  const dir=path.join(base,'public/content');
  return async(url:string)=>{
    const rel=String(url).replace(/^\/content\//,'');
    const file=path.join(dir,rel);
    if(!fs.existsSync(file)) return {ok:false,status:404,json:async()=>({}),text:async()=>'',arrayBuffer:async()=>new ArrayBuffer(0)} as any;
    const body=fs.readFileSync(file);
    return {ok:true,status:200,json:async()=>JSON.parse(body.toString('utf8')),text:async()=>body.toString('utf8'),arrayBuffer:async()=>body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength)} as any;
  };
}

const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;
/** Formula of a binary compound from valencies — computed independently of the expected answer in the config. */
export function formulaFromValency(a:string,va:number,b:string,vb:number){const g=gcd(va,vb);const ia=vb/g,ib=va/g;return `${a}${ia>1?ia:''}${b}${ib>1?ib:''}`;}
function satisfiesCaret(range:string,version:string){
  const m=/^\^(\d+)\.(\d+)\.(\d+)$/.exec(range);const v=/^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if(!m||!v) return range==='*';
  return v[1]===m[1]&&(Number(v[2])>Number(m[2])||(v[2]===m[2]&&Number(v[3])>=Number(m[3])));
}

/**
 * Independent solution commands for the pilot engines, derived from chemistry (valency, formula masses,
 * particle counts) or, for experiments, taken from the learner UI model itself — so the check exercises the
 * same command path the browser uses.
 */
function solutionCommands(model:any):{commands:any[];chemistry:{verdict:CheckVerdict;detail:string}}{
  const c=model.referenceConfig;
  // P1.4: a registry-rendered activity has no legacy UI model; its renderer's intents are the browser path
  const ui:any=model.executionPlan.rendererRequirement?{kind:'registry'}:buildPracticeUiModel(model);
  if(model.type==='trainer'&&model.executionPlan.runtime==='reference-slice'){
    const derived=formulaFromValency(c.elementA,c.valencyA,c.elementB,c.valencyB);
    const same=parseFormula(derived).normalized===parseFormula(c.expectedFormula).normalized;
    return {commands:[{kind:'trainer-answer',answer:derived}],chemistry:{verdict:same?'PASS':'FAIL',detail:`valency ${c.elementA}(${c.valencyA})/${c.elementB}(${c.valencyB}) → ${derived}; config expects ${c.expectedFormula}`}};
  }
  if(model.type==='calculation'&&model.executionPlan.runtime==='reference-slice'){
    const atoms=parseFormula(c.formula).atoms as Record<string,number>;
    const contribution=(symbol:string)=>(atoms[symbol]??0)*Number(c.atomicMasses[symbol]);
    const expected:Record<string,number>={};
    for(const symbol of Object.keys(atoms)) expected[`${symbol.toLowerCase()}-contribution`]=contribution(symbol);
    expected.total=Object.keys(atoms).reduce((s,x)=>s+contribution(x),0);
    const mismatch=c.steps.filter((s:any)=>expected[s.id]!==s.value).map((s:any)=>`${s.id}: config ${s.value}, formula ${expected[s.id]}`);
    return {commands:c.steps.map((s:any)=>({kind:'calculation-response',response:{stepId:s.id,value:expected[s.id],unit:s.unit}})),
      chemistry:{verdict:mismatch.length?'FAIL':'PASS',detail:mismatch.length?mismatch.join('; '):`${c.formula}: every step recomputed from the formula and atomic masses (Mr=${expected.total})`}};
  }
  if(model.type==='simulation'&&model.executionPlan.runtime==='reference-slice'){
    const t=c.target;
    const consistent=t.electrons===t.protons&&t.isotope===`${t.element}-${t.protons+t.neutrons}`;
    const commands=(['protons','neutrons','electrons'] as const).flatMap(p=>Array.from({length:t[p]},()=>atomIntent(p,1)));
    return {commands,chemistry:{verdict:consistent?'PASS':'FAIL',detail:`target ${t.isotope}: p=${t.protons}, n=${t.neutrons}, e=${t.electrons} (neutral atom, mass number = p+n); the domain atom model derives the element from Z (atom-builder renderer intents)`}};
  }
  if(model.type==='experiment'&&ui.kind==='experiment'){
    let chemistry:{verdict:CheckVerdict;detail:string}={verdict:'NOT_APPLICABLE',detail:'procedural experiment'};
    if(model.executionPlan.runtime==='beta2-advanced'&&c.capability==='electrolysis-experiment'){
      const data=JSON.parse(fs.readFileSync(path.join(root,'content-src/chemistry/electrolysis.json'),'utf8'));
      const r=ElectrolysisModel.from(data).resolve(c.query);
      chemistry=r.modeled?{verdict:'PASS',detail:`electrolysis model resolves ${c.query.electrolyte}(${c.query.phase}, ${c.query.electrode}): cathode ${r.cathode.product}, anode ${r.anode.product} (${data.records.length} modeled electrolyte(s))`}:{verdict:'FAIL',detail:`electrolysis model does not cover ${JSON.stringify(c.query)}`};
    }
    return {commands:ui.controls.map((x:any)=>({kind:'experiment-action',action:{type:x.action}})),chemistry};
  }
  return {commands:[],chemistry:{verdict:'FAIL',detail:`no pilot check for ${model.type}/${model.executionPlan.runtime}`}};
}

function e2eCoverage(base:string,patterns:string[]){
  const dir=path.join(base,'tests/e2e');
  return fs.readdirSync(dir).filter(f=>f.endsWith('.spec.mjs')).sort().filter(f=>{const s=fs.readFileSync(path.join(dir,f),'utf8');return patterns.every(p=>s.includes(p));}).map(f=>`tests/e2e/${f}`);
}

export function signoffState(records:PilotSignoffRecord[],learningUnitId:string,basisHash:string):SignoffState{
  const mine=records.filter(r=>r?.learningUnitId===learningUnitId).sort((a,b)=>String(a.signedAt).localeCompare(String(b.signedAt)));
  const last=mine.at(-1);
  if(!last) return 'NONE';
  const valid=typeof last.reviewerId==='string'&&last.reviewerId.trim()&&!AUTOMATION_IDENTITY.test(last.reviewerId)&&last.role==='pilot-owner'&&['signed_off','rejected'].includes(last.decision)&&Number.isFinite(Date.parse(last.signedAt))&&/^[a-f0-9]{64}$/.test(String(last.basisHash))&&(last.decision==='signed_off'||String(last.comment??'').trim());
  if(!valid) return 'INVALID';
  if(last.basisHash!==basisHash) return 'STALE';
  return last.decision==='signed_off'?'CURRENT':'REJECTED';
}

export async function evaluatePilot(options:{base?:string;sources?:ReadinessSources;signoffs?:PilotSignoffRecord[]}={}){
  const base=options.base??root;
  const src=options.sources??loadSources(base);
  const signoffs=options.signoffs??(JSON.parse(fs.readFileSync(path.join(base,SIGNOFF_FILE),'utf8')).records??[]);
  const {pack}=compileReadiness(src);
  const configs=Object.fromEntries(CONFIG_SOURCE_NAMES.map(n=>[n,src.configs[n]??{}]));
  const verdicts=itemVerdicts(src);
  const pointer=JSON.parse(fs.readFileSync(path.join(base,'public/content/manifest.json'),'utf8'));
  const packManifest=JSON.parse(fs.readFileSync(path.join(base,'public/content',pointer.activeVersion,'manifest.json'),'utf8'));
  const shippedReadiness=JSON.parse(fs.readFileSync(path.join(base,'public/content',pointer.activeVersion,READINESS_PACK_PATH),'utf8'));
  const client=new ContentClient({fetchImpl:diskFetch(base) as any,baseUrl:'/content'});
  const rows:any[]=[];
  for(const {id:lu,reason} of src.pilot.learningUnits as Array<{id:string;reason?:string}>){
    const unit=src.units.find((u:any)=>u.id===lu);
    const mapping=src.mappings.find((m:any)=>m.learningUnitId===lu&&m.role==='primary');
    const activity=src.activities.find((a:any)=>a.id===mapping?.practiceActivityId);
    const readiness=pack.activities.find(a=>a.activityId===activity?.id);
    const unitReadiness=pack.units.find(u=>u.learningUnitId===lu);
    const checks:PilotCheck[]=[];
    const add=(id:string,dimension:PilotCheck['dimension'],kind:PilotCheck['kind'],verdict:CheckVerdict,detail:string)=>checks.push({id,dimension,kind,verdict,detail});
    if(!unit||!mapping||!activity||!readiness){
      add('technical.route','technical','machine','FAIL',`pilot unit ${lu} has no primary practice mapping`);
      const evaluation=derivePilotStatus(checks,'NONE');
      rows.push({learningUnitId:lu,basisHash:sha256(pilotBasis(lu,checks)),checks,...evaluation});continue;
    }
    // ---------------------------------------------------------------- technical (machine)
    const route=deriveActivityExecutionPlan(activity,configs);
    add('technical.route','technical','machine',route.ok?'PASS':'FAIL',route.ok?`${activity.id} → ${route.plan.engine}/${route.plan.runtime} via ${route.plan.configSource}`:`${route.error.code}: ${route.error.detail}`);
    add('technical.runtime-readiness','technical','machine',readiness.runtime==='READY'&&readiness.enforcement==='strict'&&launchDecision(readiness).allowed?'PASS':'FAIL',`runtime ${readiness.runtime}, enforcement ${readiness.enforcement}`);
    let model:any;
    try{ model=await client.loadPractice(activity.id); }catch(e:any){ add('technical.practice-headless','technical','machine','FAIL',`the browser content path refuses the activity: ${e?.code??e?.message}`); }
    if(model){
      const {commands,chemistry}=solutionCommands(model);
      add('technical.chemistry-model','technical','machine',chemistry.verdict,chemistry.detail);
      try{
        const session=new ReferencePracticeSession(model);
        let result:any;
        for(const command of commands) result=await session.apply(command);
        const evidence=(result?.evidence??[]) as any[];
        const invalid=evidence.filter(e=>{try{validateEvidence(e);return false;}catch{return true;}});
        const foreign=evidence.filter(e=>!unit.conceptIds.includes(e.conceptId)&&!mapping.conceptIds.includes(e.conceptId));
        const complete=isPracticeResultComplete(model.type,result);
        const ok=commands.length>0&&complete&&evidence.length>0&&!invalid.length&&!foreign.length&&evidence.every(e=>e.contentVersion===pointer.activeVersion);
        add('technical.practice-headless','technical','machine',ok?'PASS':'FAIL',`browser command path (${commands.length} command(s)): complete=${complete}, evidence=${evidence.length}, invalid=${invalid.length}, outside-unit=${foreign.length}`);
      }catch(e:any){ add('technical.practice-headless','technical','machine','FAIL',`session error: ${e?.message}`); }
    }
    const unitConcepts=new Set(unit.conceptIds);
    const outside=mapping.conceptIds.filter((c:string)=>!unitConcepts.has(c));
    const configConcept=route.ok?String((configs as any)[route.plan.configSource][activity.id]?.conceptId??''):'';
    add('technical.concept-mapping','technical','machine',!outside.length&&mapping.conceptIds.includes(configConcept)?'PASS':'FAIL',outside.length?`mapping concepts outside the unit: ${outside.join(', ')}`:`practice concept ${configConcept} is one of the ${mapping.conceptIds.length} mapped unit concepts`);
    const configVersion=route.ok?String((configs as any)[route.plan.configSource][activity.id]?.version??''):'';
    const versionOk=route.ok&&satisfiesCaret(activity.engineCompatibility?.range??'',configVersion)&&shippedReadiness.schema===READINESS_PACK_SCHEMA&&packManifest.files.some((f:any)=>f.path===READINESS_PACK_PATH)&&activity.version===pointer.activeVersion;
    add('technical.version-compatibility','technical','machine',versionOk?'PASS':'FAIL',`config ${configVersion} vs engine range ${activity.engineCompatibility?.range}; activity ${activity.version} vs pack ${pointer.activeVersion}; readiness ${shippedReadiness.schema}`);
    // ---------------------------------------------------------------- content (human)
    add('content.activity-review','content','human',readiness.content==='APPROVED'?'PASS':readiness.content==='REJECTED'?'FAIL':'PENDING',`human review of ${activity.id}: ${readiness.content}${readiness.content==='APPROVED'?'':` (technical, didactic, accessibility${activity.approvals?.chemistry==='not_applicable'?'':', chemistry'} pending)`}`);
    const chemistryApplies=activity.approvals?.chemistry!=='not_applicable';
    add('content.chemistry-review','content','human',!chemistryApplies?'NOT_APPLICABLE':readiness.reasons.includes('CHEMISTRY_REVIEW_REQUIRED')?'PENDING':'PASS',
      chemistryApplies?`chemistry review of the activity${route.ok&&route.plan.runtime==='beta2-advanced'?' and of the electrolysis model record (reviewStatus pending)':''}`:'governance marks chemistry review not_applicable although the config encodes chemistry facts — recommendation: the pilot owner decides whether a chemistry reviewer must confirm them');
    // ---------------------------------------------------------------- assessment
    const items=verdicts.filter((v:any)=>v.item.learningUnitId===lu&&v.verdict.lifecycle!=='RETIRED');
    const availability=unitReadiness?.assessment.status??'NONE';
    if(!items.length){
      add('assessment.availability','assessment','human','NOT_APPLICABLE','no objective assessment for this unit — the pilot covers runtime, readiness, practice and the no-assessment mastery UX; none is generated');
    }else{
      const approved=items.filter((v:any)=>v.verdict.lifecycle==='APPROVED').length;
      add('assessment.dual-review','assessment','human',approved===items.length?'PASS':'PENDING',`${approved}/${items.length} items APPROVED by two independent reviewers on the current hash; availability ${availability}`);
      const outcomeDecisions=items.map((v:any)=>v.verdict.outcome);
      add('assessment.outcome-review','assessment','human',outcomeDecisions.every((o:string)=>o==='confirm')?'PASS':'PENDING',`outcome mapping decisions: ${[...new Set(outcomeDecisions)].map(o=>`${o}×${outcomeDecisions.filter((x:string)=>x===o).length}`).join(', ')} (the proposed mapping is not final until a didactic reviewer confirms it)`);
      const badMapping=items.filter((v:any)=>v.verdict.reasons.some((r:string)=>['OUTCOME_MAPPING_MISSING','OUTCOME_MAPPING_INVALID','CONCEPT_MAPPING_INVALID','ANSWER_KEY_INVALID','EXPLANATION_MISSING'].includes(r)));
      add('assessment.item-integrity','assessment','machine',badMapping.length?'FAIL':'PASS',badMapping.length?`invalid: ${badMapping.map((v:any)=>`${v.item.id}(${v.verdict.reasons.join('/')})`).join(', ')}`:`${items.length} items: outcome + concept mapping, key and explanation valid`);
      const hashes=new Map(items.map((v:any)=>[v.item.id,assessmentItemHash(v.item)]));
      const stale=src.reviews.filter(r=>hashes.has(r.itemId)&&r.itemHash!==hashes.get(r.itemId));
      add('assessment.stale-reviews','assessment','machine',stale.length?'FAIL':'PASS',stale.length?`review records for an earlier item version: ${stale.map(r=>`${r.itemId}/${r.role}`).join(', ')} — re-review required`:`${src.reviews.filter(r=>hashes.has(r.itemId)).length} review record(s), none stale`);
    }
    // ---------------------------------------------------------------- mastery
    add('mastery.eligible','mastery','machine',unitReadiness?.pilot&&readiness.runtime==='READY'?'PASS':'FAIL','pilot unit with a launchable primary practice shows the mastery band');
    const allMastered=buildMasteryView({learningUnitId:lu,conceptIds:unit.conceptIds,mastery:unit.conceptIds.map((c:string)=>({conceptId:c,evidenceIds:['e'],confidence:1,status:'mastered',scoringVersion:'1'})) as any,countedEvidence:[{id:'e',conceptId:unit.conceptIds[0],evidenceClass:'concept-assessment',source:'a',createdAt:'2026-01-01T00:00:00.000Z'}] as any,attempts:{practiceCompletedOrAbandoned:3,assessment:1},assessmentAvailability:availability});
    const invariant=(allMastered.band==='MASTERED')===(availability==='AVAILABLE');
    add('mastery.no-false-mastery','mastery','machine',invariant?'PASS':'FAIL',`assessment ${availability}: best possible band ${allMastered.band}${availability==='AVAILABLE'?'':' (MASTERED unreachable without an approved assessment)'}`);
    // ---------------------------------------------------------------- ux
    const profile=activity.accessibilityProfile??[];
    add('ux.accessibility-profile','ux','machine',profile.length&&profile.includes('keyboard')?'PASS':'FAIL',`declared: ${profile.join(', ')||'none'}; labels, text state, keyboard controls (human accessibility review is part of content.activity-review)`);
    const practiceE2E=e2eCoverage(base,[activity.id]).concat(e2eCoverage(base,[`/learn/${lu}/practice`])).filter((x,i,a)=>a.indexOf(x)===i).sort();
    add('ux.practice-e2e','ux','machine',practiceE2E.length?'PASS':'FAIL',practiceE2E.length?practiceE2E.join(', '):'no browser E2E exercises this practice');
    const masteryE2E=e2eCoverage(base,[lu,'data-mastery-band']);
    add('ux.mastery-e2e','ux','machine',masteryE2E.length?'PASS':'FAIL',masteryE2E.length?masteryE2E.join(', '):'no browser E2E checks the mastery band');
    const basisHash=sha256(pilotBasis(lu,checks));
    const signoff=signoffState(signoffs,lu,basisHash);
    const evaluation=derivePilotStatus(checks,signoff);
    const v=(id:string)=>checks.find(c=>c.id===id);
    const field=(...ids:string[])=>{const cs=ids.map(v).filter(Boolean) as PilotCheck[];const verdicts=cs.map(c=>c.verdict);return {verdict:verdicts.includes('FAIL')?'FAIL':verdicts.includes('PENDING')?'PENDING':verdicts.includes('PASS')?'PASS':'NOT_APPLICABLE',detail:cs.map(c=>c.detail).join(' | ')};};
    rows.push({
      learningUnitId:lu,title:unit.title,grade:unit.grade,pilotReason:reason??null,
      goldenSlice:items.length?'assessment':null,
      primaryPractice:activity.id,
      summary:{
        route:field('technical.route'),runtimeReadiness:field('technical.runtime-readiness'),chemistryModel:field('technical.chemistry-model','content.chemistry-review'),
        conceptMapping:field('technical.concept-mapping'),outcomeMapping:items.length?field('assessment.item-integrity','assessment.outcome-review'):{verdict:'NOT_APPLICABLE',detail:'no assessment items'},
        assessmentAvailability:{verdict:availability==='AVAILABLE'?'PASS':availability==='PENDING'?'PENDING':'NOT_APPLICABLE',detail:availability},
        assessmentApproval:items.length?field('assessment.dual-review','assessment.stale-reviews'):{verdict:'NOT_APPLICABLE',detail:'no assessment items'},
        practiceE2E:field('technical.practice-headless','ux.practice-e2e'),masteryUX:field('mastery.eligible','mastery.no-false-mastery','ux.mastery-e2e'),
        accessibility:field('ux.accessibility-profile'),versionCompatibility:field('technical.version-compatibility'),
      },
      technical:evaluation.technical,dimensions:evaluation.dimensions,signoff:evaluation.signoff,
      finalPilotStatus:evaluation.status,blockers:evaluation.blockers,pendingHuman:evaluation.pendingHuman,
      basisHash,checks:[...checks].sort((a,b)=>a.id.localeCompare(b.id)),
    });
  }
  const gate=pilotGate(rows.map(r=>r.finalPilotStatus));
  return {
    schema:'kimyolab.pilot-acceptance.v1',
    semantics:'technical = machine checks only; finalPilotStatus combines them with human decisions. PILOT_READY requires a person\'s sign-off on the current basisHash — machine checks alone never produce it.',
    gate,
    pilotLearningUnitIds:rows.map(r=>r.learningUnitId),
    counts:Object.fromEntries(['PILOT_BLOCKED','CONTENT_REVIEW_PENDING','SIGNOFF_PENDING','PILOT_READY'].map(s=>[s,rows.filter(r=>r.finalPilotStatus===s).length])),
    signoffRecords:signoffs.length,
    rows,
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const matrix=await evaluatePilot();
  fs.writeFileSync(path.join(root,MATRIX_FILE),`${JSON.stringify(matrix,null,2)}\n`,'utf8');
  console.log(`pilot:status ${matrix.gate}`);
  for(const r of matrix.rows) console.log(`  ${r.learningUnitId}  ${r.finalPilotStatus}  (${r.technical})${r.blockers.length?`  blockers: ${r.blockers.join('; ')}`:''}`);
  if(matrix.gate==='FAIL') process.exitCode=1;
}
