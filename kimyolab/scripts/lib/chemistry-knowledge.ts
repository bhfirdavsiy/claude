// P2.14 — builds the Substance / Reaction knowledge index (kimyolab.chemistry-knowledge.v1, ADR-P2-015) from the one
// canonical chemistry graph (scripts/lib/chemistry-graph.ts) and the existing governance — nothing is authored here.
//   identity       SpeciesRegistry over species.json (formula + phase + charge + variant + allotrope; never formula alone)
//   composition    the canonical formula parser (DERIVED); a species "formula" the parser cannot read is a gap
//   molar mass     only from atomic masses a human reviewed against an eligible source (P2.13 Element Hub); else a gap —
//                  legacy masses are never read and no value is rounded or approximated
//   dissociation   IonicEngine.dissociate (the solution rules); no rule → DISSOCIATION_NOT_MODELED (not "does not")
//   hazards/props  species.json values are operational migration data; a learner sees them only as a reviewed fact,
//                  which needs an eligible source and a review path — today a gap with its reason
//   reactions      reactions.json stays the runtime record (ReactionMatcher reads it); here only the derived facts:
//                  resolved participants, vocabulary requirements, observation integrity (the KB's own check), the
//                  ionic equation where IonicEngine.support() is supported:true, and the review state from the
//                  chemistry decision register (kb-review: current hash, human reviewer, stale on edit)
//   relations      the graph's: Element ↔ Substance ↔ Reaction ↔ Lab ↔ Topic, each with its provenance
import fs from 'node:fs';
import path from 'node:path';
import {IonicEngine} from '../../src/domain/chemistry/ionic-engine.ts';
import {isNoReaction} from '../../src/domain/chemistry/reaction-matcher.ts';
import {parseFormula} from '../../src/domain/chemistry/formula-parser.ts';
import {dimensionsOf,parseConditionVocabulary} from '../../src/domain/chemistry/condition-vocabulary.ts';
import {parseReviewRegister,reviewStateOf,type ReviewState} from '../../src/domain/chemistry/kb-review.ts';
import {parseSourceRegistry,sourceAcceptance,type SourceRegistry} from '../../src/domain/governance/source-policy.ts';
import {CHEMISTRY_KNOWLEDGE_SCHEMA,SUBSTANCE_KEY,SPECIES_ID_PREFIX,substanceKey,type KnowledgeField,type KnowledgeGap,type KnowledgeIndex,type KnowledgeReaction,type KnowledgeRelation,type KnowledgeSubstance} from '../../src/features/chemistry-knowledge/knowledge.ts';
import {deriveChemistryGraph,type ChemistryGraphInputs} from './chemistry-graph.ts';
import {buildAssertions,loadKb} from './chemistry-kb.ts';
import {buildElementHub,type HubInputs} from './element-hub.ts';

const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
/** legacy sourceRefs are objects ({id,type,title}) or ids; only the id is kept — the registry is the authority for
 *  title, category and acceptance (a deterministic adapter: an id the registry does not know stays unregistered) */
export const refIds=(refs:unknown[]|undefined)=>[...new Set((refs??[]).map(r=>typeof r==='string'?r:(r as any)?.id).filter((x):x is string=>typeof x==='string'&&x.length>0))].sort();

export type SourceState='SOURCE_REQUIRED'|'SOURCE_NOT_ELIGIBLE'|'SOURCE_ELIGIBLE';
export function sourceStateOf(ids:readonly string[],registry:SourceRegistry){
  const sources=ids.map(id=>{ const e=registry.byId.get(id); return {id,registered:Boolean(e),title:e?.title??null,category:e?.category??null,eligible:sourceAcceptance(e,'chemistry').canonicalAuthoringEligible}; });
  const state:SourceState=!sources.some(s=>s.registered)?'SOURCE_REQUIRED':sources.some(s=>s.eligible)?'SOURCE_ELIGIBLE':'SOURCE_NOT_ELIGIBLE';
  return {state,sources};
}

