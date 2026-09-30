export type HydrolysisMedium='acidic'|'basic'|'neutral';
export const HYDROLYSIS_MEDIA:readonly HydrolysisMedium[]=Object.freeze(['acidic','basic','neutral']);
export interface HydrolysisRecord{salt:string;medium:HydrolysisMedium;explanation:string;sourceRefs:string[];reviewStatus:'pending'|'approved'}
export type HydrolysisResult=(HydrolysisRecord&{modeled:true})|{modeled:false;code:'HYDROLYSIS_NOT_MODELED'};
/** Colour ids of the indicator (P1.5). Display words are presentation; the colour itself is content (reviewed). */
export type IndicatorColor='red'|'blue'|'violet'|'yellow'|'orange'|'colorless'|'crimson';
const COLORS=new Set<string>(['red','blue','violet','yellow','orange','colorless','crimson']);
export interface HydrolysisIndicator{id:string;colors:Readonly<Partial<Record<HydrolysisMedium,IndicatorColor>>>;explanation:string;sourceRefs:string[];reviewStatus:'pending'|'approved'}
export type IndicatorResult={modeled:true;indicator:string;color:IndicatorColor}|{modeled:false;code:'HYDROLYSIS_INDICATOR_NOT_MODELED'};

/** Structural check of the indicator block (P1.5 closeout). Throws HYDROLYSIS_INDICATOR_INVALID:<field>. */
export function validateIndicator(ind:any):void{
  const bad=(f:string)=>{ throw new Error(`HYDROLYSIS_INDICATOR_INVALID:${f}`); };
  if(!ind||typeof ind!=='object'||Array.isArray(ind)) bad('block');
  if(typeof ind.id!=='string'||!ind.id) bad('id');
  if(!ind.colors||typeof ind.colors!=='object'||Array.isArray(ind.colors)) bad('colors');
  for(const [medium,color] of Object.entries(ind.colors)){
    if(!HYDROLYSIS_MEDIA.includes(medium as HydrolysisMedium)) bad(`colors.${medium}`);
    if(!COLORS.has(color as string)) bad(`colors.${medium}`);
  }
  if(typeof ind.explanation!=='string'||!ind.explanation) bad('explanation');
  if(!Array.isArray(ind.sourceRefs)||!ind.sourceRefs.length||ind.sourceRefs.some((r:unknown)=>typeof r!=='string'||!r)) bad('sourceRefs');
  if(ind.reviewStatus!=='pending'&&ind.reviewStatus!=='approved') bad('reviewStatus');
}
/** Media the indicator block gives a colour for (the rest cannot be revealed). */
export function indicatorCoverage(ind:any):{modeled:HydrolysisMedium[];missing:HydrolysisMedium[]}{
  const colors=ind?.colors??{};
  return {modeled:HYDROLYSIS_MEDIA.filter(m=>COLORS.has(colors[m])),missing:HYDROLYSIS_MEDIA.filter(m=>!COLORS.has(colors[m]))};
}

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
    // P1.5: the indicator that reveals the medium is content too (optional block; absent → reveal fails closed).
    // Structure is validated here (id, colors object, sourceRefs, explanation, reviewStatus); a medium WITHOUT a
    // colour is not an error at load time — revealing it fails closed with HYDROLYSIS_INDICATOR_NOT_MODELED.
    const ind=raw?.indicator;
    if(ind!==undefined) validateIndicator(ind);
    return new HydrolysisModel(records,ind??null);
  }
  classify(salt:string):HydrolysisResult{const r=this.#records.get(salt);return r?{modeled:true,...r}:{modeled:false,code:'HYDROLYSIS_NOT_MODELED'};}
  /** The modeled salts, in content order (P1.5: the learner chooses among exactly these). */
  salts():string[]{return [...this.#records.keys()];}
  /** The indicator colour in a medium, from content. */
  indicatorColor(medium:HydrolysisMedium):IndicatorResult{
    const ind=this.#indicator;
    const color=ind&&HYDROLYSIS_MEDIA.includes(medium)?(ind.colors as Partial<Record<HydrolysisMedium,IndicatorColor>>)[medium]:undefined;
    if(!ind||!color) return {modeled:false,code:'HYDROLYSIS_INDICATOR_NOT_MODELED'};
    return {modeled:true,indicator:ind.id,color};
  }
}
