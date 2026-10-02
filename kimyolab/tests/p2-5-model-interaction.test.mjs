// P2.5 — model-based reaction interaction expansion (ADR-P2-006). The eligibility audit asks the REAL domain what a
// learner could do in each candidate; MODEL_BASED requires per-activity black-swan evidence; no chemistry record was
// added; activities that are not eligible keep their route; progress moves only through the classification rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildModelInteractionExpansion,chemistryDomain,mixOutcome,shelfBlackSwan,activityBlackSwan,CANDIDATE_PACKAGES} from '../scripts/lib/model-interaction.ts';
import {MODEL_INTERACTION_REPORT,P25_CONVERTED} from '../scripts/model-interaction-expansion.ts';
import {classifyActivity} from '../scripts/lib/learning-depth.ts';
import {evaluateIonicMixing} from '../src/domain/chemistry/ionic-mixing.ts';
import {ionicPracticeResult} from '../src/runtime/reference-slices/ionic-practice.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const json=(rel)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const d=chemistryDomain(root);
const report=json(MODEL_INTERACTION_REPORT);
const row=(id)=>report.candidates.find(c=>c.activityId===id);

test('report: current, deterministic, every candidate listed with its facts; nothing hidden',()=>{
  assert.deepEqual(JSON.parse(JSON.stringify(buildModelInteractionExpansion(root,{converted:[...P25_CONVERTED]}))),report,'run npm run model:expansion');
  const pkg=json('reports/p2-work-packages.json').packages.filter(p=>CANDIDATE_PACKAGES.includes(p.id)).flatMap(p=>p.affectedActivities);
  assert.equal(pkg.length,12);
  for(const id of pkg) assert.ok(row(id),`primary candidate ${id} is in the report`);
  assert.equal(report.primaryCandidates,12);
  assert.equal(report.candidateActivities,report.candidates.length);
  for(const c of report.candidates){
    for(const k of ['activityId','learningUnitIds','currentDepth','currentInteraction','domainModule','availableModeledInputs','distinctModeledOutcomes','learnerChoicePossible','rendererReusePossible','governanceBlockers','blackSwan','reasons']) assert.ok(k in c,`${c.activityId}.${k}`);
    assert.equal(c.eligible,c.reasons.length===0);
  }
  assert.equal(report.notConverted.length,report.candidates.length-report.converted.length,'every not-converted candidate is listed with reasons');
});

test('eligibility is derived, not a quota: 0 eligible, 0 converted, MODEL_BASED stays 4 activities / 6 units',()=>{
  assert.deepEqual(report.eligible,[]); assert.deepEqual(report.converted,[]); assert.deepEqual(P25_CONVERTED,[]);
  assert.deepEqual([report.modelBasedActivitiesBefore,report.modelBasedActivitiesAfter,report.modelBasedUnitsBefore,report.modelBasedUnitsAfter],[4,4,6,6]);
  assert.equal(report.chemistryRecordsAdded,0);
  const p=json('reports/project-progress.json');
  assert.equal(p.learningProductProgress.percent,11.688); assert.equal(p.foundationProgress.percent,100);
  const mb=json('reports/learning-depth-baseline.json').activities.filter(a=>a.depth==='MODEL_BASED').map(a=>a.activityId).sort();
  assert.deepEqual(mb,['practice.experiment.8.1','practice.experiment.9.14','practice.simulation.11.11.planned','practice.simulation.7.07.planned']);
});

