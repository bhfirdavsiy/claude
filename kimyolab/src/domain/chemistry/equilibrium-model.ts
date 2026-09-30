/** The closed set of modeled shifts (P2.1: also the learner's answer choices). */
export const EQUILIBRIUM_SHIFTS=['reactants','products','no-shift'] as const;
export interface EquilibriumRecord{reactionId:string;perturbation:string;shift:'reactants'|'products'|'no-shift';explanation:string;sourceRefs:string[];reviewStatus:'pending'|'approved'}
export class EquilibriumModel{
  #records=new Map<string,EquilibriumRecord>();
  private constructor(records:EquilibriumRecord[]){for(const r of records)this.#records.set(`${r.reactionId}|${r.perturbation}`,Object.freeze({...r,sourceRefs:[...r.sourceRefs]}));}
  static from(raw:any){if(!Array.isArray(raw?.records))throw new Error('EQUILIBRIUM_DATA_INVALID');for(const r of raw.records){if(!r||typeof r.reactionId!=='string'||typeof r.perturbation!=='string'||!(EQUILIBRIUM_SHIFTS as readonly string[]).includes(r.shift)||typeof r.explanation!=='string'||!Array.isArray(r.sourceRefs)||!r.sourceRefs.length)throw new Error('EQUILIBRIUM_RECORD_INVALID');}return new EquilibriumModel(raw.records);}
  resolve(reactionId:string,perturbation:string){const r=this.#records.get(`${reactionId}|${perturbation}`);return r?{modeled:true as const,...r}:{modeled:false as const,code:'EQUILIBRIUM_CASE_NOT_MODELED' as const};}
}
