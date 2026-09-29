                                          
function identity(s        ){return [s.formula,s.phase,s.charge,s.structuralVariant||'',s.allotrope||''].join('|')}
export class SpeciesRegistry {
  #byId                    ; #byFormula                      ;
          constructor(records          ){
    this.#byId=new Map(records.map(s=>[s.id,Object.freeze({...s})]));
    this.#byFormula=new Map();
    for(const s of this.#byId.values()){const list=this.#byFormula.get(s.formula)||[];list.push(s);this.#byFormula.set(s.formula,list)}
  }
  static from(records          )                 {
    const ids=new Set        (), identities=new Set        ();
    for(const s of records){
      if(!s.id||!s.formula||!s.phase||!Array.isArray(s.sourceRefs)||!s.sourceRefs.length) throw new Error('SPECIES_INVALID');
      if(ids.has(s.id)) throw new Error('SPECIES_DUPLICATE_ID'); ids.add(s.id);
      const key=identity(s); if(identities.has(key)) throw new Error('SPECIES_DUPLICATE_IDENTITY'); identities.add(key);
    }
    return new SpeciesRegistry(records);
  }
  get size(){return this.#byId.size}
  byId(id       ){return this.#byId.get(id)}
  byFormula(formula       ){return [...(this.#byFormula.get(formula)||[])]}
  requireByFormula(formula       )         {const all=this.byFormula(formula);if(all.length!==1) throw new Error(all.length?'SPECIES_AMBIGUOUS':'SPECIES_NOT_FOUND');return all[0]}
}