test('shelves come only from each activity\'s own content: no reagent is invented',()=>{
  const acts=json('content-src/practice-activities.json'); const reactions=new Map(d.reactions.map(r=>[r.id,r]));
  for(const c of report.candidates){
    const a=acts.find(x=>x.id===c.activityId);
    const named=new Set([...c.ownReactionRecords.flatMap(id=>(reactions.get(id)?.reactants??[]).map(r=>r.formula)),...(a.legacyContent?.reagents??[])]);
    for(const sid of c.availableModeledInputs) assert.ok(named.has(d.species.byId(sid).formula),`${c.activityId}: ${sid} is named by the activity's content`);
    for(const e of c.excludedInputs) assert.ok(named.has(e.formula));
  }
  // trainers name no reagents: a shelf for them would be invented content
  for(const id of ['practice.trainer.9.05.planned','practice.trainer.11.10.planned']){
    assert.deepEqual(row(id).availableModeledInputs,[]);
    assert.ok(row(id).reasons.some(r=>r.startsWith('ACTIVITY_TYPE_TRAINER'))); assert.ok(row(id).reasons.some(r=>r.startsWith('NO_CONTENT_DEFINED_REAGENTS')));
  }
});

test('black-swan (positive): the existing model-based activity passes on ITS OWN shelf — two choices, two real outcomes',()=>{
  const bs=activityBlackSwan(root,'practice.experiment.8.1',d);
  assert.equal(bs.pass,true); assert.ok(bs.cleanDistinctOutcomes.length>=2);
  const [p1,p2]=bs.paths;
  const o1=mixOutcome(d,...p1.reagents), o2=mixOutcome(d,...p2.reagents);
  assert.equal(o1.outcome,'reaction'); assert.equal(o2.outcome,'reaction'); assert.notEqual(o1.reactionId,o2.reactionId,'different learner paths reach different domain outcomes');
  // the same two paths through the actual learner domain (ionic-mixing) give different observations
  const domain={species:d.species,matcher:d.matcher,ionic:d.ionic,mixingConditions:d.mixingConditions};
  const shelf=json('content-src/activity-configs/reference-slices.json')['practice.experiment.8.1'].reagentShelf;
  const run=(pair)=>evaluateIonicMixing(domain,{shelf,targetReactionId:'rxn.agno3-nacl',actions:[{type:'selectReagent',payload:{slot:'A',speciesId:pair[0]}},{type:'selectReagent',payload:{slot:'B',speciesId:pair[1]}},{type:'mix'}]}).current;
  assert.notEqual(run(p1.reagents).reactionId,run(p2.reagents).reactionId);
});

test('unmodeled input fails closed: no outcome, no observation, no evidence about the learner',()=>{
  const bs=activityBlackSwan(root,'practice.experiment.8.1',d);
  assert.ok(bs.unmodeledPair);
  assert.equal(mixOutcome(d,...bs.unmodeledPair).outcome,'not-modeled');
  const domain={species:d.species,matcher:d.matcher,ionic:d.ionic,mixingConditions:d.mixingConditions};
  const shelf=json('content-src/activity-configs/reference-slices.json')['practice.experiment.8.1'].reagentShelf;
  const meta={conceptId:'c',activityId:'practice.experiment.8.1',activityVersion:'1',contentVersion:'1',scoringVersion:'1',createdAt:'2026-10-02T00:00:00Z'};
  const r=ionicPracticeResult({domain,shelf,targetReactionId:'rxn.agno3-nacl',meta,actions:[{type:'selectReagent',payload:{slot:'A',speciesId:bs.unmodeledPair[0]}},{type:'selectReagent',payload:{slot:'B',speciesId:bs.unmodeledPair[1]}},{type:'mix'}]});
  assert.equal(r.finalState.ionic.current.outcome,'not-modeled'); assert.equal(r.finalState.ionic.current.observations,null);
  assert.equal(r.evidence.filter(e=>e.type==='observation').length,0,'an unmodeled pair is not chemistry evidence');
  assert.equal(r.finalState.status,'in_progress');
});

