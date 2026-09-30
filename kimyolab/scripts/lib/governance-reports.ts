// P1.9 governance reports — deterministic, derived from content + human registers only:
//   reports/authoring-status.json · reports/release-decision-status.json · reports/human-action-queue.json ·
//   reports/golden-slice-dependency-graph.json · review-packets/release-decisions/ (packet for the pending activities)
// They describe what PEOPLE still have to do. Nothing here decides, approves, releases or signs off.
import fs from 'node:fs';
import path from 'node:path';
import {buildWorkbenchModel,type WorkbenchModel} from './review-workbench.ts';
import {deriveAuthoringTasks,authoringStatus,AUTHORING_REPORT} from './authoring.ts';
import {releaseEntries,RELEASE_PACKET_DIR,type ReleaseEntry} from './release.ts';
import type {AuthoringTask} from '../../src/domain/governance/authoring-task.ts';

export const GOVERNANCE_REPORTS={
  authoring:AUTHORING_REPORT,
  release:'reports/release-decision-status.json',
  actions:'reports/human-action-queue.json',
  goldenGraph:'reports/golden-slice-dependency-graph.json',
};
const readOptional=(root:string,rel:string,fallback:any)=>fs.existsSync(path.join(root,rel))?JSON.parse(fs.readFileSync(path.join(root,rel),'utf8')):fallback;

export function releaseDecisionStatus(entries:ReleaseEntry[],root:string){
  const matrix=readOptional(root,'reports/pilot-acceptance-matrix.json',{rows:[]});
  const count=(f:(e:ReleaseEntry)=>boolean)=>entries.filter(f).length;
  const pending=entries.filter(e=>e.runtime==='PENDING');
  return {
    schema:'kimyolab.release-decision-status.v1',
    semantics:'Machine eligibility (ELIGIBLE | NOT_ELIGIBLE) is a precondition, never a decision. Only a content owner (a person) releases, keeps pending, disables or sends back an activity, pinned to its basis hash. A release decision never replaces the pilot owner sign-off.',
    totals:{activities:entries.length,eligible:count(e=>e.eligibility.status==='ELIGIBLE'),notEligible:count(e=>e.eligibility.status==='NOT_ELIGIBLE'),released:count(e=>e.releaseState==='RELEASED'),keepPending:count(e=>e.releaseState==='KEEP_PENDING'),disabled:count(e=>e.releaseState==='DISABLED'),changeRequired:count(e=>e.releaseState==='CHANGE_REQUIRED'),decisionMissing:count(e=>e.releaseState==='DECISION_MISSING'),staleDecision:count(e=>e.releaseState==='STALE')},
    pendingActivities:{count:pending.length,eligible:pending.filter(e=>e.eligibility.status==='ELIGIBLE').length,decisionMissing:pending.filter(e=>e.releaseState==='DECISION_MISSING').length,packet:`${RELEASE_PACKET_DIR}/packet.json`},
    notEligibleReasons:Object.fromEntries([...new Set(entries.flatMap(e=>e.eligibility.reasons.map(r=>r.split(':')[0]!)))].sort().map(r=>[r,entries.filter(e=>e.eligibility.reasons.some(x=>x.split(':')[0]===r)).length])),
    pilot:entries.filter(e=>e.pilot).map(e=>{ const row=(matrix.rows??[]).find((r:any)=>r.primaryPractice===e.activityId); return {activityId:e.activityId,learningUnits:e.learningUnits,technicalReady:row?.technical==='TECHNICAL_PASS',contentApproved:e.content==='APPROVED',eligibility:e.eligibility.status,releaseDecision:e.releaseState,pilotSignoff:row?.signoff??'NONE',pilotStatus:row?.finalPilotStatus??null,separateGates:'release decision (content owner) and pilot sign-off (pilot owner) are separate human decisions'}; }),
    globalStrictEnforcement:false,
    activities:entries.map(e=>({activityId:e.activityId,runtime:e.runtime,content:e.content,eligibility:e.eligibility.status,releaseState:e.releaseState,basisHash:e.basisHash})),
  };
}

