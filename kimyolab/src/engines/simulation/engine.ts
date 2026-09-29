import { completeCapabilities, type EngineCapabilities } from '../shared/types.ts';
import { validateEvidence, type Evidence } from '../../runtime/evidence/types.ts';

export interface SimulationConfig<State,Action> {
  id:string;
  version:string;
  seed:number;
  initialState:State;
  reducer:(state:State,action:Action,seed:number)=>State;
  evidenceCollector?:(state:State,action:Action)=>Evidence[];
  capabilities?:Partial<EngineCapabilities>;
}

function clone<T>(value:T):T { return JSON.parse(JSON.stringify(value)); }

export class StatefulSimulationEngine<State,Action> {
  private readonly config:SimulationConfig<State,Action>;
  private state:State;
  private evidence:Evidence[]=[];

  constructor(config:SimulationConfig<State,Action>){
    this.config=config;
    this.state=clone(config.initialState);
  }

  dispatch(action:Action):State {
    this.state=clone(this.config.reducer(clone(this.state),clone(action),this.config.seed));
    const emitted=(this.config.evidenceCollector?.(clone(this.state),clone(action))??[]).map(validateEvidence);
    this.evidence.push(...clone(emitted));
    return this.getState();
  }
  getState():State { return clone(this.state); }
  getEvidence():Evidence[] { return clone(this.evidence); }
  getSeed():number { return this.config.seed; }
  getCapabilities():EngineCapabilities { return {...completeCapabilities(),...(this.config.capabilities??{})}; }
  serialize():string { return JSON.stringify({id:this.config.id,version:this.config.version,seed:this.config.seed,state:this.state,evidence:this.evidence}); }
  restore(serialized:string):void {
    let parsed:any;
    try { parsed=JSON.parse(serialized); } catch { throw new Error('SIMULATION_STATE_INVALID'); }
    if(!parsed||parsed.id!==this.config.id||parsed.version!==this.config.version||parsed.seed!==this.config.seed) throw new Error('SIMULATION_STATE_INVALID');
    if(!Array.isArray(parsed.evidence)) throw new Error('SIMULATION_STATE_INVALID');
    this.state=clone(parsed.state);
    this.evidence=parsed.evidence.map(validateEvidence);
  }
  reset():void { this.state=clone(this.config.initialState); this.evidence=[]; }
}
