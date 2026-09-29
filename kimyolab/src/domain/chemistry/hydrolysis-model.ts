export type HydrolysisMedium='acidic'|'basic'|'neutral';
export interface HydrolysisRecord{salt:string;medium:HydrolysisMedium;explanation:string;sourceRefs:string[];reviewStatus:'pending'|'approved'}
export type HydrolysisResult=(HydrolysisRecord&{modeled:true})|{modeled:false;code:'HYDROLYSIS_NOT_MODELED'};
export class HydrolysisModel{
  #records:Map<string,HydrolysisRecord>;
  private constructor(records:HydrolysisRecord[]){this.#records=new Map(records.map(r=>[r.salt,Object.freeze({...r,sourceRefs:[...r.sourceRefs]})]));}
  static from(raw:any){
    const records=raw?.records;
    if(!Array.isArray(records)) throw new Error('HYDROLYSIS_DATA_INVALID');
    const ids=new Set<string>();
    for(const r of records){
      if(!r||typeof r.salt!=='string'||!['acidic','basic','neutral'].includes(r.medium)||typeof r.explanation!=='string'||!Array.isArray(r.sourceRefs)||!r.sourceRefs.length) throw new Error('HYDROLYSIS_RECORD_INVALID');
      if(ids.has(r.salt)) throw new Error('HYDROLYSIS_DUPLICATE'); ids.add(r.salt);
    }
    return new HydrolysisModel(records);
  }
  classify(salt:string):HydrolysisResult{const r=this.#records.get(salt);return r?{modeled:true,...r}:{modeled:false,code:'HYDROLYSIS_NOT_MODELED'};}
}
