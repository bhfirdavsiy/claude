// P2.14 — Reaksiya izlagich view logic (ADR-P2-015). Pure: no DOM. The ONLY reaction truth is the existing
// ReactionMatcher over the canonical reaction records, under the explicit 'require-record-conditions' policy:
//   MODELED_REACTION      a record matches the reagents and its conditions hold in the STATED conditions
//   MODELED_NO_REACTION   only an explicit canonical no-reaction record
//   NOT_MODELED           the model has no record for these reagents — never "they do not react"
// A condition the learner did not state is never assumed; when records exist for the reagents but their conditions
// are not (all) stated, the outcome names exactly the conditions the records require. Nothing is guessed: not a
// phase (the canonical species' own phase is used), not a species (an ambiguous formula asks the learner), not a
// condition (an unknown value is refused).
import {classifyMatch,conditionRequirementFields,ReactionMatcher} from '../../domain/chemistry/reaction-matcher.ts';
import {SpeciesRegistry} from '../../domain/chemistry/species-registry.ts';
import {parseFormula} from '../../domain/chemistry/formula-parser.ts';
import {dimensionsOf,parseConditionVocabulary,type ConditionVocabulary} from '../../domain/chemistry/condition-vocabulary.ts';
import {SPECIES_ID_PREFIX,substanceKey,type KnowledgeIndex} from './knowledge.ts';
import type {ReactionConditions,ReactionRecord,Species} from '../../domain/chemistry/types.ts';
import type {SearchIndexEntry} from '../search/model.ts';

export const MAX_REAGENTS=4;
export const MAX_FORMULA_INPUT=40;

export type FormulaResolution=
  | {status:'FOUND';speciesId:string}
  | {status:'AMBIGUOUS';speciesIds:string[]}
  | {status:'NOT_FOUND'}
  | {status:'INVALID'};

/** A typed formula → a canonical species. The text must be a formula the canonical parser reads; it is looked up as
 *  written (no case folding, no rewriting). Several species with that formula → the learner chooses; none → not found. */
export function resolveFormulaInput(registry:SpeciesRegistry,text:string):FormulaResolution{
  const t=text.trim();
  if(!t||t.length>MAX_FORMULA_INPUT) return {status:'INVALID'};
  try{ parseFormula(t); }catch{ return {status:'INVALID'}; }
  const all=registry.byFormula(t);
  if(!all.length) return {status:'NOT_FOUND'};
  if(all.length>1) return {status:'AMBIGUOUS',speciesIds:all.map(s=>s.id).sort()};
  return {status:'FOUND',speciesId:all[0]!.id};
}

/** P2.14 closeout: the canonical condition fields the explorer can state FAITHFULLY. V1 states condition-vocabulary
 *  dimensions only (the record's `tags`). Every other field a record requires (medium, solvent, catalysts, light,
 *  current, temperature, pressure, concentration, or an unknown key) cannot be supplied by the learner here, so such
 *  a record is EXPLORER_CONDITION_UNSUPPORTED: no deep link, no reachability claim, a plain "not yet supported" state —
 *  never a "condition required" the learner could not satisfy. The runtime callers that support those fields keep
 *  using them; no control is invented to raise coverage. */
export const EXPLORER_SUPPORTED_CONDITION_FIELDS:readonly string[]=['tags'];
export const EXPLORER_CONDITION_UNSUPPORTED='EXPLORER_CONDITION_UNSUPPORTED';
export function unsupportedConditionFields(c:ReactionConditions|undefined):string[]{
  return conditionRequirementFields(c).filter(f=>!EXPLORER_SUPPORTED_CONDITION_FIELDS.includes(f));
}

