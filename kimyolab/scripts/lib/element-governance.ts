// P2.13 closeout — scientific provenance and human review for the Element Hub (ADR-P2-014 §3a). It reuses the chemistry
// knowledge-base pattern (src/domain/chemistry/kb-review.ts) and the source policy (src/domain/governance/source-policy.ts):
//
//   every scientific claim is an ASSERTION with a content hash (what is claimed + the cited source ids);
//   its effective review state is DERIVED from the human decision register content-src/periodic/element-reviews.json —
//   never from a field in the data record; a decision binds to the hash, so an edited claim is STALE;
//   reviewers are people (never an automation identity) in the right role; tooling never writes a decision;
//   a claim counts as reviewed scientific truth only when its decision is an approval on the CURRENT hash AND at least
//   one cited source is eligible (registered, category acceptable for chemistry, HUMAN_ACCEPTED through source intake).
//
// Source references are registry ids only: the title, category and acceptance come from the canonical source registry,
// so a record cannot carry a parallel title or authority of its own.
import {assertionHash,unknownFields,type ChemistryReviewRecord} from '../../src/domain/chemistry/kb-review.ts';
import {isAutomationIdentity} from '../../src/domain/governance/identity.ts';
import {sourceAcceptance,type SourceRegistry} from '../../src/domain/governance/source-policy.ts';
import {ELEMENT_SYMBOL_SET} from '../../src/domain/chemistry/periodic-table.ts';

export const ELEMENT_REVIEW_REGISTER_SCHEMA='kimyolab.element-reviews.v1';
export const ELEMENT_REVIEW_FIELDS:readonly string[]=['assertionId','assertionHash','decision','reviewerId','reviewerRole','reviewedAt','comment'];
export type ReviewerRole='chemistry'|'didactic';
export interface ElementReviewRecord extends Omit<ChemistryReviewRecord,'reviewerRole'> { reviewerRole:ReviewerRole }
export type EffectiveReview='approved'|'rejected'|'change_required'|'stale'|'pending';

export interface ElementAssertion { id:string; category:string; data:unknown; sourceRefs:string[]; requiredRole:ReviewerRole; hash:string }
export function elementAssertion(id:string,category:string,data:unknown,sourceRefs:string[],requiredRole:ReviewerRole='chemistry'):ElementAssertion{
  return {id,category,data,sourceRefs:[...sourceRefs].sort(),requiredRole,hash:assertionHash({category,data,sourceRefs})};
}

/** A decision record is exactly what a human reviewer decided — no extra field, no automation identity. */
export function validateElementReview(r:any):string[]{
  const issues:string[]=[]; const id=r?.assertionId??'?';
  if(!r||typeof r.assertionId!=='string'||!r.assertionId) issues.push('ELEMENT_REVIEW_ASSERTION_MISSING');
  if(typeof r?.assertionHash!=='string'||!/^[a-f0-9]{64}$/.test(r.assertionHash)) issues.push(`ELEMENT_REVIEW_HASH_INVALID:${id}`);
  if(!['approve','reject','change_required'].includes(r?.decision)) issues.push(`ELEMENT_REVIEW_DECISION_INVALID:${id}`);
  if(typeof r?.reviewerId!=='string'||!r.reviewerId.trim()) issues.push(`ELEMENT_REVIEW_REVIEWER_MISSING:${id}`);
  else if(isAutomationIdentity(r.reviewerId)) issues.push(`ELEMENT_REVIEW_REVIEWER_NOT_HUMAN:${id}`);
  if(r?.reviewerRole!=='chemistry'&&r?.reviewerRole!=='didactic') issues.push(`ELEMENT_REVIEW_ROLE_INVALID:${id}`);
  if(typeof r?.reviewedAt!=='string'||Number.isNaN(Date.parse(r.reviewedAt))) issues.push(`ELEMENT_REVIEW_DATE_INVALID:${id}`);
  if(r?.decision!=='approve'&&!(typeof r?.comment==='string'&&r.comment.trim())) issues.push(`ELEMENT_REVIEW_COMMENT_REQUIRED:${id}`);
  for(const f of unknownFields(r,ELEMENT_REVIEW_FIELDS)) issues.push(`ELEMENT_REVIEW_FIELD_NOT_ALLOWED:${id}:${f}`);
  return issues;
}
/** An invalid register stops the build (fail closed); it is never repaired or partially used. */
export function parseElementReviews(raw:any):ElementReviewRecord[]{
  if(!raw||raw.schema!==ELEMENT_REVIEW_REGISTER_SCHEMA||!Array.isArray(raw.records)) throw new Error('ELEMENT_REVIEWS_INVALID:schema');
  const issues=raw.records.flatMap((r:any)=>validateElementReview(r));
  if(issues.length) throw new Error(`ELEMENT_REVIEWS_INVALID:${issues.join(',')}`);
  return raw.records;
}

