import type {StudentPracticePageModel} from './model.ts';

const ACTION_LABELS:Record<string,string>={
  selectApparatus:'Jihozlarni tanlash',addWater:'Suv qo‘shish',addMixture:'Aralashmani qo‘shish',mix:'Aralashtirish',filter:'Filtrlash',evaporate:'Bug‘latish',observe:'Kuzatish',addNaCl:'NaCl eritmasini qo‘shish',addAgNO3:'AgNO₃ eritmasini qo‘shish',record:'Natijani yozish',
};

export type PracticeUiModel =
  | {kind:'experiment';title:string;goal:string;backHref:string;controls:Array<{action:string;label:string;requiresEquation:boolean}>;equipment:string;materials:string;safety:string}
  | {kind:'simulation';mode:'atom';title:string;goal:string;backHref:string;particles:string[];targetLabel:string}
  | {kind:'simulation';mode:'generic';title:string;goal:string;backHref:string;controls:Array<{field:string;label:string;valueType:'text'|'number'|'boolean'}>}
  | {kind:'trainer';title:string;goal:string;backHref:string;expectedInput:'formula'|'text';prompt:string;hints:string[]}
  | {kind:'calculation';title:string;goal:string;backHref:string;formula:string;steps:Array<{id:string;label:string;unit:string}>}
  | {kind:'case';title:string;goal:string;backHref:string;evidenceOptions:Array<{id:string;label:string}>;minimum:number};

export function buildPracticeUiModel(model:StudentPracticePageModel):PracticeUiModel {
  const c=model.referenceConfig;
  const common={title:model.title,goal:model.goal,backHref:`/learn/${model.learningUnit.id}/practice`};
  const experimentMeta={equipment:model.legacyContent?.equipment??'',materials:model.legacyContent?.materials??'',safety:model.legacyContent?.safety??''};
  if(model.type==='experiment'){
    if(model.executionPlan.runtime==='beta2-organic'){
      const actions=Array.isArray(c.requiredActions)?c.requiredActions:[];
      return {...common,...experimentMeta,kind:'experiment',controls:actions.map((action:string)=>({action,label:ACTION_LABELS[action]??String(action).replace(/([A-Z])/g,' $1').trim(),requiresEquation:false}))};
    }
    if(model.executionPlan.runtime==='beta2-advanced'){
      const actions=c.capability==='hydrolysis-experiment'
        ? ['selectSalt','addIndicator','recordMedium']
        : c.capability==='electrolysis-experiment'
          ? ['connectCurrent','observeCathode','observeAnode']
          : [];
      return {...common,...experimentMeta,kind:'experiment',controls:actions.map(action=>({action,label:ACTION_LABELS[action]??action.replace(/([A-Z])/g,' $1').trim(),requiresEquation:false}))};
    }
    if(model.executionPlan.runtime==='beta3-advanced'){
      const actions=Array.isArray(c.requiredActions)?c.requiredActions:[];
      return {...common,...experimentMeta,kind:'experiment',controls:actions.map((action:string)=>({action,label:ACTION_LABELS[action]??action.replace(/([A-Z])/g,' $1').trim(),requiresEquation:false}))};
    }
    return {...common,...experimentMeta,kind:'experiment',controls:(c.scenario?.steps??[]).map((s:any)=>({action:String(s.actionType),label:model.executionPlan.runtime!=='reference-slice'?String(s.label??s.actionType):(ACTION_LABELS[String(s.actionType)]??String(s.actionType)),requiresEquation:model.executionPlan.runtime==='reference-slice'&&s.actionType==='record'}))};
  }
  if(model.type==='simulation'){
    if(model.executionPlan.runtime!=='reference-slice'){
      const fields=model.executionPlan.runtime==='beta2-organic'?[String(c.field??c.property??'value')]:model.executionPlan.runtime==='beta2-advanced'&&model.executionPlan.capability==='manganese-redox-simulation'?['medium']:model.executionPlan.runtime==='beta3-advanced'?[String(c.field??'value')]:(c.controls??[]);
      return {...common,kind:'simulation',mode:'generic',controls:fields.map((field:string)=>{const value=c.initialState?.[field]??c.expected;const booleanTask=c.task==='nuclear-conservation'||c.task==='equal-rates';const numberTask=typeof value==='number'||c.task==='reaction-rate';return {field:String(field),label:String(field).replaceAll('-',' '),valueType:booleanTask?'boolean':numberTask?'number':typeof value==='boolean'?'boolean':'text'};})};
    }
    return {...common,kind:'simulation',mode:'atom',particles:['protons','neutrons','electrons'],targetLabel:`${c.target?.element??''}-${c.target?.protons+c.target?.neutrons||''}`};
  }
  if(model.type==='trainer'){
    if(model.executionPlan.runtime!=='reference-slice') return {...common,kind:'trainer',expectedInput:'text',prompt:String(c.prompt??model.goal),hints:(c.hints??[]).map((h:string)=>String(h))};
    return {...common,kind:'trainer',expectedInput:'formula',prompt:`${c.elementA}(${c.valencyA}) va ${c.elementB}(${c.valencyB}) uchun formulani yozing`,hints:(c.hints??[]).map((_:string,i:number)=>`${i+1}-ishora`)};
  }
  if(model.type==='calculation'){
    const steps=Array.isArray(c.steps)?c.steps:c.stepId?[{id:c.stepId,unit:c.unit}]:[];
    return {...common,kind:'calculation',formula:String(c.formula??''),steps:steps.map((s:any)=>({id:String(s.id),label:String(s.id).replaceAll('-',' '),unit:String(s.unit)}))};
  }
  return {...common,kind:'case',evidenceOptions:(c.allowedEvidenceIds??[]).map((id:string)=>({id,label:id.replaceAll('-',' ')})),minimum:Number(c.minEvidenceSelections??1)};
}