/** One candidate record's requirement: its vocabulary dimensions and the fields the explorer cannot state. */
export interface ExplorerRequirement { dimensions:Record<string,string>; unsupported:string[] }
export type ExplorerOutcome=
  | {kind:'NO_REAGENTS'}
  | {kind:'MODELED_REACTION';reactionId:string}
  | {kind:'MODELED_NO_REACTION';reactionId:string}
  /** records exist for these reagents, but their conditions do not hold in what was stated: what each one requires
   *  (records with a condition the explorer cannot state are listed with `unsupported`, never as satisfiable) */
  | {kind:'CONDITION_REQUIRED';requirements:ExplorerRequirement[]}
  /** more than one record holds in what was stated: a further condition decides between them */
  | {kind:'CONDITION_CHOICE_REQUIRED';requirements:ExplorerRequirement[]}
  /** records exist for these reagents, but every one requires a condition type the explorer cannot state yet */
  | {kind:'CONDITION_UNSUPPORTED';requirements:ExplorerRequirement[]}
  | {kind:'NOT_MODELED'};

export interface ExplorerDomain { matcher:ReactionMatcher; registry:SpeciesRegistry; vocabulary:ConditionVocabulary }

export function explore(d:ExplorerDomain,speciesIds:readonly string[],stated:Readonly<Record<string,string>>):ExplorerOutcome{
  if(!speciesIds.length) return {kind:'NO_REAGENTS'};
  const reactants=speciesIds.map(id=>{ const s=d.registry.byId(id); if(!s) throw new Error(`EXPLORER_SPECIES_UNKNOWN:${id}`); return {formula:s.formula,phase:s.phase}; });
  // only vocabulary dimensions are ever stated; every other field stays absent, so a record that requires one can
  // never match here (requirementsMet: specified + missing = not met)
  const m=d.matcher.match({reactants,conditions:{dimensions:{...stated}},conditionPolicy:'require-record-conditions'});
  if(m.modeled) return classifyMatch(m)==='MODELED_NO_REACTION'?{kind:'MODELED_NO_REACTION',reactionId:m.reaction.id}:{kind:'MODELED_REACTION',reactionId:m.reaction.id};
  const requirements=d.matcher.candidates(reactants).map(r=>({dimensions:dimensionsOf(r.conditions?.tags??[],d.vocabulary).dimensions,unsupported:unsupportedConditionFields(r.conditions)}));
  if(requirements.length&&requirements.every(r=>r.unsupported.length)) return {kind:'CONDITION_UNSUPPORTED',requirements};
  if(m.code==='REACTION_CONDITIONS_NOT_MET') return {kind:'CONDITION_REQUIRED',requirements};
  if(m.code==='REACTION_CONDITION_REQUIRED') return {kind:'CONDITION_CHOICE_REQUIRED',requirements};
  return {kind:'NOT_MODELED'};
}

// ------------------------------------------------------------------ deep link (the page state lives in the URL)

export interface ExplorerState { speciesIds:string[]; stated:Record<string,string>; rejected:string[] }

/** `?r=<substance key>` (repeatable) and `?c=<dimension>:<value>` (repeatable). An unknown key, a duplicate, an
 *  unknown condition or a second value for one dimension is refused (listed in `rejected`), never repaired. */
export function parseExplorerQuery(params:URLSearchParams,index:Pick<KnowledgeIndex,'substances'|'conditions'>):ExplorerState{
  const byKey=new Map(index.substances.map(s=>[s.key,s.id]));
  const allowed=new Map(index.conditions.map(c=>[c.dimension,new Set(c.values)]));
  const speciesIds:string[]=[], rejected:string[]=[], stated:Record<string,string>={};
  for(const key of params.getAll('r')){
    const id=byKey.get(key);
    if(!id||speciesIds.includes(id)||speciesIds.length>=MAX_REAGENTS) rejected.push(`r:${key}`); else speciesIds.push(id);
  }
  for(const raw of params.getAll('c')){
    const [dimension,value,...rest]=raw.split(':');
    if(rest.length||!dimension||!value||!allowed.get(dimension)?.has(value)||(stated[dimension]!==undefined&&stated[dimension]!==value)) rejected.push(`c:${raw}`);
    else stated[dimension]=value;
  }
  return {speciesIds,stated,rejected};
}

