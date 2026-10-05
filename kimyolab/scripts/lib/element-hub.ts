// P2.13 — builds the Element Hub (kimyolab.element-hub.v1, ADR-P2-014) from canonical repository sources only.
//   identity      src/domain/chemistry/periodic-table.ts (ELEMENT_SYMBOLS) — the only element list
//   display       src/domain/chemistry/periodic-layout.ts — cell position only; NOT a scientific claim
//   period/group  the layout rule as a scientific ASSERTION (scripts/lib/element-governance.ts): shown to a learner only
//                 when a registered, human-accepted source backs it and a human approved its exact hash; else a gap
//   e-config      src/domain/chemistry/electron-configuration.ts (ENGINE_COMPUTED inside its proven range only)
//   metadata      content-src/periodic/element-metadata.json — registry source ids; the review state comes from the
//                 human decision register content-src/periodic/element-reviews.json, never from the record
//   relations     species.json formulas (formula parser) → reactions.json participants → guided-step reaction map and
//                 topic lab profiles (labs) → mapping-links (topics); content-src/periodic/element-relations.json
//                 (typed targets, reviewed like metadata; only an effectively reviewed relation reaches the learner)
// No keyword or title matching, no inference: a relation exists only where a canonical record states it.
import fs from 'node:fs';
import path from 'node:path';
import {ELEMENT_SYMBOLS} from '../../src/domain/chemistry/periodic-table.ts';
import {displayPosition,isFBlock,layoutColumn,layoutRow,LAYOUT_RULE} from '../../src/domain/chemistry/periodic-layout.ts';
import {electronConfigurationStatus} from '../../src/domain/chemistry/electron-configuration.ts';
import {parseFormula} from '../../src/domain/chemistry/formula-parser.ts';
import {parseSourceRegistry} from '../../src/domain/governance/source-policy.ts';
import {ELEMENT_HUB_SCHEMA,ELEMENT_METADATA_SCHEMA,type ElementHub,type HubElement,type HubField,type HubRelation,type GapReason} from '../../src/features/periodic/hub.ts';
import {compileTopicLabProfiles} from './topic-lab-profiles.ts';
import {elementAssertion,METADATA_FIELDS,parseElementMetadata,parseElementRelations,parseElementReviews,relationRole,scientificState,type MetadataField,type RelationTargetType,type ScientificState} from './element-governance.ts';

const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
export {METADATA_FIELDS};
export const PERIOD_GROUP_ASSERTION_ID='periodic.period-group-rule';

/** the governance facts the reports need (never shipped to the learner) */
export interface HubGovernance {
  periodGroupRule:{assertionId:string;hash:string;state:ScientificState;review:string;sourceRefs:string[];unreviewedDerivation:{period:number;group:number}};
  metadata:Array<{symbol:string;field:MetadataField;hash:string;state:ScientificState;review:string;sources:Array<{id:string;title:string;category:string;eligible:boolean}>}>;
  relations:Array<{element:string;kind:string;targetType:RelationTargetType;targetId:string;hash:string;state:ScientificState;review:string}>;
}

/** Elements of a formula by the canonical parser, or null when the text is not a parseable formula. */
export function formulaElements(formula:string):string[]|null{
  try{ return Object.keys(parseFormula(formula).atoms).sort(); }catch{ return null; }
}

/** `inputs` replaces a governed file with an in-memory document — used only by tests to exercise the governance on
 *  fixtures (the build always reads the repository files). */
