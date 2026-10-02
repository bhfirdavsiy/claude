// P2.5 — model-based reaction interaction expansion: the ELIGIBILITY AUDIT and the per-activity BLACK-SWAN rule
// (ADR-P2-006). Both ask the REAL domain (ReactionMatcher, IonicEngine, SpeciesRegistry, solution-mixing conditions —
// the calls src/domain/chemistry/ionic-mixing.ts makes) what a learner could actually do. Nothing here adds chemistry:
//   - a candidate's reagent shelf comes only from what the activity's own reviewed content names (its guided steps'
//     reaction records and its legacy reagent list), filtered to reagents the ionic-mixing seam can model (solutions
//     with dissociation rules);
//   - an outcome counts only if its reaction record's observation passes the KB's structural integrity check (a record
//     flagged CHEMISTRY_REVIEW_REQUIRED for its observation cannot be the evidence that "choice changes the outcome");
//   - unmodeled pairs stay "not modeled" (fail closed) and are counted, never turned into outcomes.
// A candidate is ELIGIBLE only if it is an experiment, its shelf has ≥2 reagents, its pairs reach ≥2 DISTINCT
// integrity-clean modeled outcomes, and one of its own reaction records (clean, net ionic equation computable) is
// reachable as the completion target. Eligibility is a fact; whether to convert is still checked against curriculum
// semantics (an eligible activity whose conversion would drop taught steps is reported, not converted).
import fs from 'node:fs';
import path from 'node:path';
import {ReactionMatcher,classifyMatch} from '../../src/domain/chemistry/reaction-matcher.ts';
import {IonicEngine} from '../../src/domain/chemistry/ionic-engine.ts';
import {SpeciesRegistry} from '../../src/domain/chemistry/species-registry.ts';
import {parseConditionVocabulary} from '../../src/domain/chemistry/condition-vocabulary.ts';
import {loadKb,buildAssertions} from './chemistry-kb.ts';

const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));

/** The P2.0 work packages that name reaction-matcher / ionic-engine reuse are the primary candidates (not a quota). */
export const CANDIDATE_PACKAGES=['wp.model-renderer.reaction-matcher','wp.model-renderer.ionic-engine'];

export function chemistryDomain(root:string){
  const reactions=readJson(root,'content-src/chemistry/reactions.json') as any[];
  const solubility=readJson(root,'content-src/chemistry/solubility.json');
  const vocabulary=parseConditionVocabulary(readJson(root,'content-src/chemistry/condition-vocabulary.json'));
  const mixing=vocabulary.contexts['solution-mixing'];
  const species=readJson(root,'content-src/chemistry/species.json') as any[];
  // observation integrity flags, from the KB's own structural check (scripts/lib/chemistry-kb.ts)
  const flagged=new Set(buildAssertions(loadKb(root)).filter(a=>a.category==='observation'&&a.flags.includes('CHEMISTRY_REVIEW_REQUIRED')).map(a=>a.id.replace(/^observation:/,'')));
  return {
    reactions,flagged,
    speciesByFormula:new Map<string,string>(species.map(s=>[s.formula,s.id])),
    species:SpeciesRegistry.from(species),
    matcher:ReactionMatcher.from(reactions,{vocabulary}),
    ionic:IonicEngine.from({reactions,rules:solubility}),
    mixingConditions:{dimensions:{...(mixing?.dimensions??{})}},
  };
}
export type ChemistryDomain=ReturnType<typeof chemistryDomain>;

/** The real mixing outcome of two reagents (the same matcher call as ionic-mixing.ts). */
export function mixOutcome(d:ChemistryDomain,a:string,b:string):{outcome:'reaction'|'no-reaction'|'not-modeled';reactionId:string|null;code?:string}{
  const A=d.species.byId(a)!, B=d.species.byId(b)!;
  const m=d.matcher.match({reactants:[{formula:A.formula,phase:'aq'},{formula:B.formula,phase:'aq'}],conditions:d.mixingConditions,conditionPolicy:'require-record-conditions'});
  return m.modeled?{outcome:classifyMatch(m)==='MODELED_NO_REACTION'?'no-reaction':'reaction',reactionId:m.reaction.id}:{outcome:'not-modeled',reactionId:null,code:m.code};
}

