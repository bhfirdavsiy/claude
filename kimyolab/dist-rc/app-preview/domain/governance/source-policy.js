// Source provenance policy (P1.9). A content claim's approval counts only if the claim cites at least one REGISTERED
// source whose category is acceptable for the kind of claim. Chemistry truth and display translation (localized
// names) are different kinds of claims with different acceptable provenance. INTERNAL_PROPOSAL (e.g. an internal
// migration set, or anything the agent drafted) is never enough on its own.
//
// This only ever makes approval HARDER: APPROVED_WITHOUT_SOURCE stays a gate FAIL, and an approval backed only by
// unacceptable provenance is a FAIL too (APPROVED_WITHOUT_ACCEPTABLE_SOURCE).

export const SOURCE_REGISTRY_SCHEMA='kimyolab.source-registry.v1';
                                                                                                                                             
export const SOURCE_CATEGORIES                          =['CURRICULUM','TEXTBOOK','OFFICIAL_STANDARD','AUTHORITATIVE_REFERENCE','LOCALIZATION_GLOSSARY','INTERNAL_PROPOSAL'];
                                                        

/** Which provenance can make an approval count, per claim kind. */
export const ACCEPTABLE                                            ={
  chemistry:['CURRICULUM','TEXTBOOK','OFFICIAL_STANDARD','AUTHORITATIVE_REFERENCE'],
  'display-translation':['LOCALIZATION_GLOSSARY','CURRICULUM','TEXTBOOK','OFFICIAL_STANDARD'],
};

                                                                                 
                                                                

export function parseSourceRegistry(raw    )                                          {
  const issues         =[];
  const byId=new Map                    ();
  if(!raw||raw.schema!==SOURCE_REGISTRY_SCHEMA||!Array.isArray(raw.sources)) return {registry:{byId},issues:['SOURCE_REGISTRY_INVALID']};
  for(const s of raw.sources){
    if(typeof s?.id!=='string'||!s.id) { issues.push('SOURCE_ID_MISSING'); continue; }
    if(!SOURCE_CATEGORIES.includes(s.category)) issues.push(`SOURCE_CATEGORY_INVALID:${s.id}`);
    if(byId.has(s.id)) issues.push(`SOURCE_DUPLICATE:${s.id}`);
    byId.set(s.id,{id:s.id,category:s.category,title:String(s.title??'')});
  }
  return {registry:{byId},issues};
}

export const claimKindOf=(category       )          =>category==='species-name'?'display-translation':'chemistry';

                                                                                                                      
export function provenanceOf(sourceRefs                  ,registry               ,kind          )           {
  const categories                 =[];const unregistered         =[];
  for(const id of sourceRefs){ const s=registry.byId.get(id); if(s) categories.push(s.category); else unregistered.push(id); }
  return {kind,categories:[...new Set(categories)].sort(),unregistered,acceptable:categories.some(c=>ACCEPTABLE[kind].includes(c))};
}