export function explorerHref(speciesIds:readonly string[],stated:Readonly<Record<string,string>>,flagQuery:string):string{
  const p=new URLSearchParams(flagQuery.startsWith('?')?flagQuery.slice(1):flagQuery);
  for(const id of speciesIds) p.append('r',substanceKey(id));
  for(const [d,v] of Object.entries(stated).sort(([a],[b])=>a.localeCompare(b))) p.append('c',`${d}:${v}`);
  const q=p.toString();
  return `/reactions${q?`?${q}`:''}`;
}

/** The explorer link of a reaction record: its reactants and the conditions the record itself requires. Only when
 *  every reactant resolves to a canonical species AND every required condition can be stated faithfully (P2.14
 *  closeout: a record with an unsupported condition gets no link — never one that pretends all conditions were
 *  supplied). Opening it runs the matcher — the page never looks the record up. */
export function reactionExplorerHref(index:KnowledgeIndex,reactionId:string,flagQuery:string):string|null{
  const r=index.reactions.find(x=>x.id===reactionId);
  if(!r||r.participants.reactants.some(x=>x===null)||r.unsupportedConditions.length) return null;
  return explorerHref(r.participants.reactants as string[],r.requirements,flagQuery);
}

export const substanceHref=(speciesId:string,flagQuery:string)=>`/substance/${substanceKey(speciesId)}${flagQuery}`;
export const isSpeciesId=(id:string)=>id.startsWith(SPECIES_ID_PREFIX);

// ------------------------------------------------------------------ browser-local domain + learner search entries


/** The canonical domain the pages run on, built in the browser from the pack records (no server lookup). The
 *  registry refuses duplicate identities; the matcher refuses invalid records — both fail closed. */
export function knowledgeDomain(raw:{species:unknown[];reactions:unknown[];conditionVocabulary:unknown}){
  const vocabulary=parseConditionVocabulary(raw.conditionVocabulary);
  const reactions=raw.reactions as ReactionRecord[];
  return {registry:SpeciesRegistry.from(raw.species as Species[]),matcher:ReactionMatcher.from(reactions,{vocabulary}),vocabulary,reactions:new Map(reactions.map(r=>[r.id,r]))};
}

/** Substances in the existing learner search: the formula matches exactly, the localized name (only where the
 *  catalog has one) as text. Identity is the species id; a formula shared by two species gives two entries. */
export function substanceSearchEntries(index:KnowledgeIndex,registry:SpeciesRegistry,localize:(key:string)=>string|null,label:{kicker:string;description:(phase:string)=>string},flagQuery:string):SearchIndexEntry[]{
  return index.substances.map(s=>{
    const sp=registry.byId(s.id)!; const name=localize(sp.nameKey);
    return {kind:'substance' as const,title:name?`${name} (${sp.formula})`:sp.formula,description:label.description(sp.phase),href:substanceHref(s.id,flagQuery),searchText:name??'',exact:[sp.formula],kicker:label.kicker};
  });
}
/** Reactions in the existing learner search: the equation as the title; every reactant and product formula matches as
 *  text (not as an exact term), so a substance's own formula ranks its passport above the reactions it appears in.
 *  The link opens the explorer with the record's reactants and conditions — the matcher decides what is shown. A
 *  record whose reactants do not all resolve to canonical species has no explorer link, so it has no entry. */
export function reactionSearchEntries(index:KnowledgeIndex,reactions:ReadonlyMap<string,ReactionRecord>,label:{kicker:string;description:(type:string)=>string},flagQuery:string):SearchIndexEntry[]{
  return index.reactions.flatMap(k=>{
    const r=reactions.get(k.id); const h=reactionExplorerHref(index,k.id,flagQuery);
    if(!r||!h) return [];
    return [{kind:'reaction' as const,title:r.molecularEquation,description:label.description(r.reactionType),href:h,searchText:[...new Set([...r.reactants,...r.products].map(x=>x.formula))].join(' '),kicker:label.kicker}];
  });
}
