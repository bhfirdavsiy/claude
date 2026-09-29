                                                        
                                                                                                                                               
                                                                                                             
export class HydrolysisModel{
  #records                             ;
          constructor(records                   ){this.#records=new Map(records.map(r=>[r.salt,Object.freeze({...r,sourceRefs:[...r.sourceRefs]})]));}
  static from(raw    ){
    const records=raw?.records;
    if(!Array.isArray(records)) throw new Error('HYDROLYSIS_DATA_INVALID');
    const ids=new Set        ();
    for(const r of records){
      if(!r||typeof r.salt!=='string'||!['acidic','basic','neutral'].includes(r.medium)||typeof r.explanation!=='string'||!Array.isArray(r.sourceRefs)||!r.sourceRefs.length) throw new Error('HYDROLYSIS_RECORD_INVALID');
      if(ids.has(r.salt)) throw new Error('HYDROLYSIS_DUPLICATE'); ids.add(r.salt);
    }
    return new HydrolysisModel(records);
  }
  classify(salt       )                 {const r=this.#records.get(salt);return r?{modeled:true,...r}:{modeled:false,code:'HYDROLYSIS_NOT_MODELED'};}
}
