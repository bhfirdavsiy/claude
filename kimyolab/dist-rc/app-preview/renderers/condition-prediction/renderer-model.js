// ConditionRendererModel (P2.6, ADR-P2-007) and its ONE canonical converter. Input: the engine result of a condition
// practice (finalState.condition = ConditionTrialState from src/domain/chemistry/condition-trial.ts, finalState.presentation
// from the runtime, and the engine's evidence). The converter only turns domain ids into display text: which conditions
// exist, the closed outcome set, the revealed outcome and whether a prediction was correct all come from the domain —
// nothing is decided here, and this module names no chemistry (every label is a catalog key or formula typography).
                                                                                                      

export const CONDITION_RENDERER_MODEL_SCHEMA='kimyolab.renderer.condition-prediction.v1';

                                                                          

/** Every shared UI key the condition renderer reads (the catalog must hold them: test p2-6). */
export const CONDITION_UI_KEYS=['ui.cond-title','ui.cond-system','ui.cond-subject','ui.cond-goal','ui.cond-choose-condition','ui.cond-predict','ui.cond-reveal',
  'ui.cond-hint-choose','ui.cond-hint-predict','ui.cond-hint-reveal','ui.cond-hint-next','ui.cond-tried','ui.cond-result-none','ui.cond-result',
  'ui.cond-correct','ui.cond-incorrect','ui.cond-trial','ui.cond-verdict-correct','ui.cond-verdict-incorrect','ui.cond-state','ui.cond-row-condition',
  'ui.cond-row-prediction','ui.cond-row-result','ui.cond-row-verdict','ui.cond-trials','ui.cond-goal-reached','ui.cond-goal-pending','ui.cond-action-failed',
  'ui.cond-selected','ui.cond-predicted','ui.cond-no-prediction','ui.cond-reject-not-modeled','ui.cond-reject-already-tried','ui.cond-reject-no-selection',
  'ui.cond-reject-outcome','ui.cond-reject-prediction-required','ui.cond-reject-prediction-locked','ui.cond-reject-invalid']         ;
                                            

const REJECTION_KEY                                           =Object.freeze({
  CONDITION_NOT_MODELED:'ui.cond-reject-not-modeled',CONDITION_ALREADY_TRIED:'ui.cond-reject-already-tried',CONDITION_NO_SELECTION:'ui.cond-reject-no-selection',
  OUTCOME_NOT_IN_MODEL:'ui.cond-reject-outcome',PREDICTION_REQUIRED:'ui.cond-reject-prediction-required',PREDICTION_LOCKED:'ui.cond-reject-prediction-locked',
  CONDITION_ACTION_INVALID:'ui.cond-reject-invalid',
});

                                         
                                                
               
                                                                                                    
                   
              
                                                                                                        
                                                                            
                                                            
                     
                     
                    
                                                             
                                                           
                                                       
                        
                                                                                     
                      
                  
              
                                                                                                                                                                                                                                              
                                                                                            
                       
                           
 

const SUB='₀₁₂₃₄₅₆₇₈₉', SUP='⁰¹²³⁴⁵⁶⁷⁸⁹';
/** Typography only (generic notation, no chemistry): "AB4^2-" → "AB₄²⁻", "A^2+" → "A²⁺", "AB2" → "AB₂". */
export function formulaLabel(f       )       {
  const [base,charge]=f.split('^');
  const b=base .replace(/\d/g,d=>SUB[Number(d)] );
  return charge===undefined?b:b+charge.replace(/\d/g,d=>SUP[Number(d)] ).replace(/\+/g,'⁺').replace(/-/g,'⁻');
}

function isState(x    )                         {
  const strs=(v        )=>Array.isArray(v)&&v.every(s=>typeof s==='string');
  return x&&typeof x.kind==='string'&&strs(x.conditions)&&strs(x.outcomeOptions)&&typeof x.targetCondition==='string'&&x.current&&typeof x.current.revealed==='boolean'
    &&Array.isArray(x.trials)&&strs(x.triedConditions)&&typeof x.achieved==='boolean';
}
function isPresentation(p    )        {
  return p&&typeof p.conditionDomain==='string'&&typeof p.outcomeDomain==='string'&&(p.outcomeFormat==='label'||p.outcomeFormat==='formula');
}