/** The latest decision by a reviewer in the required role, checked against the CURRENT hash. */
export function effectiveReview(a:ElementAssertion,records:readonly ElementReviewRecord[]):{state:EffectiveReview;record?:ElementReviewRecord}{
  const mine=records.filter(r=>r.assertionId===a.id&&r.reviewerRole===a.requiredRole).sort((x,y)=>Date.parse(x.reviewedAt)-Date.parse(y.reviewedAt));
  const latest=mine.at(-1);
  if(!latest) return {state:'pending'};
  if(latest.assertionHash!==a.hash) return {state:'stale',record:latest};
  return {state:latest.decision==='approve'?'approved':latest.decision==='reject'?'rejected':'change_required',record:latest};
}

export type SourceStatus='NO_SOURCE'|'SOURCE_NOT_ELIGIBLE'|'SOURCE_ELIGIBLE';
/** Registry ids only; an unknown id is refused (the caller fails the build). Eligible = acceptable category for a
 *  chemistry claim AND human-accepted through the governed source intake. */
export function sourceStatus(sourceRefs:readonly string[],registry:SourceRegistry):{status:SourceStatus;sources:Array<{id:string;title:string;category:string;eligible:boolean}>}{
  const sources=sourceRefs.map(id=>{ const e=registry.byId.get(id); if(!e) throw new Error(`ELEMENT_SOURCE_UNREGISTERED:${id}`); return {id,title:e.title,category:e.category,eligible:sourceAcceptance(e,'chemistry').canonicalAuthoringEligible}; });
  return {status:!sources.length?'NO_SOURCE':sources.some(s=>s.eligible)?'SOURCE_ELIGIBLE':'SOURCE_NOT_ELIGIBLE',sources};
}

/** Effective scientific state of one assertion: only REVIEWED may reach a learner as a fact. */
export type ScientificState='REVIEWED'|'REVIEW_PENDING'|'SOURCE_NOT_ELIGIBLE'|'SOURCE_REQUIRED';
export function scientificState(a:ElementAssertion,registry:SourceRegistry,records:readonly ElementReviewRecord[]):{state:ScientificState;review:EffectiveReview;sources:ReturnType<typeof sourceStatus>['sources']}{
  const s=sourceStatus(a.sourceRefs,registry); const r=effectiveReview(a,records);
  const state:ScientificState=s.status==='NO_SOURCE'?'SOURCE_REQUIRED':s.status==='SOURCE_NOT_ELIGIBLE'?'SOURCE_NOT_ELIGIBLE':r.state==='approved'?'REVIEWED':'REVIEW_PENDING';
  return {state,review:r.state,sources:s.sources};
}

// ------------------------------------------------------------------ authored metadata and relations (contracts)

export const METADATA_FIELDS=['relativeAtomicMass','category','oxidationStates','teachingDescription'] as const;
export type MetadataField=typeof METADATA_FIELDS[number];
const VALUE_OK:Record<MetadataField,(v:unknown)=>boolean>={relativeAtomicMass:v=>typeof v==='number'&&v>0,category:v=>typeof v==='string'&&!!v.trim(),oxidationStates:v=>Array.isArray(v)&&v.length>0&&v.every(Number.isInteger),teachingDescription:v=>typeof v==='string'&&!!v.trim()};
const ENTRY_FIELDS=['value','sourceRefs'];
const sourceIds=(v:unknown,where:string)=>{ if(!Array.isArray(v)||v.some(x=>typeof x!=='string'||!x)) throw new Error(`ELEMENT_METADATA_INVALID:sourceRefs:${where}`); return v as string[]; };

/** kimyolab.element-metadata.v1: per symbol and field a typed value and registry source ids — nothing else (a
 *  `reviewStatus`, `title` or any other field is refused: review comes from the register, titles from the registry). */
