                                                         

const ACTION_LABELS                      ={
  selectApparatus:'Jihozlarni tanlash',addWater:'Suv qo‘shish',addMixture:'Aralashmani qo‘shish',mix:'Aralashtirish',filter:'Filtrlash',evaporate:'Bug‘latish',observe:'Kuzatish',addNaCl:'NaCl eritmasini qo‘shish',addAgNO3:'AgNO₃ eritmasini qo‘shish',record:'Natijani yozish',
};

                             
                                                                                                                                                                                      
                                                                                                                                                               
                                                                                                                         
                                                                                                                                  
                                                                                                                          

export function buildPracticeUiModel(model                         )                 {
  const c=model.referenceConfig;
  const common={title:model.title,goal:model.goal,backHref:`/learn/${model.learningUnit.id}/practice`};
  // P1.4/P1.5: activities with a rendererRequirement are drawn by the RendererRegistry (src/renderers/**) —
  // never by this legacy model (atom-builder: its UI-side goal label; hydrolysis: its payload-less buttons that
  // could never complete 9.14).
  if(model.executionPlan.rendererRequirement) throw new Error('RENDERER_REQUIRED');
  const experimentMeta={equipment:model.legacyContent?.equipment??'',materials:model.legacyContent?.materials??'',safety:model.legacyContent?.safety??''};
  if(model.type==='experiment'){
    if(model.executionPlan.runtime==='beta2-organic'){
      const actions=Array.isArray(c.requiredActions)?c.requiredActions:[];
      return {...common,...experimentMeta,kind:'experiment',controls:actions.map((action       )=>({action,label:ACTION_LABELS[action]??String(action).replace(/([A-Z])/g,' $1').trim(),requiresEquation:false}))};
    }
    if(model.executionPlan.runtime==='beta2-advanced'){
      const actions=c.capability==='electrolysis-experiment'
          ? ['connectCurrent','observeCathode','observeAnode']
          : [];
      return {...common,...experimentMeta,kind:'experiment',controls:actions.map(action=>({action,label:ACTION_LABELS[action]??action.replace(/([A-Z])/g,' $1').trim(),requiresEquation:false}))};
    }
    if(model.executionPlan.runtime==='beta3-advanced'){
      const actions=Array.isArray(c.requiredActions)?c.requiredActions:[];
      return {...common,...experimentMeta,kind:'experiment',controls:actions.map((action       )=>({action,label:ACTION_LABELS[action]??action.replace(/([A-Z])/g,' $1').trim(),requiresEquation:false}))};
    }
    return {...common,...experimentMeta,kind:'experiment',controls:(c.scenario?.steps??[]).map((s    )=>({action:String(s.actionType),label:model.executionPlan.runtime!=='reference-slice'?String(s.label??s.actionType):(ACTION_LABELS[String(s.actionType)]??String(s.actionType)),requiresEquation:model.executionPlan.runtime==='reference-slice'&&s.actionType==='record'}))};
  }
  if(model.type==='simulation'){
    const fields=model.executionPlan.runtime==='beta2-organic'?[String(c.field??c.property??'value')]:model.executionPlan.runtime==='beta2-advanced'&&model.executionPlan.capability==='manganese-redox-simulation'?['medium']:model.executionPlan.runtime==='beta3-advanced'?[String(c.field??'value')]:(c.controls??[]);
    return {...common,kind:'simulation',mode:'generic',controls:fields.map((field       )=>{const value=c.initialState?.[field]??c.expected;const booleanTask=c.task==='nuclear-conservation'||c.task==='equal-rates';const numberTask=typeof value==='number'||c.task==='reaction-rate';return {field:String(field),label:String(field).replaceAll('-',' '),valueType:booleanTask?'boolean':numberTask?'number':typeof value==='boolean'?'boolean':'text'};})};
  }
  if(model.type==='trainer'){
    if(model.executionPlan.runtime!=='reference-slice') return {...common,kind:'trainer',expectedInput:'text',prompt:String(c.prompt??model.goal),hints:(c.hints??[]).map((h       )=>String(h))};
    return {...common,kind:'trainer',expectedInput:'formula',prompt:`${c.elementA}(${c.valencyA}) va ${c.elementB}(${c.valencyB}) uchun formulani yozing`,hints:(c.hints??[]).map((_       ,i       )=>`${i+1}-ishora`)};
  }
  if(model.type==='calculation'){
    const steps=Array.isArray(c.steps)?c.steps:c.stepId?[{id:c.stepId,unit:c.unit}]:[];
    return {...common,kind:'calculation',formula:String(c.formula??''),steps:steps.map((s    )=>({id:String(s.id),label:String(s.id).replaceAll('-',' '),unit:String(s.unit)}))};
  }
  return {...common,kind:'case',evidenceOptions:(c.allowedEvidenceIds??[]).map((id       )=>({id,label:id.replaceAll('-',' ')})),minimum:Number(c.minEvidenceSelections??1)};
}