/** Every pair of a shelf with its real outcome, and the black-swan verdict (≥2 distinct integrity-clean outcomes). */
export function shelfBlackSwan(d:ChemistryDomain,shelf:readonly string[]){
  const pairs:Array<{reagents:[string,string];outcome:string;reactionId:string|null;flagged:boolean}>=[];
  for(let i=0;i<shelf.length;i++) for(let j=i+1;j<shelf.length;j++){ const o=mixOutcome(d,shelf[i]!,shelf[j]!); pairs.push({reagents:[shelf[i]!,shelf[j]!],outcome:o.outcome,reactionId:o.reactionId,flagged:Boolean(o.reactionId&&d.flagged.has(o.reactionId))}); }
  const modeled=pairs.filter(p=>p.outcome!=='not-modeled');
  const distinct=[...new Set(modeled.map(p=>p.reactionId!))].sort();
  const clean=distinct.filter(id=>!d.flagged.has(id));
  const pathOf=(id:string)=>({reagents:modeled.find(p=>p.reactionId===id)!.reagents,reactionId:id});
  return {pairs,modeledPairs:modeled.length,notModeledPairs:pairs.length-modeled.length,distinctOutcomes:distinct,cleanDistinctOutcomes:clean,flaggedOutcomes:distinct.filter(id=>d.flagged.has(id)),
    pass:clean.length>=2,paths:clean.slice(0,2).map(pathOf),unmodeledPair:pairs.find(p=>p.outcome==='not-modeled')?.reagents??null};
}

/** The per-activity black-swan of a registry-bound ionic-precipitation activity: ITS shelf, not the capability's. */
export function activityBlackSwan(root:string,activityId:string,d=chemistryDomain(root)){
  for(const f of fs.readdirSync(path.join(root,'content-src/activity-configs')).filter(f=>f.endsWith('.json')).sort()){
    const c=readJson(root,`content-src/activity-configs/${f}`)[activityId];
    if(c&&Array.isArray(c.reagentShelf)){ const r=shelfBlackSwan(d,c.reagentShelf); return {...r,evidence:`activity shelf (${c.reagentShelf.length} reagents): ${r.cleanDistinctOutcomes.length} distinct integrity-clean modeled outcome(s) [${r.cleanDistinctOutcomes.join(', ')}]`}; }
  }
  return null;
}

function ownReactions(root:string,activityId:string):string[]{
  const map=readJson(root,'content-src/chemistry/guided-step-reaction-map.json')[activityId]??{};
  const out:string[]=[];
  for(const step of Object.keys(map).sort((a,b)=>Number(a)-Number(b))) for(const id of [map[step]].flat()) if(!out.includes(id)) out.push(id);
  return out;
}

