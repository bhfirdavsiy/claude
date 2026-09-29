export type Beta2Disposition='existing-engine'|'needs-capability'|'needs-content'|'remap-required';

export interface Beta2CapabilityRow {
  learningUnitId:string;
  legacyId:string;
  grade:9|10;
  primaryPracticeId:string;
  disposition:Beta2Disposition;
  requiredCapabilities:string[];
  reason:string;
}

const dispositions=new Set<Beta2Disposition>(['existing-engine','needs-capability','needs-content','remap-required']);
function nonempty(v:unknown):v is string{return typeof v==='string'&&v.trim().length>0;}

export function loadBeta2CapabilityMatrix(raw:unknown):Beta2CapabilityRow[]{
  if(!Array.isArray(raw)) throw new Error('BETA2_CAPABILITY_INVALID:root');
  const ids=new Set<string>();
  const legacyIds=new Set<string>();
  return raw.map((item,index)=>{
    if(!item||typeof item!=='object'||Array.isArray(item)) throw new Error(`BETA2_CAPABILITY_INVALID:${index}:record`);
    const v=item as Record<string,unknown>;
    if(!nonempty(v.learningUnitId)||!nonempty(v.legacyId)||!nonempty(v.primaryPracticeId)||!nonempty(v.reason)) throw new Error(`BETA2_CAPABILITY_INVALID:${index}:required`);
    if(v.grade!==9&&v.grade!==10) throw new Error(`BETA2_CAPABILITY_INVALID:${index}:grade`);
    if(!dispositions.has(v.disposition as Beta2Disposition)) throw new Error(`BETA2_CAPABILITY_INVALID:${index}:disposition`);
    if(!Array.isArray(v.requiredCapabilities)||v.requiredCapabilities.some(x=>!nonempty(x))) throw new Error(`BETA2_CAPABILITY_INVALID:${index}:capabilities`);
    if(ids.has(v.learningUnitId)) throw new Error(`BETA2_CAPABILITY_DUPLICATE:${v.learningUnitId}`);
    if(legacyIds.has(v.legacyId)) throw new Error(`BETA2_CAPABILITY_DUPLICATE_LEGACY:${v.legacyId}`);
    ids.add(v.learningUnitId);legacyIds.add(v.legacyId);
    return v as unknown as Beta2CapabilityRow;
  });
}

export function summarizeBeta2Capabilities(rows:Beta2CapabilityRow[]){
  const byDisposition:Record<Beta2Disposition,number>={
    'existing-engine':0,'needs-capability':0,'needs-content':0,'remap-required':0,
  };
  const capabilities=new Map<string,number>();
  for(const row of rows){
    byDisposition[row.disposition]++;
    for(const capability of row.requiredCapabilities) capabilities.set(capability,(capabilities.get(capability)??0)+1);
  }
  return {
    total:rows.length,
    byDisposition,
    capabilities:Object.fromEntries([...capabilities.entries()].sort(([a],[b])=>a.localeCompare(b))),
  };
}
