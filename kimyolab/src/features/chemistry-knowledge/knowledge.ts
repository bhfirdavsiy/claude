// P2.14 — the Substance / Reaction knowledge index contract (kimyolab.chemistry-knowledge.v1, ADR-P2-015). Built at
// content-pack time by scripts/lib/chemistry-knowledge.ts from the ONE canonical chemistry graph (the same graph as
// the Element Hub). It carries only DERIVED facts and their provenance — identity (formula, phase, charge, name key)
// stays in chemistry/species.json and the reaction records stay in chemistry/reactions.json, so nothing is
// duplicated. Every field says how it is known; a field nobody can vouch for is an explicit gap, never a guess.

/** a registered source, title as the canonical source registry states it */
export interface SourceRef { id:string; title:string }

export const CHEMISTRY_KNOWLEDGE_SCHEMA='kimyolab.chemistry-knowledge.v1';
export const CHEMISTRY_KNOWLEDGE_PACK_PATH='knowledge/chemistry-knowledge.json';
/** the route key of a substance: its canonical species id without the `species.` namespace (a bijection — the build
 *  refuses an id that does not have the namespace or whose key is not unique). A formula is never a route key. */
export const SPECIES_ID_PREFIX='species.';
export const substanceKey=(speciesId:string)=>speciesId.startsWith(SPECIES_ID_PREFIX)?speciesId.slice(SPECIES_ID_PREFIX.length):speciesId;
export const SUBSTANCE_KEY=/^[a-z0-9][a-z0-9_-]*$/;

export type KnowledgeGap=
  | 'FORMULA_NOT_PARSEABLE'      // the species "formula" is a name (e.g. a mixture), the canonical parser cannot read it
  | 'ATOMIC_MASS_NOT_REVIEWED'   // a molar mass needs a reviewed atomic mass of every element (P2.13 governance)
  | 'DISSOCIATION_NOT_MODELED'   // no dissociation rule — NOT "does not dissociate"
  | 'SOURCE_REQUIRED'            // no registered source
  | 'SOURCE_NOT_ELIGIBLE'        // only sources that are not human-accepted / not acceptable for chemistry
  | 'REVIEW_PENDING'             // an eligible source exists but no human approved this claim's current hash
  | 'OBSERVATION_REVIEW_REQUIRED'// the record's observation failed the KB's structural integrity check
  | 'OBSERVATION_MISSING'
  | 'IONIC_NOT_SUPPORTED';       // IonicEngine.support() is not supported:true for this reaction

/** How a learner may see a field. Governance codes stay in the reports; the learner sees a natural sentence. */
export type KnowledgeField<T>=
  /** read by the canonical formula parser */
  | {status:'DERIVED';value:T;provenance:'FORMULA_PARSER'}
  /** computed by a domain engine in its supported range, or from reviewed atomic masses */
  | {status:'COMPUTED';value:T;provenance:'ENGINE_COMPUTED'|'REVIEWED_ATOMIC_MASSES'}
  /** the canonical model's own operational data — what the runtime uses — NOT a human-reviewed fact */
  | {status:'MODEL';value:T;provenance:'CANONICAL_MODEL'}
  /** a human approved this exact claim and an eligible registered source backs it */
  | {status:'REVIEWED';value:T;sources:SourceRef[]}
  | {status:'GAP';reason:KnowledgeGap};

/** A relation and the evidence chain it rests on (`via`: the lab / reaction / shelf that proves it). Every relation
 *  is a participation; PRIMARY does not exist in this index (it needs an explicit, reviewed authored relation). */
export interface KnowledgeRelation { id:string; via:string[] }
/** the provenance of each relation list (one per list, so the pack file does not repeat it per item) */
export const RELATION_PROVENANCE={
  substance:{elements:'DERIVED_FROM_FORMULA',reactions:'REACTION_PARTICIPANT',labs:'EXPLICIT_MAPPING',topics:'EXPLICIT_MAPPING'},
  reaction:{elements:'DERIVED_FROM_FORMULA',labs:'EXPLICIT_MAPPING',topics:'EXPLICIT_MAPPING'},
} as const;

export interface KnowledgeSubstance {
  id:string; key:string;
  composition:KnowledgeField<Record<string,number>>;
  molarMass:KnowledgeField<string>;
  dissociation:KnowledgeField<Array<{formula:string;coefficient:number}>>;
  hazards:KnowledgeField<string[]>;
  properties:KnowledgeField<Record<string,string|number|boolean>>;
  /** elements and reactions are plain ids (formula parser / resolved participant); labs and topics carry `via` */
  relations:{elements:string[];reactions:string[];labs:KnowledgeRelation[];topics:KnowledgeRelation[]};
}
export interface KnowledgeReaction {
  id:string;
  /** each participant's canonical species id, or null when the participant resolves to no single species */
  participants:{reactants:Array<string|null>;products:Array<string|null>};
  /** the record's tag requirements as condition-vocabulary dimensions (an unknown tag fails the build) */
  requirements:Record<string,string>;
  /** P2.14 closeout: every OTHER canonical condition field the record requires (medium, solvent, catalystIds,
   *  lightRequired, electricalCurrent, temperatureRange, pressureRange, concentrationRules, unknown:<key>) — the
   *  explorer cannot state them, so the record is EXPLORER_CONDITION_UNSUPPORTED (no deep link). Never dropped. */
  unsupportedConditions:string[];
  observations:KnowledgeField<unknown[]>;
  ionicEquation:KnowledgeField<string>;
  /** REVIEWED only with a human decision on the current hash AND an eligible source; else it is a model record */
  review:'REVIEWED'|'MODEL_RECORD';
  relations:{elements:string[];labs:KnowledgeRelation[];topics:KnowledgeRelation[]};
}
export interface KnowledgeIndex {
  schema:typeof CHEMISTRY_KNOWLEDGE_SCHEMA;
  substances:KnowledgeSubstance[];
  reactions:KnowledgeReaction[];
  /** condition dimensions a learner may state, each with its values (condition vocabulary terms + contexts) */
  conditions:Array<{dimension:string;values:string[]}>;
  labs:Array<{id:string;title:string}>;
  topics:Array<{id:string;grade:number;title:string}>;
}

/** Fail-closed shape check on the pack file. */
export function assertKnowledgeIndex(raw:any):KnowledgeIndex{
  if(!raw||raw.schema!==CHEMISTRY_KNOWLEDGE_SCHEMA) throw new Error('CHEMISTRY_KNOWLEDGE_INVALID:schema');
  for(const k of ['substances','reactions','conditions','labs','topics']) if(!Array.isArray(raw[k])) throw new Error(`CHEMISTRY_KNOWLEDGE_INVALID:${k}`);
  const keys=new Set<string>();
  for(const s of raw.substances){
    if(typeof s?.id!=='string'||!SUBSTANCE_KEY.test(String(s?.key))||substanceKey(s.id)!==s.key||keys.has(s.key)) throw new Error(`CHEMISTRY_KNOWLEDGE_INVALID:substance:${s?.id}`);
    keys.add(s.key);
  }
  return raw as KnowledgeIndex;
}
