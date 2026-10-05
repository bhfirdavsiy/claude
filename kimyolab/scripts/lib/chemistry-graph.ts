// P2.14 — the ONE canonical chemistry knowledge graph (ADR-P2-015). The Element Hub (P2.13) and the Substance /
// Reaction knowledge index (P2.14) are both views of this graph; neither derives a relation on its own.
//   Element  ↔ Substance   the canonical formula parser reads the species formula (DERIVED_FROM_FORMULA)
//   Element  ↔ Reaction    the parser reads a participant formula (DERIVED_FROM_FORMULA)
//   Substance↔ Reaction    a participant formula resolves to exactly ONE canonical species and the participant's
//                          phase (when the record states one) is that species' phase — never by formula alone
//   Reaction ↔ Lab         the guided-step reaction map (EXPLICIT_MAPPING)
//   Substance↔ Lab         the topic lab profile shelf (EXPLICIT_MAPPING), or a reaction of that lab the substance
//                          takes part in (the chain is named in `via`)
//   Lab      ↔ Topic       mapping-links.json (EXPLICIT_MAPPING)
// No keyword, title or text matching and no inference: a relation exists only where a canonical record states it.
import fs from 'node:fs';
import path from 'node:path';
import {parseFormula} from '../../src/domain/chemistry/formula-parser.ts';
import {SpeciesRegistry} from '../../src/domain/chemistry/species-registry.ts';
import type {ReactionRecord,Species} from '../../src/domain/chemistry/types.ts';
import {compileTopicLabProfiles} from './topic-lab-profiles.ts';

const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));

/** Elements of a formula by the canonical parser, or null when the text is not a parseable formula. */
export function formulaElements(formula:string):string[]|null{
  try{ return Object.keys(parseFormula(formula).atoms).sort(); }catch{ return null; }
}

/** A reaction participant resolved to a canonical species, or the reason it is not. */
export type ParticipantResolution={speciesId:string}|{speciesId:null;reason:'NO_SPECIES'|'AMBIGUOUS_FORMULA'|'PHASE_NOT_IN_REGISTRY'};
export function resolveParticipant(registry:SpeciesRegistry,ref:{formula:string;phase?:string}):ParticipantResolution{
  const all=registry.byFormula(ref.formula);
  if(!all.length) return {speciesId:null,reason:'NO_SPECIES'};
  const fit=ref.phase?all.filter(s=>s.phase===ref.phase):all;
  if(!fit.length) return {speciesId:null,reason:'PHASE_NOT_IN_REGISTRY'};
  if(fit.length>1) return {speciesId:null,reason:'AMBIGUOUS_FORMULA'};
  return {speciesId:fit[0]!.id};
}

export interface ChemistryGraphInputs { species?:unknown; reactions?:unknown }

export function deriveChemistryGraph(root:string,inputs:ChemistryGraphInputs={}){
  const species=(inputs.species??readJson(root,'content-src/chemistry/species.json')) as Species[];
  const reactions=(inputs.reactions??readJson(root,'content-src/chemistry/reactions.json')) as ReactionRecord[];
  // canonical identity: the registry refuses a duplicate id or a duplicate (formula, phase, charge, variant, allotrope)
  const registry=SpeciesRegistry.from(species);
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

  // substance ↔ reaction: participant → exactly one canonical species (phase-aware), else an unresolved participant
  const participants=new Map<string,{reactants:ParticipantResolution[];products:ParticipantResolution[]}>();
  const substanceReactions=new Map<string,Set<string>>();
  const unresolvedParticipants:Array<{reactionId:string;formula:string;phase:string|null;reason:string}>=[];
  for(const r of reactions){
    const res=(refs:ReactionRecord['reactants'])=>refs.map(ref=>{
      const p=resolveParticipant(registry,ref);
      if(p.speciesId!==null){ if(!substanceReactions.has(p.speciesId)) substanceReactions.set(p.speciesId,new Set()); substanceReactions.get(p.speciesId)!.add(r.id); }
      else unresolvedParticipants.push({reactionId:r.id,formula:ref.formula,phase:ref.phase??null,reason:p.reason});
      return p;
    });
    participants.set(r.id,{reactants:res(r.reactants),products:res(r.products)});
  }

  // labs: species on a topic lab profile's shelf, reactions in the guided-step reaction map
  const labSpecies=new Map<string,Set<string>>(), labReactions=new Map<string,Set<string>>();
  const add=(m:Map<string,Set<string>>,k:string,v:string)=>{ if(!m.has(k)) m.set(k,new Set()); m.get(k)!.add(v); };
  for(const p of profiles) for(const s of p.substances??[]) if(s.speciesId&&substanceElements.has(s.speciesId)) add(labSpecies,p.activityId,s.speciesId);
  for(const [activityId,steps] of Object.entries(stepMap)) for(const v of Object.values(steps)) for(const rid of [v].flat()) if(reactionElements.has(rid)) add(labReactions,activityId,rid);
  const labIds=[...new Set([...labSpecies.keys(),...labReactions.keys()])].filter(id=>activities.some(a=>a.id===id)).sort();
  const labTopics=new Map(labIds.map(id=>[id,[...new Set(mappings.filter(m=>m.practiceActivityId===id).map(m=>m.learningUnitId))].sort()]));

  return {species,reactions,registry,activities,mappings,units,
    substanceElements,reactionElements,unparsedSubstances,unparsedReactionFormulas,
    participants,substanceReactions,unresolvedParticipants,
    labSpecies,labReactions,labIds,labTopics};
}
export type ChemistryGraph=ReturnType<typeof deriveChemistryGraph>;
