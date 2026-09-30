export type HydrolysisMedium='acidic'|'basic'|'neutral';
export const HYDROLYSIS_MEDIA:readonly HydrolysisMedium[]=Object.freeze(['acidic','basic','neutral']);
export interface HydrolysisRecord{salt:string;medium:HydrolysisMedium;explanation:string;sourceRefs:string[];reviewStatus:'pending'|'approved'}
export type HydrolysisResult=(HydrolysisRecord&{modeled:true})|{modeled:false;code:'HYDROLYSIS_NOT_MODELED'};
/** Colour ids of the indicator (P1.5). Display words are presentation; the colour itself is content (reviewed). */
export type IndicatorColor='red'|'blue'|'violet'|'yellow'|'orange'|'colorless'|'crimson';
const COLORS=new Set<string>(['red','blue','violet','yellow','orange','colorless','crimson']);
export interface HydrolysisIndicator{id:string;colors:Readonly<Record<HydrolysisMedium,IndicatorColor>>;explanation:string;sourceRefs:string[];reviewStatus:'pending'|'approved'}
export type IndicatorResult={modeled:true;indicator:string;color:IndicatorColor}|{modeled:false;code:'HYDROLYSIS_INDICATOR_NOT_MODELED'};

export class HydrolysisModel{
  #records:Map<string,HydrolysisRecord>;
  #indicator:HydrolysisIndicator|null;
  private constructor(records:HydrolysisRecord[],indicator:HydrolysisIndicator|null){
    this.#records=new Map(records.map(r=>[r.salt,Object.freeze({...r,sourceRefs:[...r.sourceRefs]})]));
    this.#indicator=indicator?Object.freeze({...indicator,colors:Object.freeze({...indicator.colors}),sourceRefs:[...indicator.sourceRefs]}):null;
  }
  static from(raw:any){
    const records=raw?.records;
    if(!Array.isArray(records)) throw new Error('HYDROLYSIS_DATA_INVALID');
    const ids=new Set<string>();
    for(const r of records){
      if(!r||typeof r.salt!=='string'||!HYDROLYSIS_MEDIA.includes(r.medium)||typeof r.explanation!=='string'||!Array.isArray(r.sourceRefs)||!r.sourceRefs.length) throw new Error('HYDROLYSIS_RECORD_INVALID');
      if(ids.has(r.salt)) throw new Error('HYDROLYSIS_DUPLICATE'); ids.add(r.salt);
    }
    // P1.5: the indicator that reveals the medium is content too (optional; absent → reveal fails closed)
    const ind=raw?.indicator;
    if(ind!==undefined){
      const ok=ind&&typeof ind.id==='string'&&ind.id&&ind.colors&&HYDROLYSIS_MEDIA.every(m=>COLORS.has(ind.colors[m]))&&Object.keys(ind.colors).length===HYDROLYSIS_MEDIA.length
        &&typeof ind.explanation==='string'&&Array.isArray(ind.sourceRefs)&&ind.sourceRefs.length;
      if(!ok) throw new Error('HYDROLYSIS_INDICATOR_INVALID');
    }
    return new HydrolysisModel(records,ind??null);
  }
  classify(salt:string):HydrolysisResult{const r=this.#records.get(salt);return r?{modeled:true,...r}:{modeled:false,code:'HYDROLYSIS_NOT_MODELED'};}
  /** The modeled salts, in content order (P1.5: the learner chooses among exactly these). */
  salts():string[]{return [...this.#records.keys()];}
  /** The indicator colour in a medium, from content. */
  indicatorColor(medium:HydrolysisMedium):IndicatorResult{
    const ind=this.#indicator;
    if(!ind||!HYDROLYSIS_MEDIA.includes(medium)) return {modeled:false,code:'HYDROLYSIS_INDICATOR_NOT_MODELED'};
    return {modeled:true,indicator:ind.id,color:ind.colors[medium]};
  }
}