export function auditActivity(root:string,d:ChemistryDomain,a:any,baseline:any,source:string){
  const own=ownReactions(root,a.id);
  const reactionById=new Map(d.reactions.map(r=>[r.id,r]));
  const named=new Map<string,string>();
  for(const id of own) for(const r of reactionById.get(id)?.reactants??[]) if(r.formula&&!named.has(r.formula)) named.set(r.formula,`reaction record ${id}`);
  for(const f of a.legacyContent?.reagents??[]) if(!named.has(f)) named.set(f,'legacy reagent list');
  const shelf:string[]=[]; const excluded:Array<{formula:string;from:string;reason:string;speciesId:string|null}>=[];
  for(const [formula,from] of named){
    const sid=d.speciesByFormula.get(formula)??null;
    if(!sid){ excluded.push({formula,from,reason:'NOT_IN_SPECIES_REGISTRY',speciesId:null}); continue; }
    if(!d.ionic.dissociate(formula).modeled){ excluded.push({formula,from,reason:'NO_DISSOCIATION_RULE',speciesId:sid}); continue; }
    shelf.push(sid);
  }
  const bs=shelfBlackSwan(d,shelf);
  const equationOk=(id:string)=>{ try{ return d.ionic.support(id).supported&&Boolean(d.ionic.netIonicEquation(id).equation); }catch{ return false; } };
  const reachable=new Set(bs.pairs.filter(p=>p.outcome==='reaction').map(p=>p.reactionId!));
  const target=own.find(id=>reachable.has(id)&&!d.flagged.has(id)&&equationOk(id))??null;
  // facts, not proposals: which EXISTING reaction records involve each excluded species. Whether that species belongs on a
  // solution-mixing shelf (a reviewed dissociation rule) or needs a different interaction model (a solid, gas or metal
  // reagent) is a chemistry decision for a person
  const unlock=excluded.filter(e=>e.reason==='NO_DISSOCIATION_RULE').map(e=>{
    const ids=new Set<string>(); for(const s of [...shelf,...excluded.filter(x=>x.speciesId&&x!==e).map(x=>x.speciesId!)]){ const o=mixOutcome(d,e.speciesId!,s); if(o.reactionId) ids.add(o.reactionId); }
    return {formula:e.formula,speciesId:e.speciesId,existingRecordsWithThisSpecies:[...ids].sort()};
  }).filter(u=>u.existingRecordsWithThisSpecies.length);
  const reasons:string[]=[];
  if(a.type!=='experiment') reasons.push(`ACTIVITY_TYPE_${String(a.type).toUpperCase()}: the ionic-precipitation renderer drives experiments; converting would change what the activity is`);
  if(!own.length&&!(a.legacyContent?.reagents??[]).length) reasons.push('NO_CONTENT_DEFINED_REAGENTS: the activity names no reagents or reaction records; any shelf would be invented content');
  if(shelf.length<2) reasons.push(`SHELF_TOO_SMALL: ${shelf.length} modeled solution reagent(s) — no learner choice`);
  if(bs.cleanDistinctOutcomes.length<2) reasons.push(`BLACK_SWAN_FAIL: ${bs.cleanDistinctOutcomes.length} distinct integrity-clean modeled outcome(s)${bs.flaggedOutcomes.length?` (+${bs.flaggedOutcomes.length} whose observation the KB flags CHEMISTRY_REVIEW_REQUIRED: ${bs.flaggedOutcomes.join(', ')})`:''} — choice cannot be shown to change the result`);
  if(!target) reasons.push('NO_REACHABLE_TARGET: none of the activity\'s own reaction records is reachable from the shelf with a clean observation and a computable net ionic equation — completion unreachable');
  const lostSteps=own.filter(id=>!reachable.has(id));
  return {activityId:a.id,source,learningUnitIds:baseline?.learningUnits??[],type:a.type,currentDepth:baseline?.depth??null,currentInteraction:baseline?.interaction??null,
    domainModule:'reaction-matcher + ionic-engine (src/domain/chemistry/ionic-mixing.ts)',ownReactionRecords:own,
    availableModeledInputs:shelf,excludedInputs:excluded,pairs:bs.pairs.length,modeledPairs:bs.modeledPairs,notModeledPairs:bs.notModeledPairs,
    distinctModeledOutcomes:bs.distinctOutcomes,cleanDistinctModeledOutcomes:bs.cleanDistinctOutcomes,flaggedOutcomes:bs.flaggedOutcomes,
    learnerChoicePossible:shelf.length>=2&&bs.distinctOutcomes.length>=2,rendererReusePossible:a.type==='experiment',targetReactionId:target,
    ownRecordsUnreachableInMixingModel:lostSteps,
    governanceBlockers:['chemistry review of the reaction records (human, pending)','content/didactic review of the activity (human, pending)'],
    blackSwan:{pass:bs.pass,paths:bs.paths,unmodeledPair:bs.unmodeledPair},unlockFacts:unlock,eligible:!reasons.length,reasons};
}

