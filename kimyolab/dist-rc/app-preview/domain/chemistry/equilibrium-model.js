/** The closed set of modeled shifts (P2.1: also the learner's answer choices). */
export const EQUILIBRIUM_SHIFTS=['reactants','products','no-shift']         ;
                                                                                                                                                                                          
export class EquilibriumModel{
  #records=new Map                          ();
          constructor(records                    ){for(const r of records)this.#records.set(`${r.reactionId}|${r.perturbation}`,Object.freeze({...r,sourceRefs:[...r.sourceRefs]}));}
  static from(raw    ){if(!Array.isArray(raw?.records))throw new Error('EQUILIBRIUM_DATA_INVALID');for(const r of raw.records){if(!r||typeof r.reactionId!=='string'||typeof r.perturbation!=='string'||!(EQUILIBRIUM_SHIFTS                     ).includes(r.shift)||typeof r.explanation!=='string'||!Array.isArray(r.sourceRefs)||!r.sourceRefs.length)throw new Error('EQUILIBRIUM_RECORD_INVALID');}return new EquilibriumModel(raw.records);}
  resolve(reactionId       ,perturbation       ){const r=this.#records.get(`${reactionId}|${perturbation}`);return r?{modeled:true         ,...r}:{modeled:false         ,code:'EQUILIBRIUM_CASE_NOT_MODELED'         };}
}