export interface HubInputs { sourceRegistry?:unknown; reviews?:unknown; metadata?:unknown; relations?:unknown }
export function buildElementHub(root:string,inputs:HubInputs={}):{hub:ElementHub;stats:{unparsedSubstances:string[];unparsedReactionFormulas:string[]};governance:HubGovernance}{
  const {registry,issues}=parseSourceRegistry(inputs.sourceRegistry??readJson(root,'content-src/source-registry.json'));
  if(issues.length) throw new Error(`SOURCE_REGISTRY_INVALID:${issues.join(',')}`);
  const reviews=parseElementReviews(inputs.reviews??readJson(root,'content-src/periodic/element-reviews.json'));
  const metadata=parseElementMetadata(inputs.metadata??readJson(root,'content-src/periodic/element-metadata.json'),registry);
  const species=readJson(root,'content-src/chemistry/species.json') as any[];
  const reactions=readJson(root,'content-src/chemistry/reactions.json') as any[];
  const stepMap=readJson(root,'content-src/chemistry/guided-step-reaction-map.json') as Record<string,Record<string,string|string[]>>;
  const activities=readJson(root,'content-src/practice-activities.json') as any[];
  const mappings=readJson(root,'content-src/mapping-links.json') as any[];
  const units=readJson(root,'content-src/learning-units.json') as any[];
  const {profiles}=compileTopicLabProfiles(root);

  // substances: canonical species whose formula the parser reads
  const unparsedSubstances:string[]=[];
  const substanceElements=new Map<string,string[]>();
  for(const s of species){ const els=formulaElements(s.formula); if(els) substanceElements.set(s.id,els); else unparsedSubstances.push(s.id); }

  // reactions: the elements of their participants' formulas
  const unparsedReactionFormulas:string[]=[];
  const reactionElements=new Map<string,string[]>();
  for(const r of reactions){
    const els=new Set<string>();
    for(const part of [...r.reactants,...r.products]){
      const e=formulaElements(part.formula); if(e) e.forEach(x=>els.add(x)); else unparsedReactionFormulas.push(`${r.id}:${part.formula}`);
    }
    reactionElements.set(r.id,[...els].sort());
  }

  // labs: species on a topic lab profile's shelf, reactions in the guided-step reaction map
  const labSpecies=new Map<string,Set<string>>(), labReactions=new Map<string,Set<string>>();
  const add=(m:Map<string,Set<string>>,k:string,v:string)=>{ if(!m.has(k)) m.set(k,new Set()); m.get(k)!.add(v); };
  for(const p of profiles) for(const s of p.substances??[]) if(s.speciesId&&substanceElements.has(s.speciesId)) add(labSpecies,p.activityId,s.speciesId);
  for(const [activityId,steps] of Object.entries(stepMap)) for(const v of Object.values(steps)) for(const rid of [v].flat()) if(reactionElements.has(rid)) add(labReactions,activityId,rid);
  const labIds=[...new Set([...labSpecies.keys(),...labReactions.keys()])].filter(id=>activities.some(a=>a.id===id)).sort();
  const labTopics=new Map(labIds.map(id=>[id,[...new Set(mappings.filter(m=>m.practiceActivityId===id).map(m=>m.learningUnitId))].sort()]));
  const topicIds=new Set([...labTopics.values()].flat());

  // authored relations: closed target types, targets that exist in their canonical registry
  const targets:Record<RelationTargetType,ReadonlySet<string>>={SUBSTANCE:new Set(species.map(s=>s.id)),REACTION:new Set(reactions.map(r=>r.id)),TOPIC:new Set(units.map(u=>u.id)),LAB:new Set(activities.filter(a=>a.type==='experiment').map(a=>a.id))};
  const authored=parseElementRelations(inputs.relations??readJson(root,'content-src/periodic/element-relations.json'),targets,registry).map(r=>{
    const a=elementAssertion(`relation.${r.element}.${r.kind}.${r.targetType}.${r.targetId}`,'element-relation',{element:r.element,kind:r.kind,targetType:r.targetType,targetId:r.targetId},r.sourceRefs,relationRole(r.targetType));
    return {...r,assertion:a,...scientificState(a,registry,reviews)};
  });

  // period / group: one compact assertion over the whole layout rule (no 118 duplicated rows)
  const rule=elementAssertion(PERIOD_GROUP_ASSERTION_ID,'periodic-layout-rule',LAYOUT_RULE,metadata.periodGroupRuleSourceRefs);
  const ruleState=scientificState(rule,registry,reviews);
  const gapOf=(st:ScientificState):GapReason=>st==='SOURCE_NOT_ELIGIBLE'?'SOURCE_NOT_ELIGIBLE':st==='REVIEW_PENDING'?'REVIEW_PENDING':'SOURCE_REQUIRED';
  const sourcesOf=(xs:Array<{id:string;title:string;eligible:boolean}>)=>xs.filter(x=>x.eligible).map(x=>({id:x.id,title:x.title}));
  const metaGov:HubGovernance['metadata']=[];

  const field=<T,>(symbol:string,name:MetadataField):HubField<T>=>{
    const f=metadata.entries[symbol]?.[name];
    if(!f) return {status:'GAP',reason:'SOURCE_REQUIRED'};
    const a=elementAssertion(`metadata.${symbol}.${name}`,'element-metadata',{symbol,field:name,value:f.value},f.sourceRefs);
    const st=scientificState(a,registry,reviews);
    metaGov.push({symbol,field:name,hash:a.hash,state:st.state,review:st.review,sources:st.sources});
    // only an effectively reviewed claim backed by an eligible source reaches the learner as a value
    return st.state==='REVIEWED'?{status:'REVIEWED',value:f.value as T,sources:sourcesOf(st.sources)}:{status:'GAP',reason:gapOf(st.state)};
  };
  const ruleField=(value:number|null,fBlock:boolean):HubField<number>=>{
    if(ruleState.state!=='REVIEWED') return {status:'GAP',reason:gapOf(ruleState.state)};
    return value===null?{status:'GAP',reason:fBlock?'F_BLOCK_GROUP_CONVENTION':'SOURCE_REQUIRED'}:{status:'REVIEWED',value,sources:sourcesOf(ruleState.sources)};
  };
  const rel=(id:string,provenance:HubRelation['provenance'],via:string[]=[],kind:HubRelation['kind']='PARTICIPATES'):HubRelation=>({id,kind,provenance,via:[...via].sort()});

  const elements:HubElement[]=ELEMENT_SYMBOLS.map((symbol,i)=>{
    const z=i+1, pos=displayPosition(z), ec=electronConfigurationStatus(z);
    const subs=[...substanceElements].filter(([,els])=>els.includes(symbol)).map(([id])=>id).sort();
    const rxns=[...reactionElements].filter(([,els])=>els.includes(symbol)).map(([id])=>id).sort();
    const labs=labIds.map(id=>({id,via:[...[...(labSpecies.get(id)??[])].filter(s=>subs.includes(s)),...[...(labReactions.get(id)??[])].filter(r=>rxns.includes(r))]})).filter(l=>l.via.length);
    const topics=new Map<string,string[]>();
    for(const l of labs) for(const t of labTopics.get(l.id)??[]){ if(!topics.has(t)) topics.set(t,[]); topics.get(t)!.push(l.id); }
    return {
      z,symbol,display:{row:pos.row,column:pos.column},
      period:ruleField(layoutRow(z),false),
      group:ruleField(layoutColumn(z),isFBlock(z)),
      relativeAtomicMass:field<number>(symbol,'relativeAtomicMass'),
      category:field<string>(symbol,'category'),
      electronConfiguration:ec.status==='COMPUTED'?{status:'COMPUTED',value:ec.value,provenance:'ENGINE_COMPUTED'}:{status:'GAP',reason:ec.reason},
      oxidationStates:field<number[]>(symbol,'oxidationStates'),
      teachingDescription:field<string>(symbol,'teachingDescription'),
      relations:{
        substances:subs.map(id=>rel(id,'DERIVED_FROM_FORMULA')),
        reactions:rxns.map(id=>rel(id,'DERIVED_FROM_FORMULA')),
        labs:labs.map(l=>rel(l.id,'EXPLICIT_MAPPING',l.via)),
        topics:[...topics].sort(([a],[b])=>a.localeCompare(b)).map(([id,via])=>rel(id,'EXPLICIT_MAPPING',via)),
        // an authored PRIMARY / RELATED relation reaches the learner only when it is effectively reviewed
        authored:authored.filter(r=>r.element===symbol&&r.state==='REVIEWED').map(r=>({...rel(r.targetId,'AUTHORED_RELATION',[],r.kind),targetType:r.targetType})),
      },
    };
  });
  const usedSubs=new Set(elements.flatMap(e=>e.relations.substances.map(r=>r.id)));
  const usedRx=new Set(elements.flatMap(e=>e.relations.reactions.map(r=>r.id)));
  const hub:ElementHub={
    schema:ELEMENT_HUB_SCHEMA,metadataSchema:ELEMENT_METADATA_SCHEMA,elements,
    substances:species.filter(s=>usedSubs.has(s.id)).map(s=>({id:s.id,formula:s.formula,nameKey:s.nameKey})),
    reactions:reactions.filter(r=>usedRx.has(r.id)).map(r=>({id:r.id,equation:r.molecularEquation})),
    labs:labIds.map(id=>({id,title:activities.find(a=>a.id===id)!.title})),
    topics:units.filter(u=>topicIds.has(u.id)).map(u=>({id:u.id,grade:Number(u.grade),title:u.title})),
  };
  const governance:HubGovernance={
    periodGroupRule:{assertionId:rule.id,hash:rule.hash,state:ruleState.state,review:ruleState.review,sourceRefs:rule.sourceRefs,
      unreviewedDerivation:{period:ELEMENT_SYMBOLS.length,group:ELEMENT_SYMBOLS.filter((_,i)=>layoutColumn(i+1)!==null).length}},
    metadata:metaGov,
    relations:authored.map(r=>({element:r.element,kind:r.kind,targetType:r.targetType,targetId:r.targetId,hash:r.assertion.hash,state:r.state,review:r.review})),
  };
  return {hub,stats:{unparsedSubstances,unparsedReactionFormulas},governance};
}
