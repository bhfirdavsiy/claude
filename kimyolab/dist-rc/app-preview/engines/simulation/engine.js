import { completeCapabilities,                         } from '../shared/types.js';
import { validateEvidence,               } from '../../runtime/evidence/types.js';

                                                 
            
                 
              
                     
                                                         
                                                             
                                            
 

function clone   (value  )   { return JSON.parse(JSON.stringify(value)); }

export class StatefulSimulationEngine               {
                   config                               ;
          state      ;
          evidence           =[];

  constructor(config                               ){
    this.config=config;
    this.state=clone(config.initialState);
  }

  dispatch(action       )       {
    this.state=clone(this.config.reducer(clone(this.state),clone(action),this.config.seed));
    const emitted=(this.config.evidenceCollector?.(clone(this.state),clone(action))??[]).map(validateEvidence);
    this.evidence.push(...clone(emitted));
    return this.getState();
  }
  getState()       { return clone(this.state); }
  getEvidence()            { return clone(this.evidence); }
  getSeed()        { return this.config.seed; }
  getCapabilities()                    { return {...completeCapabilities(),...(this.config.capabilities??{})}; }
  serialize()        { return JSON.stringify({id:this.config.id,version:this.config.version,seed:this.config.seed,state:this.state,evidence:this.evidence}); }
  restore(serialized       )      {
    let parsed    ;
    try { parsed=JSON.parse(serialized); } catch { throw new Error('SIMULATION_STATE_INVALID'); }
    if(!parsed||parsed.id!==this.config.id||parsed.version!==this.config.version||parsed.seed!==this.config.seed) throw new Error('SIMULATION_STATE_INVALID');
    if(!Array.isArray(parsed.evidence)) throw new Error('SIMULATION_STATE_INVALID');
    this.state=clone(parsed.state);
    this.evidence=parsed.evidence.map(validateEvidence);
  }
  reset()      { this.state=clone(this.config.initialState); this.evidence=[]; }
}
