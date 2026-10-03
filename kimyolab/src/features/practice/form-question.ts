// P2.1 — ONE form-question model for every legacy practice field the learner answers (simulation controls, trainer
// answers). It replaces the repeated "token → <input>" logic: a closed answer domain becomes a choice with readable
// labels, everything else stays a typed input. The presentation maps a chosen label back to the canonical token; the
// UI never computes, stores or marks the expected answer (no correctAnswer / expectedToken / answerKey anywhere).
import type {Localize} from '../localization/element-names.ts';
import type {AnswerDomain} from './answer-domain.ts';

/** The shared presentation shape of one option. `value` is the canonical token; the DOM carries only the index. */
export interface LearnerChoice { value:string; labelKey?:string; label:string }
export type FormInput={kind:'choice';choices:LearnerChoice[]}|{kind:'text'}|{kind:'number'}|{kind:'formula'};
export interface FormQuestionModel {
  /** the engine field id / 'answer' for trainers — sent back to the engine, never shown */
  id:string;
  /** learner-facing label (localized; never a raw id) */
  label:string;
  input:FormInput;
  valueType:'text'|'number'|'boolean';
}

/** Localized text with the never-a-raw-id fallback policy: catalog → content fallback → generic label; every miss
 *  is recorded as a LOCALIZATION_MISSING gap (reports/learner-label-audit.json). */
export interface Labeler { text(key:string,fallback:string):string; ui(key:string,vars?:Record<string,string|number>):string; gaps:string[] }
export function createLabeler(localize:Localize):Labeler{
  const gaps:string[]=[];
  const fill=(s:string,vars?:Record<string,string|number>)=>s.replace(/\{(\w+)\}/g,(_,k)=>String(vars?.[k]??''));
  return {
    gaps,
    text(key,fallback){ const v=localize(key); if(v!==null) return v; gaps.push(key); return fallback; },
    // shared UI strings are required catalog keys (the build and the content client refuse a catalog without them);
    // the neutral mark below is only reachable when a page is built without any catalog, and is never a raw id
    ui(key,vars){ const v=localize(key); if(v!==null) return fill(v,vars); gaps.push(key); return vars?.n!==undefined?`#${vars.n}`:'…'; },
  };
}

/** P2.9: ONE order on every engine. `localeCompare(…,'uz')` depends on the ICU data of the runtime: Node and Chromium
 *  ordered the kinetics labels for no-change / increase differently, so the option index computed in one runtime pointed at another option
 *  in the other (the accessibility sweep's "wrong" probe of 11.16 selected the CORRECT answer). Code points of the
 *  NFC, lower-cased label are the same everywhere. */
export function codepointOrder(a:string,b:string):number{
  const x=a.normalize('NFC').toLowerCase(), y=b.normalize('NFC').toLowerCase();
  return x<y?-1:x>y?1:0;
}

/** Choices in a deterministic order that says nothing about correctness: sorted by their learner-facing label
 *  (booleans keep the yes/no order). Values without a label get a numbered generic label and a recorded gap. */
export function buildChoices(domain:AnswerDomain,labels:Labeler):LearnerChoice[]{
  const rows=domain.values.map(value=>{ const labelKey=`answer.${domain.domain}.${value}`; return {value,labelKey,text:labels.text(labelKey,'')}; });
  // labelled options by label, unlabelled ones after them by token — then numbered, so no order follows the input
  if(domain.domain!=='boolean') rows.sort((a,b)=>Number(!a.text)-Number(!b.text)||codepointOrder(a.text,b.text)||codepointOrder(a.value,b.value));
  return rows.map((r,i)=>({value:r.value,labelKey:r.labelKey,label:r.text||labels.ui('ui.option-fallback',{n:i+1})}));
}

export function buildFormQuestion(input:{id:string;label:string;valueType:'text'|'number'|'boolean';domain:AnswerDomain|null;labels:Labeler;formula?:boolean}):FormQuestionModel{
  const {id,label,domain,labels}=input;
  if(domain&&domain.values.length>=2) return {id,label,valueType:domain.valueType,input:{kind:'choice',choices:buildChoices(domain,labels)}};
  if(input.valueType==='boolean') return {id,label,valueType:'boolean',input:{kind:'choice',choices:buildChoices({domain:'boolean',values:['true','false'],valueType:'boolean',source:'boolean'},labels)}};
  return {id,label,valueType:input.valueType,input:{kind:input.valueType==='number'?'number':input.formula?'formula':'text'}};
}

/** Raw form value → the value the engine receives. A choice arrives as its index (the DOM never carries the token);
 *  an unknown index is `null` (the caller shows "choose an option" — nothing is sent to the engine). */
export function answerValue(q:FormQuestionModel,raw:string):string|number|boolean|null{
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