export function parseElementMetadata(raw:any,registry:SourceRegistry){
  if(raw?.schema!=='kimyolab.element-metadata.v1'||!raw.entries||typeof raw.entries!=='object'||Array.isArray(raw.entries)) throw new Error('ELEMENT_METADATA_INVALID:schema');
  const entries:Record<string,Partial<Record<MetadataField,{value:unknown;sourceRefs:string[]}>>>={};
  for(const [symbol,entry] of Object.entries<any>(raw.entries)){
    if(!ELEMENT_SYMBOL_SET.has(symbol)) throw new Error(`ELEMENT_METADATA_INVALID:symbol:${symbol}`);
    entries[symbol]={};
    for(const [field,f] of Object.entries<any>(entry??{})){
      if(!(METADATA_FIELDS as readonly string[]).includes(field)) throw new Error(`ELEMENT_METADATA_INVALID:field:${symbol}.${field}`);
      const extra=unknownFields(f,ENTRY_FIELDS); if(extra.length) throw new Error(`ELEMENT_METADATA_INVALID:field-not-allowed:${symbol}.${field}:${extra.join(',')}`);
      if(!VALUE_OK[field as MetadataField](f?.value)) throw new Error(`ELEMENT_METADATA_INVALID:value:${symbol}.${field}`);
      const refs=sourceIds(f.sourceRefs,`${symbol}.${field}`); sourceStatus(refs,registry);   // unknown id → throws
      entries[symbol]![field as MetadataField]={value:f.value,sourceRefs:refs};
    }
  }
  const rule=raw.rules?.periodGroup;
  if(!rule||unknownFields(rule,['sourceRefs']).length) throw new Error('ELEMENT_METADATA_INVALID:rules.periodGroup');
  const ruleRefs=sourceIds(rule.sourceRefs,'rules.periodGroup'); sourceStatus(ruleRefs,registry);
  return {entries,periodGroupRuleSourceRefs:ruleRefs};
}

export const RELATION_TARGET_TYPES=['SUBSTANCE','REACTION','TOPIC','LAB'] as const;
export type RelationTargetType=typeof RELATION_TARGET_TYPES[number];
export interface AuthoredRelation { element:string; kind:'PRIMARY'|'RELATED'; targetType:RelationTargetType; targetId:string; sourceRefs:string[] }
const RELATION_FIELDS=['element','kind','targetType','targetId','sourceRefs'];
/** kimyolab.element-relations.v1: a closed target type, a target that exists in that canonical registry, registry
 *  source ids. Anything else fails the build. */
export function parseElementRelations(raw:any,targets:Record<RelationTargetType,ReadonlySet<string>>,registry:SourceRegistry):AuthoredRelation[]{
  if(raw?.schema!=='kimyolab.element-relations.v1'||!Array.isArray(raw.relations)) throw new Error('ELEMENT_RELATIONS_INVALID:schema');
  return raw.relations.map((r:any,i:number)=>{
    const where=`#${i}`;
    const extra=unknownFields(r,RELATION_FIELDS); if(extra.length) throw new Error(`ELEMENT_RELATIONS_INVALID:field-not-allowed:${where}:${extra.join(',')}`);
    if(!ELEMENT_SYMBOL_SET.has(r?.element)) throw new Error(`ELEMENT_RELATIONS_INVALID:element:${where}`);
    if(r.kind!=='PRIMARY'&&r.kind!=='RELATED') throw new Error(`ELEMENT_RELATIONS_INVALID:kind:${where}`);
    if(!(RELATION_TARGET_TYPES as readonly string[]).includes(r.targetType)) throw new Error(`ELEMENT_RELATIONS_INVALID:targetType:${where}`);
    if(typeof r.targetId!=='string'||!targets[r.targetType as RelationTargetType].has(r.targetId)) throw new Error(`ELEMENT_RELATIONS_INVALID:target:${where}:${r.targetType}:${r.targetId}`);
    const refs=sourceIds(r.sourceRefs,where); sourceStatus(refs,registry);
    return {element:r.element,kind:r.kind,targetType:r.targetType,targetId:r.targetId,sourceRefs:refs};
  });
}
/** substance and reaction relations are chemistry claims; topic and lab relations are didactic ones */
export const relationRole=(t:RelationTargetType):ReviewerRole=>t==='SUBSTANCE'||t==='REACTION'?'chemistry':'didactic';