export function buildModelInteractionExpansion(root:string,{converted=[] as string[]}={}){
  const d=chemistryDomain(root);
  const baseline=readJson(root,'reports/learning-depth-baseline.json');
  const activities=readJson(root,'content-src/practice-activities.json') as any[];
  const packageIds:string[]=readJson(root,'reports/p2-work-packages.json').packages.filter((p:any)=>CANDIDATE_PACKAGES.includes(p.id)).flatMap((p:any)=>p.affectedActivities);
  const base=(id:string)=>baseline.activities.find((x:any)=>x.activityId===id);
  const primary=packageIds.map(id=>auditActivity(root,d,activities.find(a=>a.id===id),base(id),'work-package'));
  // every other non-model-based experiment with ≥2 modeled solution reagents is scanned too: no opportunity hidden
  const scanned=activities.filter(a=>a.type==='experiment'&&!packageIds.includes(a.id)&&base(a.id)?.depth!=='MODEL_BASED').map(a=>auditActivity(root,d,a,base(a.id),'repository-scan'))
    .filter(r=>r.availableModeledInputs.length>=2);
  const all=[...primary,...scanned];
  const reasonCodes=Object.fromEntries(Object.entries(all.flatMap(r=>r.reasons.map(x=>x.split(':')[0]!)).reduce((m:any,k)=>(m[k]=(m[k]??0)+1,m),{})).sort());
  const mb=baseline.activities.filter((a:any)=>a.depth==='MODEL_BASED');
  const units=(xs:any[])=>[...new Set(xs.flatMap((a:any)=>a.learningUnits))].sort();
  const parity=fs.existsSync(path.join(root,'reports/host-parity.json'))?readJson(root,'reports/host-parity.json'):null;
  return {schema:'kimyolab.model-interaction-expansion.v1',
    semantics:'Eligibility of model-based reaction interaction, from the real domain. Shelves come only from each activity\'s own content; outcomes count only when their observation passes the KB integrity check; unmodeled pairs fail closed. Converted = activities whose route was changed in this repository. No chemistry record was added.',
    candidateActivities:all.length,primaryCandidates:primary.length,repositoryScanCandidates:scanned.length,
    eligible:all.filter(r=>r.eligible).map(r=>r.activityId),converted,
    notConverted:all.filter(r=>!converted.includes(r.activityId)).map(r=>({activityId:r.activityId,reasons:r.reasons.length?r.reasons:['ELIGIBLE_BUT_NOT_CONVERTED: see ADR-P2-006']})),
    reasons:reasonCodes,
    modelBasedActivitiesBefore:mb.length,modelBasedActivitiesAfter:mb.length+converted.length,
    modelBasedUnitsBefore:units(mb).length,modelBasedUnitsAfter:units([...mb,...all.filter(r=>converted.includes(r.activityId)).map(r=>({learningUnits:r.learningUnitIds}))]).length,
    blackSwanPass:Object.fromEntries(converted.map(id=>[id,all.find(r=>r.activityId===id)?.blackSwan.pass??false])),
    existingModelBasedBlackSwan:mb.filter((a:any)=>a.renderer?.capability==='ionic-precipitation').map((a:any)=>{ const {pairs,...r}=activityBlackSwan(root,a.activityId,d) as any; return {activityId:a.activityId,...r}; }),
    hostParity:parity?.summary??null,
    chemistryRecordsAdded:0,
    unlockSemantics:'For each candidate: reagents its content names that the solution-mixing seam excludes (no dissociation rule), with the EXISTING reaction records that involve them. Not a proposal: whether a species gets a reviewed dissociation rule, or the activity needs another interaction model (solid/gas/metal reagents, heating), is human chemistry work.',
    unlockSummary:all.filter(r=>r.unlockFacts.length).map(r=>({activityId:r.activityId,unlockFacts:r.unlockFacts})),
    candidates:all};
}
