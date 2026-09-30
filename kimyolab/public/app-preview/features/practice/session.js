                                                                                  
import {ReactionMatcher} from '../../domain/chemistry/reaction-matcher.js';
import {IonicEngine} from '../../domain/chemistry/ionic-engine.js';
import {createReferenceSliceRouter, loadReferenceSliceRegistry} from '../../runtime/reference-slices/index.js';
import {loadBeta1ConfigRegistry} from '../../runtime/beta1/config.js';
import {createBeta1GenericRouter} from '../../runtime/beta1/router.js';
import {loadBeta2AdvancedRegistry,createBeta2AdvancedRouter} from '../../runtime/beta2/advanced.js';
import {HydrolysisModel} from '../../domain/chemistry/hydrolysis-model.js';
import {ElectrolysisModel} from '../../domain/chemistry/electrolysis-model.js';
import {ManganeseRedoxModel} from '../../domain/chemistry/manganese-redox-model.js';
                                                                                                         
import {loadBeta2OrganicRegistry,createBeta2OrganicRouter} from '../../runtime/beta2/organic.js';
import {OrganicKnowledgeBase} from '../../domain/chemistry/organic-knowledge.js';
import {loadBeta3AdvancedRegistry,createBeta3AdvancedRouter} from '../../runtime/beta3/advanced.js';
import {KineticsModel} from '../../domain/chemistry/kinetics-model.js';
import {EquilibriumModel} from '../../domain/chemistry/equilibrium-model.js';
                                                         
                                                                                      
import {launchDecision} from '../../domain/readiness/readiness.js';

                             
                                         
                                                            
                                         
                                                                                   
                                                                                                              

const COMMAND_FAMILY                                             ={
  'experiment-action':'experiment',
  'simulation-action':'simulation',
  'trainer-answer':'trainer',
  'calculation-response':'calculation',
  'case-submit':'case',
};

export class ReferencePracticeSession {
                   activity                 ;
                   router    ;
                   context                      ;
                   model                         ;

