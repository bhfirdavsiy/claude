// P2.13 — the Element Hub contract (kimyolab.element-hub.v1, ADR-P2-014). Built at content-pack time by
// scripts/lib/element-hub.ts from the canonical sources; the learner page only reads it (no chemistry is computed in
// the browser). Identity (Z, symbol) comes from src/domain/chemistry/periodic-table.ts; every other field says where
// it comes from, and a field without a source is an explicit gap — never a guess.
import {ELEMENT_SYMBOLS} from '../../domain/chemistry/periodic-table.ts';

export const ELEMENT_HUB_SCHEMA='kimyolab.element-hub.v1';
export const ELEMENT_METADATA_SCHEMA='kimyolab.element-metadata.v1';
export const ELEMENT_HUB_PACK_PATH='periodic/element-hub.json';

export type GapReason='SOURCE_REQUIRED'|'SOURCE_NOT_ELIGIBLE'|'REVIEW_PENDING'|'F_BLOCK_GROUP_CONVENTION'|'OUTSIDE_ENGINE_RANGE'|'ENGINE_KNOWN_GAP';
/** a registered source, title as the canonical source registry states it */
export interface SourceRef { id:string; title:string }
/** What a learner may see. An unreviewed claim never reaches the hub: it is a gap with its reason. */
export type HubField<T>=
  /** a human approved this exact claim (decision register) and an eligible registered source backs it */
  | {status:'REVIEWED';value:T;sources:SourceRef[]}
  /** computed by a domain engine inside its proven range (electron configuration) */
  | {status:'COMPUTED';value:T;provenance:'ENGINE_COMPUTED'}
  | {status:'GAP';reason:GapReason};

export type RelationProvenance='DERIVED_FROM_FORMULA'|'EXPLICIT_MAPPING'|'AUTHORED_RELATION';
export interface HubRelation { id:string; kind:'PARTICIPATES'|'PRIMARY'|'RELATED'; provenance:RelationProvenance; via:string[]; targetType?:'SUBSTANCE'|'REACTION'|'TOPIC'|'LAB' }

export interface HubElement {
  z:number; symbol:string;
  display:{row:number;column:number};
  period:HubField<number>; group:HubField<number>;
  relativeAtomicMass:HubField<number>; category:HubField<string>;
  electronConfiguration:HubField<string>; oxidationStates:HubField<number[]>; teachingDescription:HubField<string>;
  relations:{substances:HubRelation[];reactions:HubRelation[];labs:HubRelation[];topics:HubRelation[];authored:HubRelation[]};
}
export interface HubSubstance { id:string; formula:string; nameKey:string }
export interface HubReaction { id:string; equation:string }
export interface HubLab { id:string; title:string }
export interface HubTopic { id:string; grade:number; title:string }
export interface ElementHub {
  schema:typeof ELEMENT_HUB_SCHEMA; metadataSchema:typeof ELEMENT_METADATA_SCHEMA;
  elements:HubElement[]; substances:HubSubstance[]; reactions:HubReaction[]; labs:HubLab[]; topics:HubTopic[];
}

/** Fail-closed shape check on the pack file: exactly the canonical 118 identities, in order, nothing else. */
export function assertElementHub(raw:any):ElementHub{
  if(!raw||raw.schema!==ELEMENT_HUB_SCHEMA||raw.metadataSchema!==ELEMENT_METADATA_SCHEMA) throw new Error('ELEMENT_HUB_INVALID:schema');
  const els=raw.elements;
  if(!Array.isArray(els)||els.length!==ELEMENT_SYMBOLS.length) throw new Error('ELEMENT_HUB_INVALID:count');
  els.forEach((e:any,i:number)=>{ if(e?.z!==i+1||e?.symbol!==ELEMENT_SYMBOLS[i]) throw new Error(`ELEMENT_HUB_INVALID:identity:${i+1}`); });
  for(const k of ['substances','reactions','labs','topics']) if(!Array.isArray(raw[k])) throw new Error(`ELEMENT_HUB_INVALID:${k}`);
  return raw as ElementHub;
}
