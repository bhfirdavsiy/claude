// HydrolysisRendererModel (P1.5) and its ONE canonical converter. Input: the engine result of a hydrolysis
// practice (finalState.hydrolysis = HydrolysisTrialState from src/domain/chemistry/hydrolysis-trial.ts, and the
// engine's evidence). The converter only turns domain values into display text: which salts exist, the medium,
// the indicator colour and whether a prediction was correct all come from the domain — nothing is decided here.
// The renderer never reads config or the raw hydrolysis data (architecture guard RENDERER_IMPORTS_CONTENT_DATA).
                                                                                                         
                                                                                                

export const HYDROLYSIS_RENDERER_MODEL_SCHEMA='kimyolab.renderer.hydrolysis-medium.v1';

                                                                      

                                          
                                                 
                                                                                                            
                                                                       
                                  
                                                                   
                      
                     
                    
                                                                                                                                         
                                                                  
                                                                        
                        
                                                                                     
                      
                           
 

// ---- display vocabulary (presentation only; ids come from the domain)
const MEDIUM_TITLE                                          =Object.freeze({acidic:'Kislotali',basic:'Ishqoriy',neutral:'Neytral'});
const MEDIUM_WORD                                          =Object.freeze({acidic:'kislotali',basic:'ishqoriy',neutral:'neytral'});
const MEDIUM_ORDER                            =['acidic','basic','neutral'];
const COLOR_WORD                                        =Object.freeze({red:'qizil',blue:'ko‘k',violet:'binafsha',yellow:'sariq',orange:'to‘q sariq',colorless:'rangsiz',crimson:'to‘q qizil'});
const INDICATOR_WORD                                =Object.freeze({litmus:'lakmus'});
const REJECTION_TEXT                                             =Object.freeze({
  HYDROLYSIS_NOT_MODELED:'Bu tuz modelda yo‘q, shuning uchun uni sinab bo‘lmaydi.',
  HYDROLYSIS_NO_SALT:'Avval tuzni tanlang.',
  HYDROLYSIS_ALREADY_TRIED:'Bu tuz shu urinishda sinab ko‘rilgan. Qayta sinash uchun yangi urinishni boshlang.',
  HYDROLYSIS_PREDICTION_LOCKED:'Indikator qo‘shilgandan keyin bashoratni o‘zgartirib bo‘lmaydi. Yangi sinov uchun tuzni qayta tanlang.',
  HYDROLYSIS_ACTION_INVALID:'Bu amalni bajarib bo‘lmadi.',
  HYDROLYSIS_INDICATOR_NOT_MODELED:'Indikator ma’lumoti modelda yo‘q, natijani ko‘rsatib bo‘lmaydi.',
});
const SUB='₀₁₂₃₄₅₆₇₈₉';
/** "AlCl3" → "AlCl₃" (typography only) */
export const formulaLabel=(f       )=>f.replace(/\d/g,d=>SUB[Number(d)] );

const isMedium=(m        )                      =>m==='acidic'||m==='basic'||m==='neutral';
function isState(x    )                          {
  return x&&Array.isArray(x.salts)&&x.salts.every((s        )=>typeof s==='string')&&typeof x.targetSalt==='string'&&x.current&&typeof x.current.revealed==='boolean'
    &&Array.isArray(x.trials)&&Array.isArray(x.triedSalts)&&typeof x.achieved==='boolean'&&(x.current.predictedMedium===null||isMedium(x.current.predictedMedium));
}

/** The canonical converter: engine result → HydrolysisRendererModel. Throws on a result that is not a hydrolysis result. */
export function toHydrolysisRendererModel(result        )                        {
  const r=result                                                           ;
  const s=r?.finalState?.hydrolysis;
  if(!isState(s)) throw new Error('HYDROLYSIS_RENDERER_MODEL_INPUT_INVALID');
  const c=s.current;
  const obs=c.observation;
  const observation=obs?{
    medium:obs.medium,mediumLabel:MEDIUM_TITLE[obs.medium],indicatorLabel:INDICATOR_WORD[obs.indicator]??obs.indicator,color:obs.color,colorLabel:COLOR_WORD[obs.color],
    text:`Indikator (${INDICATOR_WORD[obs.indicator]??obs.indicator}) ${COLOR_WORD[obs.color]} tusga o‘tdi. Muhit ${MEDIUM_WORD[obs.medium]}.`,
  }:null;
  const trial=c.trial!==null?s.trials.find(t=>t.n===c.trial):undefined;
  const feedback=trial?(!trial.predictedBeforeReveal
    ?{result:'late'         ,text:`Bashorat indikatordan keyin qilindi: sinov yozildi, lekin baholanmaydi. Kuzatuv — ${MEDIUM_WORD[trial.actualMedium]} muhit.`}
    :trial.correct
      ?{result:'correct'         ,text:`Bashoratingiz to‘g‘ri: muhit ${MEDIUM_WORD[trial.actualMedium]}.`}
      :{result:'incorrect'         ,text:`Bashoratingiz noto‘g‘ri: siz “${MEDIUM_WORD[trial.predictedMedium]}” dedingiz, kuzatuv esa ${MEDIUM_WORD[trial.actualMedium]} muhitni ko‘rsatdi. Boshqa tuzni sinab ko‘ring yoki yangi urinishni boshlang.`}):null;
  const step               =!c.selectedSalt?'chooseSalt':c.revealed?'observed':c.predictedMedium?'reveal':'predict';
  const goalReached=(Array.isArray(r.evidence)?r.evidence:[]).some((e    )=>e?.type==='construction'&&e.achieved===true);
  const target={id:s.targetSalt,label:formulaLabel(s.targetSalt)};
  const selected=c.selectedSalt?formulaLabel(c.selectedSalt):null;
  const parts=[
    selected?`Tuz: ${selected}.`:`Tuzni tanlang. Maqsad: ${target.label}.`,
    c.predictedMedium?`Bashorat: ${MEDIUM_WORD[c.predictedMedium]}.`:selected?'Bashorat hali yo‘q.':'',
    observation?observation.text:selected?'Indikator hali qo‘shilmagan.':'',
    feedback?feedback.text:'',
    s.rejected?REJECTION_TEXT[s.rejected]:'',
    goalReached?'Maqsadga yetildi.':'',
  ].filter(Boolean);
  return {
    schema:HYDROLYSIS_RENDERER_MODEL_SCHEMA,
    salts:s.salts.map(id=>({id,label:formulaLabel(id),selected:id===c.selectedSalt,tried:s.triedSalts.includes(id)})),
    target,
    media:MEDIUM_ORDER.map(id=>({id,label:MEDIUM_TITLE[id],selected:id===c.predictedMedium})),
    step,
    canPredict:!!c.selectedSalt&&c.trial===null,
    canReveal:!!c.selectedSalt&&!!c.predictedMedium&&!c.revealed,
    observation,feedback,
    trials:s.trials.map(t=>({n:t.n,correct:t.correct,credited:t.correct&&t.predictedBeforeReveal,
      text:`${t.n}-sinov: ${formulaLabel(t.selectedSalt)} — bashorat ${MEDIUM_WORD[t.predictedMedium]}, kuzatuv ${MEDIUM_WORD[t.actualMedium]} (${t.correct?'✓ to‘g‘ri':'✗ noto‘g‘ri'}${t.predictedBeforeReveal?'':', indikatordan keyin'}).`})),
    rejection:s.rejected?REJECTION_TEXT[s.rejected]:null,
    goalReached,
    accessibleSummary:parts.join(' '),
  };
}
