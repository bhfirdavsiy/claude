                                                       
                                                                                                                                                                     
export class ManganeseRedoxModel{
  #records                                          ;
          constructor(records                       ){this.#records=new Map(records.map(r=>[r.medium,Object.freeze({...r,sourceRefs:[...r.sourceRefs]})]));}
  static from(raw    ){const records=raw?.records;if(!Array.isArray(records))throw new Error('MANGANESE_DATA_INVALID');for(const r of records){if(!['acidic','neutral','basic'].includes(r?.medium)||typeof r.reactant!=='string'||typeof r.product!=='string'||typeof r.observation!=='string'||!Array.isArray(r.sourceRefs)||!r.sourceRefs.length)throw new Error('MANGANESE_RECORD_INVALID');}return new ManganeseRedoxModel(records);}
  /** P2.1: the modelled media — the ONE canonical option set for the medium choice (UI never hard-codes it). */
  media()                  {return [...this.#records.keys()].sort();}
  resolve(medium                ){const r=this.#records.get(medium);if(!r)throw new Error('MANGANESE_MEDIUM_NOT_MODELED');return {...r};}
}