test('black-swan (negative): one outcome, or a second outcome resting on a KB-flagged observation, is never MODEL_BASED',()=>{
  // 8.9's own shelf (AgNO3, NaCl) reaches one outcome
  assert.equal(row('practice.experiment.8.9').blackSwan.pass,false);
  assert.deepEqual(shelfBlackSwan(d,['species.agno3','species.nacl']).cleanDistinctOutcomes,['rxn.agno3-nacl']);
  // 8.6 / 9.16 reach two outcomes, but NaOH + HCl's observation ("colour change", no colour, no indicator on the shelf)
  // is flagged CHEMISTRY_REVIEW_REQUIRED by the KB's own integrity check — it cannot be shown to learners as the evidence
  for(const id of ['practice.experiment.8.6','practice.experiment.9.16']){
    const c=row(id);
    assert.deepEqual(c.distinctModeledOutcomes,['rxn.naoh-hcl','rxn.zncl2-naoh']); assert.deepEqual(c.flaggedOutcomes,['rxn.naoh-hcl']);
    assert.equal(c.eligible,false); assert.ok(c.reasons[0].startsWith('BLACK_SWAN_FAIL'));
    assert.deepEqual(c.ownRecordsUnreachableInMixingModel,['rxn.znoh2-hcl'],'the taught amphoteric step is out of the solution-mixing model');
  }
  assert.ok(d.flagged.has('rxn.naoh-hcl')&&d.flagged.has('rxn.znoh2-hcl'));
  // the classification rule itself: a registry renderer without black-swan evidence is GUIDED, never MODEL_BASED
  assert.equal(classifyActivity({uiKind:'registry',runtime:'reference-slice',capability:'x',registry:true,blackSwan:false,hardening:null,modules:[],steps:0}).depth,'GUIDED');
  assert.equal(classifyActivity({uiKind:'registry',runtime:'reference-slice',capability:'x',registry:true,blackSwan:true,hardening:null,modules:[],steps:0}).depth,'MODEL_BASED');
});

test('per-activity rule: an activity bound to the reaction renderer cannot inherit the reference activity\'s evidence',()=>{
  const src=fs.readFileSync(path.join(root,'scripts/lib/learning-depth.ts'),'utf8');
  assert.match(src,/capability==='ionic-precipitation'\)\{ const r=activityBlackSwan\(root,activityId\)/,'classification asks the activity\'s own shelf');
  assert.equal(activityBlackSwan(root,'practice.experiment.8.10',d),null,'no shelf → no model-based evidence');
});

test('routes unchanged: no candidate was re-routed, the only reaction-mixing shelf is still 8.1, no chemistry added',()=>{
  const guided=json('content-src/activity-configs/guided-labs.json'), ref=json('content-src/activity-configs/reference-slices.json');
  for(const c of report.candidates.filter(c=>c.type==='experiment'&&c.source==='work-package')) assert.ok(guided[c.activityId],`${c.activityId} keeps its guided config`);
  const shelves=[];
  for(const f of fs.readdirSync(path.join(root,'content-src/activity-configs'))) for(const [id,c] of Object.entries(json(`content-src/activity-configs/${f}`))) if(Array.isArray(c?.reagentShelf)) shelves.push(id);
  assert.deepEqual(shelves,['practice.experiment.8.1']);
  assert.equal(ref['practice.experiment.8.1'].rendererRequirement.capability,'ionic-precipitation');
  assert.equal(d.reactions.length,28,'reaction records unchanged');
  const rules=json('content-src/chemistry/solubility.json').dissociation.map(x=>x.formula);
  for(const f of ['NaBr','NaI','KBr','KI']) assert.ok(!rules.includes(f),`no dissociation rule was added for ${f} to unlock a candidate`);
});

test('unlock facts are facts about existing records, framed as human chemistry work — never as data the agent added',()=>{
  assert.match(report.unlockSemantics,/human chemistry work/);
  const u=report.unlockSummary.find(x=>x.activityId==='practice.experiment.8.8');
  assert.deepEqual(u.unlockFacts.map(f=>[f.formula,f.existingRecordsWithThisSpecies]),[['NaBr',['rxn.agno3-nabr']],['NaI',['rxn.agno3-nai']]]);
  for(const f of report.unlockSummary.flatMap(x=>x.unlockFacts)) for(const id of f.existingRecordsWithThisSpecies) assert.ok(d.reactions.some(r=>r.id===id),`${id} exists`);
});
