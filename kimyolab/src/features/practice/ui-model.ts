import type {StudentPracticePageModel} from './model.ts';
import {createLocalizer} from '../localization/element-names.ts';
import {answerDomainOf} from './answer-domain.ts';
import {buildFormQuestion,createLabeler,type FormQuestionModel} from './form-question.ts';

// P2.1: every learner-facing label is looked up (`field.<id>`, `step.<id>`, `evidence.<id>`, `action.<id>` in the
// learner-interaction catalog) — never derived from an id (the former `replaceAll('-',' ')` / camelCase splitting put
// "h contribution", "observe Cathode", "ratio o h" on screen). Fallback: authored content label → numbered generic
// label; a miss is recorded in `localizationMissing` (LOCALIZATION_MISSING in reports/learner-label-audit.json).
type Common={title:string;goal:string;backHref:string;localizationMissing:string[]};
export type PracticeUiModel =
  | Common&{kind:'experiment';controls:Array<{action:string;label:string;requiresEquation:boolean}>;equipment:string;materials:string;safety:string}
  | Common&{kind:'simulation';mode:'generic';
      /** P2.9: the engine knows only the target state (generic config simulation): a non-target value is recorded
       *  without a verdict, and the page says so instead of letting the learner guess */
      targetOnly:boolean;controls:Array<{field:string;label:string;valueType:'text'|'number'|'boolean';question:FormQuestionModel}>}
  | Common&{kind:'trainer';expectedInput:'formula'|'text';prompt:string;hints:string[];question:FormQuestionModel}
  | Common&{kind:'calculation';formula:string;steps:Array<{id:string;label:string;unit:string}>}
  | Common&{kind:'case';evidenceOptions:Array<{id:string;label:string}>;minimum:number};

export function buildPracticeUiModel(model:StudentPracticePageModel):PracticeUiModel {
  const c=model.referenceConfig;
  const labels=createLabeler(createLocalizer(model.localization));
  const common:Common={title:model.title,goal:model.goal,backHref:`/learn/${model.learningUnit.id}/practice`,localizationMissing:labels.gaps};
  // P1.4/P1.5: activities with a rendererRequirement are drawn by the RendererRegistry (src/renderers/**) —
  // never by this legacy model (atom-builder: its UI-side goal label; hydrolysis: its payload-less buttons that
  // could never complete 9.14).
  if(model.executionPlan.rendererRequirement) throw new Error('RENDERER_REQUIRED');
  const experimentMeta={equipment:model.legacyContent?.equipment??'',materials:model.legacyContent?.materials??'',safety:model.legacyContent?.safety??''};
  const stepFallback=(i:number)=>labels.ui('ui.step-fallback',{n:i+1});
  if(model.type==='experiment'){
    const runtime=model.executionPlan.runtime;
    let actions:string[]=[];
    if(runtime==='beta2-organic'||runtime==='beta3-advanced') actions=Array.isArray(c.requiredActions)?c.requiredActions.map(String):[];
    else if(runtime==='beta2-advanced') actions=c.capability==='electrolysis-experiment'?['connectCurrent','observeCathode','observeAnode']:[];
    if(runtime==='beta2-organic'||runtime==='beta2-advanced'||runtime==='beta3-advanced'){
      return {...common,...experimentMeta,kind:'experiment',controls:actions.map((action,i)=>({action,label:labels.text(`action.${action}`,stepFallback(i)),requiresEquation:false}))};
    }
    // generic scenarios carry an authored label per step (content); the reference slice uses the action catalog
    return {...common,...experimentMeta,kind:'experiment',controls:(c.scenario?.steps??[]).map((s:any,i:number)=>{
      const action=String(s.actionType), authored=typeof s.label==='string'&&s.label.trim()?s.label:null;
      const label=runtime!=='reference-slice'&&authored?authored:labels.text(`action.${action}`,authored??stepFallback(i));
      return {action,label,requiresEquation:runtime==='reference-slice'&&s.actionType==='record'};
    })};
  }
  if(model.type==='simulation'){
    const fields=model.executionPlan.runtime==='beta2-organic'?[String(c.field??c.property??'value')]:model.executionPlan.runtime==='beta2-advanced'&&model.executionPlan.capability==='manganese-redox-simulation'?['medium']:model.executionPlan.runtime==='beta3-advanced'?[String(c.field??'value')]:(c.controls??[]);
    return {...common,kind:'simulation',mode:'generic',targetOnly:model.executionPlan.runtime==='generic'&&Boolean(c.targetState),controls:fields.map((field:string,i:number)=>{
      const value=c.initialState?.[field]??c.expected;const booleanTask=c.task==='nuclear-conservation'||c.task==='equal-rates';const numberTask=typeof value==='number'||c.task==='reaction-rate';
      const label=labels.text(`field.${field}`,fields.length>1?`${labels.ui('ui.answer')} ${i+1}`:labels.ui('ui.answer'));
      const question=buildFormQuestion({id:String(field),label,valueType:booleanTask?'boolean':numberTask?'number':typeof value==='boolean'?'boolean':'text',domain:answerDomainOf(model,String(field)),labels});
      return {field:String(field),label,valueType:question.valueType,question};
    })};
  }
  if(model.type==='trainer'){
    if(model.executionPlan.runtime!=='reference-slice'){
      const question=buildFormQuestion({id:'answer',label:labels.ui('ui.answer'),valueType:'text',domain:answerDomainOf(model,'answer'),labels});
      return {...common,kind:'trainer',expectedInput:'text',prompt:String(c.prompt??model.goal),hints:(c.hints??[]).map((h:string)=>String(h)),question};
    }
    const question=buildFormQuestion({id:'answer',label:labels.ui('ui.formula'),valueType:'text',domain:null,labels,formula:true});
    return {...common,kind:'trainer',expectedInput:'formula',prompt:labels.ui('ui.formula-prompt',{a:`${c.elementA}(${c.valencyA})`,b:`${c.elementB}(${c.valencyB})`}),hints:(c.hints??[]).map((_:string,i:number)=>labels.ui('ui.hint-fallback',{n:i+1})),question};
  }
  if(model.type==='calculation'){
    const steps=Array.isArray(c.steps)?c.steps:c.stepId?[{id:c.stepId,unit:c.unit}]:[];
    return {...common,kind:'calculation',formula:String(c.formula??''),steps:steps.map((s:any,i:number)=>({id:String(s.id),label:labels.text(`step.${s.id}`,stepFallback(i)),unit:String(s.unit)}))};
  }
  return {...common,kind:'case',evidenceOptions:(c.allowedEvidenceIds??[]).map((id:string,i:number)=>({id,label:labels.text(`evidence.${id}`,labels.ui('ui.evidence-fallback',{n:i+1}))})),minimum:Number(c.minEvidenceSelections??1)};
}
