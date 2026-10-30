// Source provenance policy (P1.9). A content claim's approval counts only if the claim cites at least one REGISTERED
// source whose category is acceptable for the kind of claim. Chemistry truth and display translation (localized
// names) are different kinds of claims with different acceptable provenance. INTERNAL_PROPOSAL (e.g. an internal
// migration set, or anything the agent drafted) is never enough on its own.
//
// This only ever makes approval HARDER: APPROVED_WITHOUT_SOURCE stays a gate FAIL, and an approval backed only by
// unacceptable provenance is a FAIL too (APPROVED_WITHOUT_ACCEPTABLE_SOURCE).

import {isAutomationIdentity} from './identity.ts';

export const SOURCE_REGISTRY_SCHEMA='kimyolab.source-registry.v1';
export type SourceCategory='CURRICULUM'|'TEXTBOOK'|'OFFICIAL_STANDARD'|'AUTHORITATIVE_REFERENCE'|'LOCALIZATION_GLOSSARY'|'INTERNAL_PROPOSAL';
export const SOURCE_CATEGORIES:readonly SourceCategory[]=['CURRICULUM','TEXTBOOK','OFFICIAL_STANDARD','AUTHORITATIVE_REFERENCE','LOCALIZATION_GLOSSARY','INTERNAL_PROPOSAL'];
export type ClaimKind='chemistry'|'display-translation';

/** Which provenance can make an approval count, per claim kind. */
export const ACCEPTABLE:Record<ClaimKind,readonly SourceCategory[]>={
  chemistry:['CURRICULUM','TEXTBOOK','OFFICIAL_STANDARD','AUTHORITATIVE_REFERENCE'],
  'display-translation':['LOCALIZATION_GLOSSARY','CURRICULUM','TEXTBOOK','OFFICIAL_STANDARD'],
};

export type SourceClassification='PROPOSED'|'HUMAN_ACCEPTED';
/** A registered source with the governance facts canonical authoring needs (P2.4 closeout A2). A source is
 *  HUMAN_ACCEPTED only through the governed source intake (npm run source:apply), pinned to the reviewed revision. */
export interface SourceEntry { id:string; category:SourceCategory; title:string; classification:SourceClassification|null; acceptedBy:string|null; acceptedAt:string|null; reviewedHash:string|null; bibliography:SourceBibliography }
/** TT 4.2.4: the bibliographic facts a source must carry before it can back a canonical claim (copied from the
 *  governed intake by source:apply; a legacy record has none of them). Nothing here is ever filled in by a machine. */
export interface SourceBibliography { authority:string|null; edition:string|null; authors:string[]; isbn:string|null; identifier:string|null; url:string|null; license:string|null; effectiveDate:string|null }
const textOrNull=(v:unknown)=>typeof v==='string'&&v.trim()?v:null;
export interface SourceRegistry { byId:Map<string,SourceEntry> }

export function parseSourceRegistry(raw:any):{registry:SourceRegistry;issues:string[]}{
  const issues:string[]=[];
  const byId=new Map<string,SourceEntry>();
  if(!raw||raw.schema!==SOURCE_REGISTRY_SCHEMA||!Array.isArray(raw.sources)) return {registry:{byId},issues:['SOURCE_REGISTRY_INVALID']};
  for(const s of raw.sources){
    if(typeof s?.id!=='string'||!s.id) { issues.push('SOURCE_ID_MISSING'); continue; }
    if(!SOURCE_CATEGORIES.includes(s.category)) issues.push(`SOURCE_CATEGORY_INVALID:${s.id}`);
    if(byId.has(s.id)) issues.push(`SOURCE_DUPLICATE:${s.id}`);
    byId.set(s.id,{id:s.id,category:s.category,title:String(s.title??''),
      classification:s.classification==='HUMAN_ACCEPTED'||s.classification==='PROPOSED'?s.classification:null,
      acceptedBy:typeof s.acceptedBy==='string'?s.acceptedBy:null,acceptedAt:typeof s.acceptedAt==='string'?s.acceptedAt:null,reviewedHash:typeof s.reviewedHash==='string'?s.reviewedHash:null,
      bibliography:{authority:textOrNull(s.authority),edition:textOrNull(s.edition),
        authors:Array.isArray(s.bibliographic?.authors)?s.bibliographic.authors.filter((a:unknown)=>typeof a==='string'&&a.trim()):[],
        isbn:textOrNull(s.bibliographic?.isbn),identifier:textOrNull(s.bibliographic?.identifier),url:textOrNull(s.bibliographic?.url),
        license:textOrNull(s.license),effectiveDate:textOrNull(s.effectiveDate)}});
  }
  return {registry:{byId},issues};
}