  constructor(model                         ,options                  ={}){
    this.model=model;
    const config=model.referenceConfig;
    const now=options.now??(()=>new Date().toISOString());
    // P1.1 (D8): one canonical plan decides the runtime; there is no second routing key and no fallback.
    const plan=model.executionPlan;
    if(!plan||plan.activityId!==model.id||plan.engine!==model.type) throw new Error('EXECUTION_PLAN_ACTIVITY_MISMATCH');
    if(!launchDecision(model.readiness).allowed) throw new Error('ACTIVITY_NOT_AVAILABLE');
    const runtime                 =plan.runtime;
    if(runtime==='generic'){
      const registry=loadBeta1ConfigRegistry({[model.id]:config});
      this.router=createBeta1GenericRouter({
        registry,contentVersion:model.contentVersion,scoringVersion:model.scoringVersion,now,
      });
    } else if(runtime==='beta2-advanced'){
      if(!model.chemistry.hydrolysis||!model.chemistry.electrolysis||!model.chemistry.manganeseRedox) throw new Error('BETA2_ADVANCED_CHEMISTRY_DATA_MISSING');
      const registry=loadBeta2AdvancedRegistry({[model.id]:config});
      const ionicEngine=IonicEngine.from({reactions:model.chemistry.reactions       ,rules:model.chemistry.solutionRules       });
      this.router=createBeta2AdvancedRouter({
        registry,ionicEngine,
        hydrolysisModel:HydrolysisModel.from(model.chemistry.hydrolysis),
        electrolysisModel:ElectrolysisModel.from(model.chemistry.electrolysis),
        manganeseModel:ManganeseRedoxModel.from(model.chemistry.manganeseRedox),
        contentVersion:model.contentVersion,scoringVersion:model.scoringVersion,now,
      });
    } else if(runtime==='beta2-organic'){
      if(!model.chemistry.organic) throw new Error('BETA2_ORGANIC_CHEMISTRY_DATA_MISSING');
      const registry=loadBeta2OrganicRegistry({[model.id]:config});
      this.router=createBeta2OrganicRouter({
        registry,knowledge:OrganicKnowledgeBase.from(model.chemistry.organic),
        contentVersion:model.contentVersion,scoringVersion:model.scoringVersion,now,
      });
    } else if(runtime==='beta3-advanced'){
      if(!model.chemistry.hydrolysis||!model.chemistry.electrolysis||!model.chemistry.manganeseRedox||!model.chemistry.kinetics||!model.chemistry.equilibrium) throw new Error('BETA3_ADVANCED_CHEMISTRY_DATA_MISSING');
      const registry=loadBeta3AdvancedRegistry({[model.id]:config});
      this.router=createBeta3AdvancedRouter({
        registry,
        ionicEngine:IonicEngine.from({reactions:model.chemistry.reactions       ,rules:model.chemistry.solutionRules       }),
        hydrolysisModel:HydrolysisModel.from(model.chemistry.hydrolysis),
        electrolysisModel:ElectrolysisModel.from(model.chemistry.electrolysis),
        manganeseModel:ManganeseRedoxModel.from(model.chemistry.manganeseRedox),
        kineticsModel:KineticsModel.from(model.chemistry.kinetics),
        equilibriumModel:EquilibriumModel.from(model.chemistry.equilibrium),
        contentVersion:model.contentVersion,scoringVersion:model.scoringVersion,now,
      });
    } else if(runtime==='reference-slice'){
      const registry=loadReferenceSliceRegistry({[model.id]:config});
      const reactionMatcher=ReactionMatcher.from(model.chemistry.reactions       );
      const ionicEngine=IonicEngine.from({reactions:model.chemistry.reactions       ,rules:model.chemistry.solutionRules       });
      this.router=createReferenceSliceRouter({
        registry,reactionMatcher,ionicEngine,
        contentVersion:model.contentVersion,
        scoringVersion:model.scoringVersion,
        now,
      });
    } else {
      // Fail closed: an unknown runtime is never mapped to a default interpreter.
      throw new Error(`EXECUTION_RUNTIME_UNKNOWN:${String(runtime)}`);
    }
    this.activity={
      id:model.id,type:model.type,title:model.title,goal:model.goal,
      conceptIds:[String(config.conceptId)],prerequisiteConceptIds:[],
      // P1.2: no synthesized 'ready'. The student model carries no governance fields (P0 invariant), so the
      // lifecycle is DERIVED from canonical readiness; the router's gate uses the readiness itself.
      lifecycleStatus:model.readiness.runtime==='READY'?'ready':'planned',approvals:{}       ,accessibilityProfile:[...model.accessibility],
      engineCompatibility:{engine:model.type,range:'*'},sourceRefs:[],legacyIds:[],version:String(config.version??'1.0.0'),
    };
    this.context={inputs:{[model.id]:{}}};
  }

          input()                     { return this.context.inputs[this.model.id]??(this.context.inputs[this.model.id]={}); }

  async apply(command                )             {
    if(COMMAND_FAMILY[command.kind]!==this.model.type) throw new Error('PRACTICE_COMMAND_TYPE_MISMATCH');
    const input=this.input();
    switch(command.kind){
      case 'experiment-action': (input.actions??=[]).push(command.action); break;
      case 'simulation-action': (input.simulationActions??=[]).push(command.action); break;
      case 'trainer-answer': (input.trainerAnswers??=[]).push(command.answer); break;
      case 'calculation-response': (input.calculationResponses??=[]).push(command.response); break;
      case 'case-submit': input.case={...command.value}; break;
    }
    return this.result();
  }

  async result()             {
    const result=await this.router.run(this.activity,this.context,this.model.executionPlan,this.model.readiness);
    if(!result.ok) throw new Error(result.error.code);
    return result.value;
  }
}
