export interface OrganicMoleculeRecord {
  id:string; formula:string; name:string; class:string; carbonCount:number; carbonValence:number;
  homologSeries?:string; functionalGroups:string[]; ringSize?:number; aromatic?:boolean;
  sourceRefs:string[]; reviewStatus:'pending'|'approved';
}
export interface OrganicReactionRecord {
  id:string; reactionType:string; reactantIds:string[]; productIds:string[]; conditions:Record<string,unknown>;
  observation:Record<string,unknown>; sourceRefs:string[]; reviewStatus:'pending'|'approved';
}
type MoleculeResult=(OrganicMoleculeRecord&{modeled:true})|{modeled:false;code:'ORGANIC_MOLECULE_NOT_MODELED'};
type ReactionResult=(OrganicReactionRecord&{modeled:true})|{modeled:false;code:'ORGANIC_REACTION_NOT_MODELED'};
type HomologResult=(OrganicMoleculeRecord&{modeled:true})|{modeled:false;code:'ORGANIC_HOMOLOG_NOT_MODELED'};
function nonempty(value:unknown):value is string{return typeof value==='string'&&value.length>0;}
export class OrganicKnowledgeBase {
  #molecules:Map<string,OrganicMoleculeRecord>;
  #reactions:Map<string,OrganicReactionRecord>;
  private constructor(molecules:OrganicMoleculeRecord[],reactions:OrganicReactionRecord[]){
    this.#molecules=new Map(molecules.map(x=>[x.id,Object.freeze({...x,functionalGroups:[...x.functionalGroups],sourceRefs:[...x.sourceRefs]})]));
    this.#reactions=new Map(reactions.map(x=>[x.id,Object.freeze({...x,reactantIds:[...x.reactantIds],productIds:[...x.productIds],conditions:{...x.conditions},observation:{...x.observation},sourceRefs:[...x.sourceRefs]})]));
  }
  static from(raw:any){
    if(!Array.isArray(raw?.molecules)||!Array.isArray(raw?.reactions)) throw new Error('ORGANIC_DATA_INVALID');
    const moleculeIds=new Set<string>();
    for(const m of raw.molecules){
      if(!m||!nonempty(m.id)||!nonempty(m.formula)||!nonempty(m.name)||!nonempty(m.class)||!Number.isInteger(m.carbonCount)||m.carbonCount<1||m.carbonValence!==4||!Array.isArray(m.functionalGroups)||!Array.isArray(m.sourceRefs)||!m.sourceRefs.length) throw new Error('ORGANIC_MOLECULE_INVALID');
      if(moleculeIds.has(m.id)) throw new Error('ORGANIC_MOLECULE_DUPLICATE'); moleculeIds.add(m.id);
    }
    const reactionIds=new Set<string>();
    for(const r of raw.reactions){
      if(!r||!nonempty(r.id)||!nonempty(r.reactionType)||!Array.isArray(r.reactantIds)||!r.reactantIds.length||!Array.isArray(r.productIds)||!r.productIds.length||!r.observation||typeof r.observation!=='object'||!Array.isArray(r.sourceRefs)||!r.sourceRefs.length) throw new Error('ORGANIC_REACTION_INVALID');
      if(reactionIds.has(r.id)) throw new Error('ORGANIC_REACTION_DUPLICATE'); reactionIds.add(r.id);
    }
    return new OrganicKnowledgeBase(raw.molecules,raw.reactions);
  }
  molecule(id:string):MoleculeResult{const record=this.#molecules.get(id);return record?{modeled:true,...record,functionalGroups:[...record.functionalGroups],sourceRefs:[...record.sourceRefs]}:{modeled:false,code:'ORGANIC_MOLECULE_NOT_MODELED'};}
  nomenclature(id:string){const record=this.molecule(id);return record.modeled?{modeled:true,id:record.id,name:record.name,formula:record.formula}:{modeled:false,code:'ORGANIC_MOLECULE_NOT_MODELED' as const};}
  isomers(formula:string):OrganicMoleculeRecord[]{return [...this.#molecules.values()].filter(x=>x.formula===formula).map(x=>({...x,functionalGroups:[...x.functionalGroups],sourceRefs:[...x.sourceRefs]}));}
  homolog(series:string,carbonCount:number):HomologResult{const record=[...this.#molecules.values()].find(x=>x.homologSeries===series&&x.carbonCount===carbonCount);return record?{modeled:true,...record,functionalGroups:[...record.functionalGroups],sourceRefs:[...record.sourceRefs]}:{modeled:false,code:'ORGANIC_HOMOLOG_NOT_MODELED'};}
  reaction(id:string):ReactionResult{const record=this.#reactions.get(id);return record?{modeled:true,...record,reactantIds:[...record.reactantIds],productIds:[...record.productIds],conditions:{...record.conditions},observation:{...record.observation},sourceRefs:[...record.sourceRefs]}:{modeled:false,code:'ORGANIC_REACTION_NOT_MODELED'};}
}
