// Source provenance policy (P1.9). A content claim's approval counts only if the claim cites at least one REGISTERED
// source whose category is acceptable for the kind of claim. Chemistry truth and display translation (localized
// names) are different kinds of claims with different acceptable provenance. INTERNAL_PROPOSAL (e.g. an internal
// migration set, or anything the agent drafted) is never enough on its own.
//
// This only ever makes approval HARDER: APPROVED_WITHOUT_SOURCE stays a gate FAIL, and an approval backed only by
// unacceptable provenance is a FAIL too (APPROVED_WITHOUT_ACCEPTABLE_SOURCE).

import {isAutomationIdentity} from './identity.js';

export const SOURCE_REGISTRY_SCHEMA='kimyolab.source-registry.v1';
                                                                                                                                             
export const SOURCE_CATEGORIES                          =['CURRICULUM','TEXTBOOK','OFFICIAL_STANDARD','AUTHORITATIVE_REFERENCE','LOCALIZATION_GLOSSARY','INTERNAL_PROPOSAL'];
                                                        

/** Which provenance can make an approval count, per claim kind. */
export const ACCEPTABLE                                            ={
  chemistry:['CURRICULUM','TEXTBOOK','OFFICIAL_STANDARD','AUTHORITATIVE_REFERENCE'],
  'display-translation':['LOCALIZATION_GLOSSARY','CURRICULUM','TEXTBOOK','OFFICIAL_STANDARD'],
};

                                                             
/** A registered source with the governance facts canonical authoring needs (P2.4 closeout A2). A source is
 *  HUMAN_ACCEPTED only through the governed source intake (npm run source:apply), pinned to the reviewed revision. */
                                                                                                                                                                                                     
                                                                

export function parseSourceRegistry(raw    )                                          {
  const issues         =[];
  const byId=new Map                    ();
  if(!raw||raw.schema!==SOURCE_REGISTRY_SCHEMA||!Array.isArray(raw.sources)) return {registry:{byId},issues:['SOURCE_REGISTRY_INVALID']};
  for(const s of raw.sources){
    if(typeof s?.id!=='string'||!s.id) { issues.push('SOURCE_ID_MISSING'); continue; }
    if(!SOURCE_CATEGORIES.includes(s.category)) issues.push(`SOURCE_CATEGORY_INVALID:${s.id}`);
    if(byId.has(s.id)) issues.push(`SOURCE_DUPLICATE:${s.id}`);
    byId.set(s.id,{id:s.id,category:s.category,title:String(s.title??''),
      classification:s.classification==='HUMAN_ACCEPTED'||s.classification==='PROPOSED'?s.classification:null,
      acceptedBy:typeof s.acceptedBy==='string'?s.acceptedBy:null,acceptedAt:typeof s.acceptedAt==='string'?s.acceptedAt:null,reviewedHash:typeof s.reviewedHash==='string'?s.reviewedHash:null});
  }
  return {registry:{byId},issues};
}

export const claimKindOf=(category       )          =>category==='species-name'?'display-translation':'chemistry';

                                                                                                                      
export function provenanceOf(sourceRefs                  ,registry               ,kind          )           {
  const categories                 =[];const unregistered         =[];
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
                                                                                                                    
export function sourceAcceptance(entry                      ,kind          ='chemistry'){
  const categoryCompatible=Boolean(entry&&ACCEPTABLE[kind].includes(entry.category));
  const humanAccepted=Boolean(entry&&entry.classification==='HUMAN_ACCEPTED'&&entry.acceptedBy&&entry.acceptedBy.trim()&&!isAutomationIdentity(entry.acceptedBy)
    &&entry.acceptedAt&&!Number.isNaN(Date.parse(entry.acceptedAt))&&/^[a-f0-9]{64}$/.test(String(entry.reviewedHash)));
  return {registered:Boolean(entry),categoryCompatible,humanAccepted,canonicalAuthoringEligible:categoryCompatible&&humanAccepted};
}
/** Why each cited source can or cannot support canonical structured theory (stable taxonomy, one code per source). */
export function canonicalSourceIssues(sourceRefs                  ,registry               ,kind          ='chemistry')                                              {
  const out                                              =[];
  for(const ref of sourceRefs){
    const a=sourceAcceptance(registry.byId.get(ref),kind);
    if(!a.registered) out.push({ref,code:'SOURCE_UNREGISTERED'});
    else if(!a.categoryCompatible) out.push({ref,code:'SOURCE_CATEGORY_NOT_ACCEPTABLE'});
    else if(!a.humanAccepted) out.push({ref,code:'SOURCE_NOT_HUMAN_ACCEPTED'});
  }
  return out;
}