export function releasePacket(entries:ReleaseEntry[]){
  const pending=entries.filter(e=>e.runtime==='PENDING');
  return {
    schema:'kimyolab.release-decision-packet.v1',
    semantics:'For the content owner. Every activity below is technically launchable only after a human release decision. Machine eligibility is shown; it is not a recommendation to release. Decisions are exported from the workbench (Release decisions tab) and imported with npm run review:import.',
    count:pending.length,
    activities:pending.map(e=>({
      activityId:e.activityId,title:e.title,learningUnits:e.learningUnits,runtimeReadiness:e.runtime,runtimeReasons:e.runtimeReasons,contentReviewStatus:e.content,reviews:e.reviews,
      accessibility:{profile:e.accessibilityProfile,review:e.reviews.accessibility},route:e.route,engine:e.engine,renderer:e.renderer,dependencies:e.dependencies,currentLifecycle:e.lifecycleStatus,
      basisHash:e.basisHash,eligibility:e.eligibility,releaseState:e.releaseState,
      releaseRecommendation:{decision:null,rationale:null,filledBy:'content owner (a person) — tooling recommends nothing'},
    })),
  };
}

function releasePacketReadme(p:ReturnType<typeof releasePacket>){
  return ['# Release decisions — packet (P1.9)','',
    '> Faqat **content owner** (inson) uchun. Machine eligibility — shart, qaror emas. Agent `RELEASE` qarorini bermaydi.','',
    `Kutilayotgan activity’lar: **${p.count}**. Har biri \`packet.json\`da: activityId, LU, runtime readiness, content review, accessibility, route, engine, renderer, bog‘liqliklar, lifecycle, basisHash, eligibility.`,'',
    '1. Workbench → **Release decisions** tabi (rol: `content-owner`).',
    '2. Qaror: `RELEASE` (faqat ELIGIBLE bo‘lsa), `KEEP_PENDING`, `DISABLE`, `CHANGE_REQUIRED` — `RELEASE`dan boshqasi uchun izoh majburiy.',
    '3. Eksport → `npm run review:validate -- <fayl>` → inson `npm run review:import -- <fayl>`.',
    '4. Content o‘zgarsa basisHash o‘zgaradi va qaror **STALE** bo‘ladi.','',
    'Release qarori pilot owner sign-off’ining o‘rnini bosmaydi.',''].join('\n');
}