/** Exact decimal sum (no float drift, no rounding): every input keeps its own decimals. */
export function decimalSum(terms:Array<{value:number;count:number}>):string{
  const parts=terms.map(t=>{ const [i,f='']=String(t.value).split('.'); if(!/^\d+$/.test(i!)||!/^\d*$/.test(f)) throw new Error(`MOLAR_MASS_VALUE_INVALID:${t.value}`); return {i:i!,f,count:t.count}; });
  const scale=Math.max(0,...parts.map(p=>p.f.length));
  let total=0n;
  for(const p of parts) total+=BigInt(p.i+p.f.padEnd(scale,'0'))*BigInt(p.count);
  const s=total.toString().padStart(scale+1,'0');
  return scale?`${s.slice(0,-scale)}.${s.slice(-scale)}`:s;
}

/** `inputs` replaces a governed file with an in-memory document — used only by tests (the build reads the repo). */
export interface KnowledgeInputs extends ChemistryGraphInputs { hub?:HubInputs; sourceRegistry?:unknown; chemistryReviews?:unknown }

export interface ReactionGovernance { id:string; noReaction:boolean; assertionId:string; hash:string; review:ReviewState; source:SourceState; sourceRefs:string[]; reviewed:boolean; observationFlags:string[]; conditionAssertion:string|null }
export interface SubstanceGovernance { id:string; source:SourceState; sourceRefs:string[]; hazardsClaimed:number; propertiesClaimed:number }