export const claimKindOf=(category:string):ClaimKind=>category==='species-name'?'display-translation':'chemistry';

export interface Provenance { kind:ClaimKind; categories:SourceCategory[]; unregistered:string[]; acceptable:boolean }
export function provenanceOf(sourceRefs:readonly string[],registry:SourceRegistry,kind:ClaimKind):Provenance{
  const categories:SourceCategory[]=[];const unregistered:string[]=[];
  for(const id of sourceRefs){ const s=registry.byId.get(id); if(s) categories.push(s.category); else unregistered.push(id); }
  return {kind,categories:[...new Set(categories)].sort(),unregistered,acceptable:categories.some(c=>ACCEPTABLE[kind].includes(c))};
}

// ------------------------------------------------------------------------------------------------------------------
// P2.4 closeout (A1): canonical authoring needs more than a compatible category. Three separate facts:
//   categoryCompatible        — the category is acceptable for the claim kind (the P1.9 policy above)
//   humanAccepted             — a person accepted the source through governed intake (HUMAN_ACCEPTED, with who,
//                               when and the reviewed intake hash; never an automation identity)
//   canonicalAuthoringEligible — both. Only this lets a block enter canonical structured theory.
// A legacy PROPOSED source keeps working for legacy content and reports; it never satisfies the governed apply.
// TT 4.2.4 adds a fourth fact, bibliographicComplete: title, publisher/authority, edition (version), at least one
// author, an ISBN / URL / identifier, a licence and a parseable effective date (the reviewer is acceptedBy, checked by
// humanAccepted). A source missing any of them is never eligible, so a value it would back (e.g. a molar mass) stays
// unknown. The check never fills a field in; it only names the missing ones.
export type CanonicalSourceIssue='SOURCE_UNREGISTERED'|'SOURCE_CATEGORY_NOT_ACCEPTABLE'|'SOURCE_NOT_HUMAN_ACCEPTED'|'SOURCE_BIBLIOGRAPHY_INCOMPLETE';
export const BIBLIOGRAPHY_FIELDS=['title','authority','edition','authors','isbnOrUrl','license','effectiveDate'] as const;
export function missingBibliography(entry:SourceEntry|undefined):string[]{
  if(!entry) return [...BIBLIOGRAPHY_FIELDS];
  const b=entry.bibliography??{} as SourceBibliography; const out:string[]=[];
  if(!entry.title.trim()) out.push('title');
  if(!b.authority) out.push('authority');
  if(!b.edition) out.push('edition');
  if(!b.authors?.length) out.push('authors');
  if(!b.isbn&&!b.url&&!b.identifier) out.push('isbnOrUrl');
  if(!b.license) out.push('license');
  if(!b.effectiveDate||Number.isNaN(Date.parse(b.effectiveDate))) out.push('effectiveDate');
  return out;
}
export function sourceAcceptance(entry:SourceEntry|undefined,kind:ClaimKind='chemistry'){
  const categoryCompatible=Boolean(entry&&ACCEPTABLE[kind].includes(entry.category));
  const humanAccepted=Boolean(entry&&entry.classification==='HUMAN_ACCEPTED'&&entry.acceptedBy&&entry.acceptedBy.trim()&&!isAutomationIdentity(entry.acceptedBy)
    &&entry.acceptedAt&&!Number.isNaN(Date.parse(entry.acceptedAt))&&/^[a-f0-9]{64}$/.test(String(entry.reviewedHash)));
  const bibliographyMissing=missingBibliography(entry);
  const bibliographicComplete=bibliographyMissing.length===0;
  return {registered:Boolean(entry),categoryCompatible,humanAccepted,bibliographicComplete,bibliographyMissing,canonicalAuthoringEligible:categoryCompatible&&humanAccepted&&bibliographicComplete};
}
/** Why each cited source can or cannot support canonical structured theory (stable taxonomy, one code per source). */
export function canonicalSourceIssues(sourceRefs:readonly string[],registry:SourceRegistry,kind:ClaimKind='chemistry'):Array<{ref:string;code:CanonicalSourceIssue}>{
  const out:Array<{ref:string;code:CanonicalSourceIssue}>=[];
  for(const ref of sourceRefs){
    const a=sourceAcceptance(registry.byId.get(ref),kind);
    if(!a.registered) out.push({ref,code:'SOURCE_UNREGISTERED'});
    else if(!a.categoryCompatible) out.push({ref,code:'SOURCE_CATEGORY_NOT_ACCEPTABLE'});
    else if(!a.humanAccepted) out.push({ref,code:'SOURCE_NOT_HUMAN_ACCEPTED'});
    else if(!a.bibliographicComplete) out.push({ref,code:'SOURCE_BIBLIOGRAPHY_INCOMPLETE'});
  }
  return out;
}