export function humanActionQueue(model:WorkbenchModel,tasks:AuthoringTask[],entries:ReleaseEntry[],root:string){
  const matrix=readOptional(root,'reports/pilot-acceptance-matrix.json',{rows:[]});
  const noSource=new Set(tasks.filter(t=>t.action==='add-source'&&t.status!=='CLOSED'&&t.status!=='SUPERSEDED').map(t=>t.targetId));
  const items:any[]=[];
  const push=(x:any)=>items.push(x);
  // 1 review chemistry — by priority group; the provenance blocker is shown, not hidden
  for(const p of ['A','B','C','D','E'] as const){
    const xs=model.chemistry.filter(a=>a.priority===p&&a.reviewStatus!=='approved');
    if(!xs.length) continue;
    const blocked=xs.filter(a=>noSource.has(a.id)).length;
    push({kind:'review-chemistry',priority:p,role:'chemistry',count:xs.length,targetIds:xs.map(a=>a.id),
      blockedBy:blocked?[`SOURCE_NOT_ACCEPTABLE: ${blocked}/${xs.length} cite no acceptable source — an approval would not count until a source is added`]:[],
      nextHumanAction:`Chemistry reviewer: review ${xs.length} pending assertion(s) in queue ${p} (workbench → Kimyo KB, filter “${p}”).`});
  }
  // 2 review assessment — per item
  for(const a of model.assessment) if(a.lifecycle!=='APPROVED'){
    const roles=(['chemistry','didactic'] as const).filter(r=>(a.review as any)[r]!=='approved');
    push({kind:'review-assessment',priority:'B',role:roles.join('+'),count:1,targetIds:[a.itemId],blockedBy:a.flags.length?[`MAPPING_REVIEW_REQUIRED on ${a.itemId}`]:[],
      nextHumanAction:`${roles.map(r=>r==='chemistry'?'Chemistry':'Didactic').join(' and ')} reviewer (two different people): review ${a.itemId} on the current hash${roles.includes('didactic')?' and decide the outcome mapping':''}.`});
  }
  // 3 fix mapping / 4 correct content / author candidate / prepare release — from authoring tasks
  const open=tasks.filter(t=>t.status==='OPEN'||t.status==='IN_PROGRESS');
  for(const t of open.filter(t=>t.action==='map-concept'||t.action==='map-outcome')) push({kind:'fix-mapping',priority:t.priority,role:'didactic',count:1,targetIds:[t.targetId],taskId:t.id,blockedBy:t.reviewerDecision?[]:['no didactic reviewer decision yet — the author cannot choose a concept'],
    nextHumanAction:t.reviewerDecision?`Author: apply the didactic reviewer’s mapping decision for ${t.targetId} (npm run authoring:draft -- ${t.id}).`:`Didactic reviewer: decide the concept/outcome mapping of ${t.targetId} (question text names a concept it is not mapped to).`});
  for(const t of open.filter(t=>t.action==='correct')) push({kind:'correct-content',priority:t.priority,role:'author',count:1,targetIds:[t.targetId],taskId:t.id,blockedBy:[],nextHumanAction:`Author: correct ${t.targetId} as the reviewer asked (“${t.reviewerComment??''}”), then request a new review.`});
  // 5 add source — grouped by file
  const byFile=new Map<string,AuthoringTask[]>();
  for(const t of open.filter(t=>t.action==='add-source')) byFile.set(t.affectedFiles[0]??'?',[...(byFile.get(t.affectedFiles[0]??'?')??[]),t]);
  for(const [file,ts] of [...byFile.entries()].sort(([a],[b])=>a.localeCompare(b))) push({kind:'add-source',priority:ts.map(t=>t.priority).sort()[0],role:'author',count:ts.length,targetIds:ts.map(t=>t.targetId),file,blockedBy:[],
    nextHumanAction:`Author: cite an acceptable, registered source (content-src/source-registry.json) for ${ts.length} claim(s) in ${file}.`});
  // 6 author candidate — accepted candidates; pending triage
  for(const t of open.filter(t=>t.action==='author-candidate')) push({kind:'author-candidate',priority:t.priority,role:'author',count:1,targetIds:[t.targetId],taskId:t.id,blockedBy:[],nextHumanAction:`Author: write the accepted candidate ${t.context.pair??t.targetId} as a reaction / no-reaction record in a reviewed PR (draft: npm run authoring:draft -- ${t.id}).`});
  const untriaged=model.candidates.filter(c=>c.reviewStatus==='pending');
  if(untriaged.length) push({kind:'triage-candidates',priority:'B',role:'chemistry',count:untriaged.length,targetIds:untriaged.map(c=>c.candidateId),blockedBy:[],nextHumanAction:`Chemistry reviewer: triage ${untriaged.length} candidate(s) (accept for authoring / reject / needs evidence) in the workbench → Kimyo nomzodlari.`});
  for(const t of open.filter(t=>t.action==='prepare-release')) push({kind:'prepare-release',priority:t.priority,role:'author',count:1,targetIds:[t.targetId],taskId:t.id,blockedBy:[],nextHumanAction:`Author: address the content owner’s release CHANGE_REQUIRED for ${t.targetId}.`});
  // 7 decide release — per pending activity
  for(const e of entries.filter(e=>e.runtime==='PENDING'&&e.releaseState!=='RELEASED'&&e.releaseState!=='DISABLED'))
    push({kind:'decide-release',priority:'C',role:'content-owner',count:1,targetIds:[e.activityId],blockedBy:e.eligibility.reasons,
      nextHumanAction:e.eligibility.status==='ELIGIBLE'?`Content owner: decide the release of ${e.activityId} (RELEASE / KEEP_PENDING / DISABLE / CHANGE_REQUIRED).`:`Content owner: ${e.activityId} is NOT_ELIGIBLE (${e.eligibility.reasons.slice(0,2).join(', ')}${e.eligibility.reasons.length>2?', …':''}); decide KEEP_PENDING / DISABLE / CHANGE_REQUIRED, or wait for its reviews.`});
  // 8 sign off pilot
  for(const r of matrix.rows??[]) if(r.signoff!=='CURRENT') push({kind:'sign-off-pilot',priority:'C',role:'pilot-owner',count:1,targetIds:[r.learningUnitId],blockedBy:r.finalPilotStatus==='SIGNOFF_PENDING'?[]:[...(r.pendingHuman??[]),...(r.blockers??[])].map((x:string)=>x.split(':')[0]),
    nextHumanAction:r.finalPilotStatus==='SIGNOFF_PENDING'?`Pilot owner: sign off ${r.learningUnitId} on basisHash ${String(r.basisHash).slice(0,12)}… in a pull request.`:`Pilot owner: nothing to sign yet for ${r.learningUnitId} — ${r.pendingHuman?.length??0} human check(s) pending first.`});
  const order=['review-chemistry','review-assessment','fix-mapping','correct-content','add-source','author-candidate','triage-candidates','prepare-release','decide-release','sign-off-pilot'];
  items.sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind)||String(a.priority).localeCompare(String(b.priority))||String(a.targetIds[0]).localeCompare(String(b.targetIds[0])));
  return {
    schema:'kimyolab.human-action-queue.v1',
    semantics:'What PEOPLE need to do next, in order. Every item names its role, its blockers (never hidden) and one next action. Tooling does none of these actions.',
    counts:Object.fromEntries(order.map(k=>[k,items.filter(i=>i.kind===k).length])),
    items:items.map((x,i)=>({rank:i+1,...x})),
  };
}

