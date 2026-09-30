import type { PracticeActivity } from '../../domain/content/types.ts';
import type { ConstructionEvidence } from '../evidence/types.ts';
import { StatefulSimulationEngine } from '../../engines/simulation/engine.ts';
import type { PracticeEngineAdapter } from '../practice-router/router.ts';
import type { ReferenceSliceContext, ReferenceSliceRegistry } from './config.ts';
import { applyParticleDelta, deriveAtomState, type AtomState, type Particle } from '../../domain/chemistry/atom.ts';

interface Options { registry:ReferenceSliceRegistry; contentVersion:string; scoringVersion:string; now:()=>string }
type AtomAction = { particle:Particle; delta:number };
export function createSimulationSliceAdapter(o:Options):PracticeEngineAdapter<ReferenceSliceContext> & {restore:(activity:PracticeActivity,serialized:string)=>Promise<AtomState>} {
  function engineFor(activity:PracticeActivity){
    const config=o.registry[activity.id];
    if(!config||config.type!=='simulation') throw new Error(`REFERENCE_SLICE_CONFIG_MISSING:${activity.id}`);
    const initial=deriveAtomState({protons:0,neutrons:0,electrons:0});
    return {config,engine:new StatefulSimulationEngine<AtomState,AtomAction>({
      id:config.sliceId,version:config.version,seed:0,initialState:initial,
      // P1.4: every derived quantity comes from the canonical atom model (src/domain/chemistry/atom.ts)
      reducer:(state,action)=>applyParticleDelta(state,action.particle,action.delta),
      evidenceCollector:(state)=>{
        const target=config.target;
        const achieved=state.protons===target.protons&&state.neutrons===target.neutrons&&state.electrons===target.electrons;
        if(!achieved) return [];
        const ev:ConstructionEvidence={
          id:`${activity.id}.construction.${target.isotope}`,
          conceptId:config.conceptId,activityId:activity.id,activityVersion:activity.version,
          contentVersion:o.contentVersion,scoringVersion:o.scoringVersion,createdAt:o.now(),score:1,
          evidenceClass:'practice-observation',type:'construction',targetId:target.isotope,achieved:true,
          independenceKey:`${activity.id}:construction`,
        };
        return [ev];
      }
    })};
  }
  return {
    async run(activity,context){
      const {engine,config}=engineFor(activity);
      const actions=(context.inputs[activity.id]?.simulationActions??[]) as unknown as AtomAction[];
      for(const action of actions) engine.dispatch(action);
      // `goal` is the target atom derived by the same domain model (renderers never compute it themselves)
      return {evidence:engine.getEvidence(),serializedState:engine.serialize(),finalState:engine.getState(),goal:deriveAtomState(config.target)};
    },
    async restore(activity,serialized){
      const {engine}=engineFor(activity); engine.restore(serialized); return engine.getState();
    }
  };
}