/** The canonical converter: engine result → ConditionRendererModel. Throws on a result that is not a condition result. */
export function toConditionRendererModel(result        ,localize                          =()=>null)                       {
  const r=result                                                                            ;
  const s=r?.finalState?.condition, p=r?.finalState?.presentation;
  if(!isState(s)||!isPresentation(p)) throw new Error('CONDITION_RENDERER_MODEL_INPUT_INVALID');
  const missing=new Set        ();
  const fill=(t       ,vars                              )=>t.replace(/\{(\w+)\}/g,(_,k)=>String(vars?.[k]??''));
  const ui=(key      ,vars                              )=>{ const v=localize(key); if(v===null){ missing.add(key); return '…'; } return fill(v,vars); };
  const named=(key       ,i       )=>{ const v=localize(key); if(v===null){ missing.add(key); return `#${i+1}`; } return v; };
  const condLabel=(id       )=>named(`answer.${p.conditionDomain}.${id}`,s.conditions.indexOf(id));
  const outLabel=(id       )=>p.outcomeFormat==='formula'?formulaLabel(id):named(`answer.${p.outcomeDomain}.${id}`,s.outcomeOptions.indexOf(id));
  const c=s.current;
  const target=condLabel(s.targetCondition);
  const context=[
    ...(typeof p.systemKey==='string'?[ui('ui.cond-system',{system:named(p.systemKey,0)})]:[]),
    ...(typeof p.subjectFormula==='string'?[ui('ui.cond-subject',{formula:formulaLabel(p.subjectFormula)})]:[]),
  ];
  const observation=c.revealed&&c.outcome!==null?{outcome:c.outcome,label:outLabel(c.outcome),text:ui('ui.cond-result',{outcome:outLabel(c.outcome)})}:null;
  const trial=c.trial!==null?s.trials.find(t=>t.n===c.trial):undefined;
  const feedback=trial?(trial.correct
    ?{result:'correct'         ,text:ui('ui.cond-correct',{outcome:outLabel(trial.actual)})}
    :{result:'incorrect'         ,text:ui('ui.cond-incorrect',{predicted:outLabel(trial.predicted),outcome:outLabel(trial.actual)})}):null;
  const step              =!c.condition?'chooseCondition':c.revealed?'observed':c.predicted?'reveal':'predict';
  const goalReached=(Array.isArray(r.evidence)?r.evidence:[]).some((e    )=>e?.type==='construction'&&e.achieved===true);
  const rejection=s.rejected?ui(REJECTION_KEY[s.rejected]):null;
  const hint=ui(step==='chooseCondition'?'ui.cond-hint-choose':step==='predict'?'ui.cond-hint-predict':step==='reveal'?'ui.cond-hint-reveal':'ui.cond-hint-next');
  const goalText=goalReached?ui('ui.cond-goal-reached',{condition:target}):ui('ui.cond-goal-pending',{condition:target});
  const parts=[
    c.condition?ui('ui.cond-selected',{condition:condLabel(c.condition)}):hint,
    c.predicted?ui('ui.cond-predicted',{predicted:outLabel(c.predicted)}):c.condition?ui('ui.cond-no-prediction'):'',
    observation?observation.text:'',
    feedback?feedback.text:'',
    rejection??'',
    goalReached?goalText:'',
  ].filter(Boolean);
  const verdict={correct:ui('ui.cond-verdict-correct'),incorrect:ui('ui.cond-verdict-incorrect')};
  const model                       ={
    schema:CONDITION_RENDERER_MODEL_SCHEMA,
    title:ui('ui.cond-title'),
    context,
    goal:ui('ui.cond-goal',{condition:target}),
    conditions:s.conditions.map(id=>({id,label:condLabel(id),selected:id===c.condition,tried:s.triedConditions.includes(id)})),
    outcomes:s.outcomeOptions.map(id=>({id,label:outLabel(id),selected:id===c.predicted})),
    step,
    canPredict:!!c.condition&&!c.revealed,
    canReveal:!!c.condition&&!!c.predicted&&!c.revealed,
    observation,feedback,
    trials:s.trials.map(t=>({n:t.n,correct:t.correct,text:ui('ui.cond-trial',{n:t.n,condition:condLabel(t.condition),predicted:outLabel(t.predicted),actual:outLabel(t.actual),verdict:t.correct?verdict.correct:verdict.incorrect})})),
    rejection,
    goalReached,goalText,hint,
    labels:{choose:ui('ui.cond-choose-condition'),predict:ui('ui.cond-predict'),reveal:ui('ui.cond-reveal'),state:ui('ui.cond-state'),
      rows:{condition:ui('ui.cond-row-condition'),prediction:ui('ui.cond-row-prediction'),result:ui('ui.cond-row-result'),verdict:ui('ui.cond-row-verdict')},
      trials:ui('ui.cond-trials'),tried:ui('ui.cond-tried'),resultNone:ui('ui.cond-result-none'),actionFailed:ui('ui.cond-action-failed'),verdict},
    missingKeys:[],
    accessibleSummary:parts.join(' '),
  };
  model.missingKeys=[...missing].sort();
  return model;
}