/** Machine-readable DAG from human decisions to PILOT_READY for the golden-slice unit. */
export function goldenSliceGraph(model:WorkbenchModel,tasks:AuthoringTask[],entries:ReleaseEntry[],root:string){
  const lu=model.goldenSlice;
  const row=(readOptional(root,'reports/pilot-acceptance-matrix.json',{rows:[]}).rows??[]).find((r:any)=>r.learningUnitId===lu);
  const check=(id:string)=>row?.checks?.find((c:any)=>c.id===id);
  const items=model.assessment.filter(a=>a.learningUnitId===lu);
  const activity=entries.find(e=>e.activityId===row?.primaryPractice);
  const electro=model.chemistry.filter(c=>c.category==='electrolysis'&&c.priority==='C');
  const sourceTask=tasks.filter(t=>t.action==='add-source'&&electro.some(e=>e.id===t.targetId)&&t.status!=='CLOSED');
  const pass=(b:boolean)=>b?'PASS':'PENDING';
  const nodes=[
    {id:'practice-technical',kind:'machine',status:row?.technical==='TECHNICAL_PASS'?'PASS':'FAIL',detail:row?.technical??'no pilot row'},
    {id:'electrolysis-source',kind:'human',status:pass(!sourceTask.length),detail:sourceTask.length?`add an acceptable source for ${electro.map(e=>e.id).join(', ')} (${sourceTask.length} add-source task)`:'acceptable provenance cited'},
    {id:'electrolysis-chemistry-review',kind:'human',status:pass(electro.length>0&&electro.every(e=>e.reviewStatus==='approved')),detail:electro.map(e=>`${e.id}: ${e.reviewStatus}`).join('; ')},
    {id:'activity-content-review',kind:'human',status:check('content.activity-review')?.verdict??'PENDING',detail:`technical/didactic/accessibility/chemistry of ${row?.primaryPractice}: ${activity?JSON.stringify(activity.reviews):'?'}`},
    {id:'activity-content-approved',kind:'derived',status:activity?.content==='APPROVED'?'PASS':'PENDING',detail:`content ${activity?.content}`},
    {id:'release-decision',kind:'human',status:activity?.releaseState==='RELEASED'?'PASS':'PENDING',detail:`content owner: ${activity?.releaseState} (eligibility ${activity?.eligibility.status}); separate from the pilot sign-off`},
    {id:'mapping-review',kind:'human',status:pass(!items.some(i=>i.flags.length&&i.outcome!=='confirm')),detail:`MAPPING_REVIEW_REQUIRED: ${items.filter(i=>i.flags.length).map(i=>i.itemId).join(', ')||'none'}`},
    {id:'assessment-chemistry-review',kind:'human',status:pass(items.length>0&&items.every(i=>i.review.chemistry==='approved')),detail:`${items.filter(i=>i.review.chemistry==='approved').length}/${items.length}`},
    {id:'assessment-didactic-review',kind:'human',status:pass(items.length>0&&items.every(i=>i.review.didactic==='approved')),detail:`${items.filter(i=>i.review.didactic==='approved').length}/${items.length} (a different person)`},
    {id:'outcome-mapping',kind:'human',status:pass(items.length>0&&items.every(i=>i.outcome==='confirm')),detail:`${items.filter(i=>i.outcome==='confirm').length}/${items.length} confirmed`},
    {id:'assessment-available',kind:'derived',status:pass(items.length>0&&items.every(i=>i.lifecycle==='APPROVED')),detail:'unit assessment AVAILABLE ⇒ MASTERED reachable'},
    {id:'pilot-signoff-pending',kind:'derived',status:row?.finalPilotStatus==='SIGNOFF_PENDING'||row?.finalPilotStatus==='PILOT_READY'?'PASS':'PENDING',detail:`pilot status ${row?.finalPilotStatus}`},
    {id:'pilot-owner-signoff',kind:'human',status:row?.signoff==='CURRENT'?'PASS':'PENDING',detail:`sign-off ${row?.signoff??'NONE'}`},
    {id:'pilot-ready',kind:'derived',status:row?.finalPilotStatus==='PILOT_READY'?'PASS':'PENDING',detail:'PILOT_READY'},
  ];
  const edges:Array<[string,string]>=[
    ['electrolysis-source','electrolysis-chemistry-review'],
    ['electrolysis-chemistry-review','activity-content-approved'],['activity-content-review','activity-content-approved'],
    ['activity-content-approved','release-decision'],
    ['mapping-review','outcome-mapping'],
    ['assessment-chemistry-review','assessment-available'],['assessment-didactic-review','assessment-available'],['outcome-mapping','assessment-available'],
    ['practice-technical','pilot-signoff-pending'],['activity-content-approved','pilot-signoff-pending'],['electrolysis-chemistry-review','pilot-signoff-pending'],['assessment-available','pilot-signoff-pending'],
    ['pilot-signoff-pending','pilot-owner-signoff'],['pilot-owner-signoff','pilot-ready'],
  ];
  const status=new Map(nodes.map(n=>[n.id,n.status]));
  const upstream=(id:string):string[]=>edges.filter(([,b])=>b===id).flatMap(([a])=>[a,...upstream(a)]);
  return {
    schema:'kimyolab.golden-slice-dependency-graph.v1',
    learningUnitId:lu,primaryPractice:row?.primaryPractice??null,
    note:'The release decision is a separate human gate (content owner); PILOT_READY needs the pilot owner sign-off — neither replaces the other.',
    nodes:nodes.map(n=>({...n,blockedBy:[...new Set(upstream(n.id))].filter(u=>status.get(u)!=='PASS').sort()})),
    edges:edges.map(([from,to])=>({from,to})),
    pendingHuman:nodes.filter(n=>n.kind==='human'&&n.status!=='PASS').map(n=>n.id),
    nextUnblocked:nodes.filter(n=>n.status!=='PASS'&&upstream(n.id).every(u=>status.get(u)==='PASS')).map(n=>n.id),
  };
}

export function writeGovernanceReports(root:string,model:WorkbenchModel=buildWorkbenchModel(root)){
  const tasks=deriveAuthoringTasks(root,model);
  const entries=releaseEntries(root);
  const write=(rel:string,body:unknown)=>{ fs.mkdirSync(path.dirname(path.join(root,rel)),{recursive:true}); fs.writeFileSync(path.join(root,rel),typeof body==='string'?body:`${JSON.stringify(body,null,2)}\n`,'utf8'); };
  const packet=releasePacket(entries);
  write(GOVERNANCE_REPORTS.authoring,authoringStatus(tasks));
  write(GOVERNANCE_REPORTS.release,releaseDecisionStatus(entries,root));
  write(GOVERNANCE_REPORTS.actions,humanActionQueue(model,tasks,entries,root));
  write(GOVERNANCE_REPORTS.goldenGraph,goldenSliceGraph(model,tasks,entries,root));
  write(`${RELEASE_PACKET_DIR}/packet.json`,packet);
  write(`${RELEASE_PACKET_DIR}/README.md`,releasePacketReadme(packet));
  return {tasks,entries};
}
