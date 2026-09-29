import type {PracticeActivity, PracticeType} from '../../domain/content/types.ts';
import {ReactionMatcher} from '../../domain/chemistry/reaction-matcher.ts';
import {IonicEngine} from '../../domain/chemistry/ionic-engine.ts';
import {createReferenceSliceRouter, loadReferenceSliceRegistry} from '../../runtime/reference-slices/index.ts';
import {loadBeta1ConfigRegistry} from '../../runtime/beta1/config.ts';
import {createBeta1GenericRouter} from '../../runtime/beta1/router.ts';
import {loadBeta2AdvancedRegistry,createBeta2AdvancedRouter} from '../../runtime/beta2/advanced.ts';
import {HydrolysisModel} from '../../domain/chemistry/hydrolysis-model.ts';
import {ElectrolysisModel} from '../../domain/chemistry/electrolysis-model.ts';
import {ManganeseRedoxModel} from '../../domain/chemistry/manganese-redox-model.ts';
import type {ReferenceSliceContext, ReferenceSliceInput} from '../../runtime/reference-slices/config.ts';
import {loadBeta2OrganicRegistry,createBeta2OrganicRouter} from '../../runtime/beta2/organic.ts';
import {OrganicKnowledgeBase} from '../../domain/chemistry/organic-knowledge.ts';
import {loadBeta3AdvancedRegistry,createBeta3AdvancedRouter} from '../../runtime/beta3/advanced.ts';
import {KineticsModel} from '../../domain/chemistry/kinetics-model.ts';
import {EquilibriumModel} from '../../domain/chemistry/equilibrium-model.ts';
import type {StudentPracticePageModel} from './model.ts';

export type PracticeCommand =
  | {kind:'experiment-action';action:any}
  | {kind:'simulation-action';action:Record<string,unknown>}
  | {kind:'trainer-answer';answer:string}
  | {kind:'calculation-response';response:{stepId:string;value:number;unit:string}}
  | {kind:'case-submit';value:{evidenceIds:string[];decision:string;justification:string;reflection?:string}};

const COMMAND_FAMILY:Record<PracticeCommand['kind'],PracticeType>={
  'experiment-action':'experiment',
  'simulation-action':'simulation',
  'trainer-answer':'trainer',
  'calculation-response':'calculation',
  'case-submit':'case',
};

export class ReferencePracticeSession {
  private readonly activity:PracticeActivity;
  private readonly router:any;
  private readonly context:ReferenceSliceContext;
  private readonly model:StudentPracticePageModel;

  constructor(model:StudentPracticePageModel,options:{now?:()=>string}={}){
    this.model=model;
    const config=model.referenceConfig;
    const now=options.now??(()=>new Date().toISOString());
    if(model.configFamily==='guided'||model.configFamily==='beta1'||model.configFamily==='beta2'||model.configFamily==='beta3'){
      const registry=loadBeta1ConfigRegistry({[model.id]:config});
      this.router=createBeta1GenericRouter({
        registry,contentVersion:model.contentVersion,scoringVersion:model.scoringVersion,now,
      });
    } else if(model.configFamily==='beta2-advanced'){
      if(!model.chemistry.hydrolysis||!model.chemistry.electrolysis||!model.chemistry.manganeseRedox) throw new Error('BETA2_ADVANCED_CHEMISTRY_DATA_MISSING');
      const registry=loadBeta2AdvancedRegistry({[model.id]:config});
      const ionicEngine=IonicEngine.from({reactions:model.chemistry.reactions as any,rules:model.chemistry.solutionRules as any});
      this.router=createBeta2AdvancedRouter({
        registry,ionicEngine,
        hydrolysisModel:HydrolysisModel.from(model.chemistry.hydrolysis),
        electrolysisModel:ElectrolysisModel.from(model.chemistry.electrolysis),
        manganeseModel:ManganeseRedoxModel.from(model.chemistry.manganeseRedox),
        contentVersion:model.contentVersion,scoringVersion:model.scoringVersion,now,
      });
    } else if(model.configFamily==='beta2-organic'){
      if(!model.chemistry.organic) throw new Error('BETA2_ORGANIC_CHEMISTRY_DATA_MISSING');
      const registry=loadBeta2OrganicRegistry({[model.id]:config});
      this.router=createBeta2OrganicRouter({
        registry,knowledge:OrganicKnowledgeBase.from(model.chemistry.organic),
        contentVersion:model.contentVersion,scoringVersion:model.scoringVersion,now,
      });
    } else if(model.configFamily==='beta3-advanced'){
      if(!model.chemistry.hydrolysis||!model.chemistry.electrolysis||!model.chemistry.manganeseRedox||!model.chemistry.kinetics||!model.chemistry.equilibrium) throw new Error('BETA3_ADVANCED_CHEMISTRY_DATA_MISSING');
      const registry=loadBeta3AdvancedRegistry({[model.id]:config});
      this.router=createBeta3AdvancedRouter({
        registry,
        ionicEngine:IonicEngine.from({reactions:model.chemistry.reactions as any,rules:model.chemistry.solutionRules as any}),
        hydrolysisModel:HydrolysisModel.from(model.chemistry.hydrolysis),
        electrolysisModel:ElectrolysisModel.from(model.chemistry.electrolysis),
        manganeseModel:ManganeseRedoxModel.from(model.chemistry.manganeseRedox),
        kineticsModel:KineticsModel.from(model.chemistry.kinetics),
        equilibriumModel:EquilibriumModel.from(model.chemistry.equilibrium),
        contentVersion:model.contentVersion,scoringVersion:model.scoringVersion,now,
      });
    } else {
      const registry=loadReferenceSliceRegistry({[model.id]:config});
      const reactionMatcher=ReactionMatcher.from(model.chemistry.reactions as any);
      const ionicEngine=IonicEngine.from({reactions:model.chemistry.reactions as any,rules:model.chemistry.solutionRules as any});
      this.router=createReferenceSliceRouter({
        registry,reactionMatcher,ionicEngine,
        contentVersion:model.contentVersion,
        scoringVersion:model.scoringVersion,
        now,
      });
    }
    this.activity={
      id:model.id,type:model.type,title:model.title,goal:model.goal,
      conceptIds:[String(config.conceptId)],prerequisiteConceptIds:[],
      lifecycleStatus:'ready',approvals:{} as any,accessibilityProfile:[...model.accessibility],
      engineCompatibility:{engine:model.type,range:'*'},sourceRefs:[],legacyIds:[],version:String(config.version??'1.0.0'),
    };
    this.context={inputs:{[model.id]:{}}};
  }

  private input():ReferenceSliceInput { return this.context.inputs[this.model.id]??(this.context.inputs[this.model.id]={}); }

  async apply(command:PracticeCommand):Promise<any>{
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

  async result():Promise<any>{
    const result=await this.router.run(this.activity,this.context);
    if(!result.ok) throw new Error(result.error.code);
    return result.value;
  }
}