export function buildChemistryKnowledge(root:string,inputs:KnowledgeInputs={}){
  const g=deriveChemistryGraph(root,inputs);
  const sourceRegistryRaw=inputs.sourceRegistry??readJson(root,'content-src/source-registry.json');
  const {registry,issues}=parseSourceRegistry(sourceRegistryRaw);
  if(issues.length) throw new Error(`SOURCE_REGISTRY_INVALID:${issues.join(',')}`);
  const register=parseReviewRegister(inputs.chemistryReviews??readJson(root,'content-src/chemistry-reviews.json'));
  // an invalid decision (automation reviewer, extra field, bad hash …) fails the build — it is never dropped silently
  if(register.issues.length) throw new Error(`CHEMISTRY_REVIEW_REGISTER_INVALID:${register.issues.join(',')}`);
  const vocabulary=parseConditionVocabulary(readJson(root,'content-src/chemistry/condition-vocabulary.json'));
  const solubility=readJson(root,'content-src/chemistry/solubility.json');
  const ionic=IonicEngine.from({reactions:g.reactions,rules:solubility});
  const {hub}=buildElementHub(root,{...(inputs.hub??{}),...(inputs.sourceRegistry?{sourceRegistry:inputs.sourceRegistry}:{})});
  // the KB's own assertions (hash over what is claimed + sources) over THESE records
  const kb={...loadKb(root),species:g.species as any[],reactions:g.reactions as any[],register:inputs.chemistryReviews??readJson(root,'content-src/chemistry-reviews.json'),sourceRegistryRaw};
  const assertions=new Map(buildAssertions(kb).map(a=>[a.id,a]));

  const rel=(id:string,via:string[]):KnowledgeRelation=>({id,via:[...new Set(via)].sort()});
  const gap=<T,>(reason:KnowledgeGap):KnowledgeField<T>=>({status:'GAP',reason});

  // ------------------------------------------------------------ substances
  const keys=new Set<string>();
  const substanceGov:SubstanceGovernance[]=[];
  const substances:KnowledgeSubstance[]=g.species.map(s=>{
    if(!s.id.startsWith(SPECIES_ID_PREFIX)) throw new Error(`SUBSTANCE_ID_NAMESPACE:${s.id}`);
    const key=substanceKey(s.id);
    if(!SUBSTANCE_KEY.test(key)||keys.has(key)) throw new Error(`SUBSTANCE_KEY_INVALID:${s.id}`);
    keys.add(key);
    let atoms:Record<string,number>|null=null;
    try{ atoms=parseFormula(s.formula).atoms; }catch{ atoms=null; }
    const composition:KnowledgeField<Record<string,number>>=atoms?{status:'DERIVED',value:Object.fromEntries(Object.entries(atoms).sort(([a],[b])=>a.localeCompare(b))),provenance:'FORMULA_PARSER'}:gap('FORMULA_NOT_PARSEABLE');
    // molar mass: every element's atomic mass must be REVIEWED in the Element Hub (never a legacy or rounded value)
    let molarMass:KnowledgeField<string>=gap(atoms?'ATOMIC_MASS_NOT_REVIEWED':'FORMULA_NOT_PARSEABLE');
    if(atoms){
      const masses=Object.entries(atoms).map(([el,count])=>{ const f=hub.elements.find(e=>e.symbol===el)!.relativeAtomicMass; return f.status==='REVIEWED'?{value:f.value,count}:null; });
      if(masses.every(m=>m!==null)) molarMass={status:'COMPUTED',value:decimalSum(masses as Array<{value:number;count:number}>),provenance:'REVIEWED_ATOMIC_MASSES'};
    }
    const d=ionic.dissociate(s.formula);
    const dissociation:KnowledgeField<Array<{formula:string;coefficient:number}>>=d.modeled?{status:'MODEL',value:d.ions!,provenance:'CANONICAL_MODEL'}:gap('DISSOCIATION_NOT_MODELED');
    // hazards / properties: no review path exists for them yet, so even an eligible source leaves them pending
    const src=sourceStateOf(refIds(s.sourceRefs),registry);
    const claimGap=(claimed:boolean):KnowledgeGap=>!claimed||src.state==='SOURCE_REQUIRED'?'SOURCE_REQUIRED':src.state==='SOURCE_NOT_ELIGIBLE'?'SOURCE_NOT_ELIGIBLE':'REVIEW_PENDING';
    const hazards=gap<string[]>(claimGap(s.hazards.length>0));
    const properties=gap<Record<string,string|number|boolean>>(claimGap(Object.keys(s.properties??{}).length>0));
    substanceGov.push({id:s.id,source:src.state,sourceRefs:refIds(s.sourceRefs),hazardsClaimed:s.hazards.length,propertiesClaimed:Object.keys(s.properties??{}).length});

    const reactions=[...(g.substanceReactions.get(s.id)??[])].sort();
    const labs=g.labIds.map(id=>{
      const via=[...(g.labSpecies.get(id)?.has(s.id)?['topic-lab-profile:shelf']:[]),...reactions.filter(r=>g.labReactions.get(id)?.has(r))];
      return {id,via};
    }).filter(l=>l.via.length);
    const topics=new Map<string,string[]>();
    for(const l of labs) for(const t of g.labTopics.get(l.id)??[]){ if(!topics.has(t)) topics.set(t,[]); topics.get(t)!.push(l.id); }
    return {id:s.id,key,composition,molarMass,dissociation,hazards,properties,relations:{
      elements:[...(g.substanceElements.get(s.id)??[])],
      reactions,
      labs:labs.map(l=>rel(l.id,l.via)),
      topics:[...topics].sort(([a],[b])=>a.localeCompare(b)).map(([id,via])=>rel(id,via)),
    }};
  });

  // ------------------------------------------------------------ reactions
  const reactionGov:ReactionGovernance[]=[];
  const reactions:KnowledgeReaction[]=g.reactions.map(r=>{
    const noReaction=isNoReaction(r);
    const dims=dimensionsOf(r.conditions?.tags??[],vocabulary);
    if(dims.unknown.length||dims.conflicts.length) throw new Error(`REACTION_CONDITION_UNKNOWN:${r.id}:${[...dims.unknown,...dims.conflicts].join(',')}`);
    const a=assertions.get(`${noReaction?'no-reaction':'reaction'}:${r.id}`)!;
    const obs=assertions.get(`observation:${r.id}`)!;
    const review=reviewStateOf(a,register.records).state;
    const src=sourceStateOf(refIds(r.sourceRefs),registry);
    const reviewed=review==='approved'&&src.state==='SOURCE_ELIGIBLE';
    reactionGov.push({id:r.id,noReaction,assertionId:a.id,hash:a.hash,review,source:src.state,sourceRefs:refIds(r.sourceRefs),reviewed,observationFlags:obs.flags,conditionAssertion:assertions.has(`condition:${r.id}`)?`condition:${r.id}`:null});
    const observations:KnowledgeField<unknown[]>=!(r.observations??[]).length?gap('OBSERVATION_MISSING'):obs.flags.includes('CHEMISTRY_REVIEW_REQUIRED')?gap('OBSERVATION_REVIEW_REQUIRED'):{status:'MODEL',value:r.observations,provenance:'CANONICAL_MODEL'};
    let ionicEquation:KnowledgeField<string>=gap('IONIC_NOT_SUPPORTED');
    if(!noReaction&&ionic.support(r.id).supported) ionicEquation={status:'COMPUTED',value:ionic.netIonicEquation(r.id).equation,provenance:'ENGINE_COMPUTED'};
    const p=g.participants.get(r.id)!;
    const labs=g.labIds.filter(id=>g.labReactions.get(id)?.has(r.id));
    const topics=new Map<string,string[]>();
    for(const l of labs) for(const t of g.labTopics.get(l)??[]){ if(!topics.has(t)) topics.set(t,[]); topics.get(t)!.push(l); }
    return {id:r.id,
      participants:{reactants:p.reactants.map(x=>x.speciesId),products:p.products.map(x=>x.speciesId)},
      requirements:dims.dimensions,observations,ionicEquation,review:reviewed?'REVIEWED':'MODEL_RECORD',
      relations:{
        elements:[...(g.reactionElements.get(r.id)??[])],
        labs:labs.map(l=>rel(l,['guided-step-reaction-map'])),
        topics:[...topics].sort(([x],[y])=>x.localeCompare(y)).map(([id,via])=>rel(id,via)),
      }};
  });

  // ------------------------------------------------------------ the condition dimensions a learner may state
  const dimValues=new Map<string,Set<string>>();
  const addDim=(d:string,v:string)=>{ if(!dimValues.has(d)) dimValues.set(d,new Set()); dimValues.get(d)!.add(v); };
  for(const t of Object.values(vocabulary.terms)) addDim(t.dimension,t.value);
  for(const c of Object.values(vocabulary.contexts)) for(const [d,v] of Object.entries(c.dimensions)) addDim(d,v);
  const conditions=[...dimValues].sort(([a],[b])=>a.localeCompare(b)).map(([dimension,values])=>({dimension,values:[...values].sort()}));

  const labIds=new Set([...substances.flatMap(s=>s.relations.labs.map(l=>l.id)),...reactions.flatMap(r=>r.relations.labs.map(l=>l.id))]);
  const topicIds=new Set([...substances.flatMap(s=>s.relations.topics.map(l=>l.id)),...reactions.flatMap(r=>r.relations.topics.map(l=>l.id))]);
  const index:KnowledgeIndex={schema:CHEMISTRY_KNOWLEDGE_SCHEMA,substances,reactions,conditions,
    labs:[...labIds].sort().map(id=>({id,title:g.activities.find(a=>a.id===id)!.title})),
    topics:g.units.filter(u=>topicIds.has(u.id)).map(u=>({id:u.id,grade:Number(u.grade),title:u.title}))};
  return {index,graph:g,governance:{substances:substanceGov,reactions:reactionGov},vocabularyReview:vocabulary.reviewStatus};
}
