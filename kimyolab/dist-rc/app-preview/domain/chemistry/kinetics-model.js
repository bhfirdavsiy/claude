export function averageReactionRate(input                                                                            ){
  if(!Number.isFinite(input.initialConcentration)||!Number.isFinite(input.finalConcentration)||!(input.deltaSeconds>0)) throw new Error('KINETICS_INPUT_INVALID');
  return Math.abs(input.finalConcentration-input.initialConcentration)/input.deltaSeconds;
}
                                                                                                                                                                     
export class KineticsModel{
  #records=new Map                       ();
          constructor(records                 ){for(const r of records)this.#records.set(`${r.factor}|${r.change}`,Object.freeze({...r,sourceRefs:[...r.sourceRefs]}));}
  static from(raw    ){if(!Array.isArray(raw?.records))throw new Error('KINETICS_DATA_INVALID');for(const r of raw.records){if(!r||typeof r.factor!=='string'||typeof r.change!=='string'||!['increase','decrease','no-change'].includes(r.effect)||!Array.isArray(r.sourceRefs)||!r.sourceRefs.length)throw new Error('KINETICS_RECORD_INVALID');}return new KineticsModel(raw.records);}
  effect(factor       ,change       ){const r=this.#records.get(`${factor}|${change}`);return r?{modeled:true,...r}:{modeled:false,code:'KINETICS_EFFECT_NOT_MODELED'         };}
}
