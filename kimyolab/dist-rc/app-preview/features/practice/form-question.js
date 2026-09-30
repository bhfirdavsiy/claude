// P2.1 — ONE form-question model for every legacy practice field the learner answers (simulation controls, trainer
// answers). It replaces the repeated "token → <input>" logic: a closed answer domain becomes a choice with readable
// labels, everything else stays a typed input. The presentation maps a chosen label back to the canonical token; the
// UI never computes, stores or marks the expected answer (no correctAnswer / expectedToken / answerKey anywhere).
                                                               
                                                     

/** The shared presentation shape of one option. `value` is the canonical token; the DOM carries only the index. */
                                                                               
                                                                                                             
                                    
                                                                                           
            
                                                         
               
                  
                                      
 

/** Localized text with the never-a-raw-id fallback policy: catalog → content fallback → generic label; every miss
 *  is recorded as a LOCALIZATION_MISSING gap (reports/learner-label-audit.json). */
                                                                                                                                             
export function createLabeler(localize         )        {
  const gaps         =[];
  const fill=(s       ,vars                              )=>s.replace(/\{(\w+)\}/g,(_,k)=>String(vars?.[k]??''));
  return {
    gaps,
    text(key,fallback){ const v=localize(key); if(v!==null) return v; gaps.push(key); return fallback; },
    // shared UI strings are required catalog keys (the build and the content client refuse a catalog without them);
    // the neutral mark below is only reachable when a page is built without any catalog, and is never a raw id
    ui(key,vars){ const v=localize(key); if(v!==null) return fill(v,vars); gaps.push(key); return vars?.n!==undefined?`#${vars.n}`:'…'; },
  };
}

/** Choices in a deterministic order that says nothing about correctness: sorted by their learner-facing label
 *  (booleans keep the yes/no order). Values without a label get a numbered generic label and a recorded gap. */
export function buildChoices(domain             ,labels        )                {
  const rows=domain.values.map(value=>{ const labelKey=`answer.${domain.domain}.${value}`; return {value,labelKey,text:labels.text(labelKey,'')}; });
  // labelled options by label, unlabelled ones after them by token — then numbered, so no order follows the input
  if(domain.domain!=='boolean') rows.sort((a,b)=>Number(!a.text)-Number(!b.text)||a.text.localeCompare(b.text,'uz')||(a.value<b.value?-1:a.value>b.value?1:0));
  return rows.map((r,i)=>({value:r.value,labelKey:r.labelKey,label:r.text||labels.ui('ui.option-fallback',{n:i+1})}));
}

export function buildFormQuestion(input                                                                                                                      )                  {
  const {id,label,domain,labels}=input;
  if(domain&&domain.values.length>=2) return {id,label,valueType:domain.valueType,input:{kind:'choice',choices:buildChoices(domain,labels)}};
  if(input.valueType==='boolean') return {id,label,valueType:'boolean',input:{kind:'choice',choices:buildChoices({domain:'boolean',values:['true','false'],valueType:'boolean',source:'boolean'},labels)}};
  return {id,label,valueType:input.valueType,input:{kind:input.valueType==='number'?'number':input.formula?'formula':'text'}};
}

/** Raw form value → the value the engine receives. A choice arrives as its index (the DOM never carries the token);
 *  an unknown index is `null` (the caller shows "choose an option" — nothing is sent to the engine). */
export function answerValue(q                  ,raw       )                           {
  if(q.input.kind==='choice'){
    if(!/^\d+$/.test(raw)) return null;
    const choice=q.input.choices[Number(raw)];
    if(!choice) return null;
    return q.valueType==='boolean'?choice.value==='true':choice.value;
  }
  if(q.valueType==='number') return raw.trim()===''?null:Number(raw);
  if(q.valueType==='boolean') return raw==='true';
  return raw.trim()===''?null:raw;
}
