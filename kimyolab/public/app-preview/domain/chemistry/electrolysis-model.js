                                                                                                
                                                              
                                              
                                            
                      
                                    
 
                                                                                                                   
const key=(x                  )=>`${x.electrolyte}|${x.phase}|${x.electrode}`;
export class ElectrolysisModel{
  #records                               ;
          constructor(records                     ){this.#records=new Map(records.map(r=>[key(r),Object.freeze({...r,cathode:{...r.cathode},anode:{...r.anode},sourceRefs:[...r.sourceRefs]})]));}
  static from(raw    ){
    const records=raw?.records;if(!Array.isArray(records)) throw new Error('ELECTROLYSIS_DATA_INVALID');
    const ids=new Set        ();
    for(const r of records){
      if(!r||typeof r.electrolyte!=='string'||!['aq','l'].includes(r.phase)||!['inert','active'].includes(r.electrode)||typeof r.cathode?.product!=='string'||typeof r.anode?.product!=='string'||!Array.isArray(r.sourceRefs)||!r.sourceRefs.length) throw new Error('ELECTROLYSIS_RECORD_INVALID');
      const k=key(r);if(ids.has(k))throw new Error('ELECTROLYSIS_DUPLICATE');ids.add(k);
    }
    return new ElectrolysisModel(records);
  }
  resolve(query                  )                   {const r=this.#records.get(key(query));return r?{modeled:true,...r}:{modeled:false,code:'ELECTROLYSIS_NOT_MODELED'};}
}
