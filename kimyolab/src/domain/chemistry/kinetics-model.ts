export function averageReactionRate(input:{initialConcentration:number;finalConcentration:number;deltaSeconds:number}){
  if(!Number.isFinite(input.initialConcentration)||!Number.isFinite(input.finalConcentration)||!(input.deltaSeconds>0)) throw new Error('KINETICS_INPUT_INVALID');
  return Math.abs(input.finalConcentration-input.initialConcentration)/input.deltaSeconds;
}
/** The closed set of modeled effects (P2.1: also the learner's answer choices). */
export const KINETICS_EFFECTS=['increase','decrease','no-change'] as const;
export interface KineticsRecord{id:string;factor:string;change:string;effect:'increase'|'decrease'|'no-change';sourceRefs:string[];reviewStatus:'pending'|'approved'}
export class KineticsModel{
  #records=new Map<string,KineticsRecord>();
  private constructor(records:KineticsRecord[]){for(const r of records)this.#records.set(`${r.factor}|${r.change}`,Object.freeze({...r,sourceRefs:[...r.sourceRefs]}));}
  static from(raw:any){if(!Array.isArray(raw?.records))throw new Error('KINETICS_DATA_INVALID');for(const r of raw.records){if(!r||typeof r.factor!=='string'||typeof r.change!=='string'||!(KINETICS_EFFECTS as readonly string[]).includes(r.effect)||!Array.isArray(r.sourceRefs)||!r.sourceRefs.length)throw new Error('KINETICS_RECORD_INVALID');}return new KineticsModel(raw.records);}
  effect(factor:string,change:string){const r=this.#records.get(`${factor}|${change}`);return r?{modeled:true as const,...r}:{modeled:false as const,code:'KINETICS_EFFECT_NOT_MODELED' as const};}
}
