import type { PracticeActivity } from '../../domain/content/types.ts';
import type { ConstructionEvidence } from '../evidence/types.ts';
import { StatefulSimulationEngine } from '../../engines/simulation/engine.ts';
import type { PracticeEngineAdapter } from '../practice-router/router.ts';
import type { ReferenceSliceContext, ReferenceSliceRegistry } from './config.ts';

interface Options { registry:ReferenceSliceRegistry; contentVersion:string; scoringVersion:string; now:()=>string }
interface AtomState { protons:number; neutrons:number; electrons:number; atomicNumber:number; massNumber:number; charge:number; element:string; isotope:string }
interface AtomAction { particle:'protons'|'neutrons'|'electrons'; delta:number }
const ELEMENTS:Record<number,string>={1:'H',2:'He',3:'Li',4:'Be',5:'B',6:'C',7:'N',8:'O',9:'F',10:'Ne',11:'Na',12:'Mg',13:'Al',14:'Si',15:'P',16:'S',17:'Cl',18:'Ar'};
function derive(base:{protons:number;neutrons:number;electrons:number}):AtomState{
  const atomicNumber=base.protons;
  const massNumber=base.protons+base.neutrons;
  const element=ELEMENTS[atomicNumber]??`Z${atomicNumber}`;
  return {...base,atomicNumber,massNumber,charge:base.protons-base.electrons,element,isotope:`${element}-${massNumber}`};
}
export function createSimulationSliceAdapter(o:Options):PracticeEngineAdapter<ReferenceSliceContext> & {restore:(activity:PracticeActivity,serialized:string)=>Promise<AtomState>} {
  function engineFor(activity:PracticeActivity){
    const config=o.registry[activity.id];
    if(!config||config.type!=='simulation') throw new Error(`REFERENCE_SLICE_CONFIG_MISSING:${activity.id}`);
    const initial=derive({protons:0,neutrons:0,electrons:0});
    return {config,engine:new StatefulSimulationEngine<AtomState,AtomAction>({
      id:config.sliceId,version:config.version,seed:0,initialState:initial,
      reducer:(state,action)=>{
        if(!['protons','neutrons','electrons'].includes(action.particle)||!Number.isFinite(action.delta)) throw new Error('ATOM_ACTION_INVALID');
        const next={protons:state.protons,neutrons:state.neutrons,electrons:state.electrons};
        next[action.particle]=Math.max(0,next[action.particle]+action.delta);
        return derive(next);
      },
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
      const {engine}=engineFor(activity);
      const actions=(context.inputs[activity.id]?.simulationActions??[]) as unknown as AtomAction[];
      for(const action of actions) engine.dispatch(action);
      return {evidence:engine.getEvidence(),serializedState:engine.serialize(),finalState:engine.getState()};
    },
    async restore(activity,serialized){
      const {engine}=engineFor(activity); engine.restore(serialized); return engine.getState();
    }
  };
}
