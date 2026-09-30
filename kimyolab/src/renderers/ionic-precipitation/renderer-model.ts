// IonicPrecipitationRendererModel (P1.6) and its ONE canonical converter. Input: the engine result of the ionic
// mixing practice (finalState.ionic = IonicMixingState from src/domain/chemistry/ionic-mixing.ts, and the engine's
// evidence). Everything chemical — which reagents exist, what a pair does, whether a precipitate forms and its
// colour, whether an equation is correct — comes from the domain. The converter only chooses words. It never
// sees the expected net ionic equation (the domain state does not carry it).
import type {IonicMixingState,IonicRejection,MixResult} from '../../domain/chemistry/ionic-mixing.ts';
import type {Observation} from '../../domain/chemistry/types.ts';

export const IONIC_RENDERER_MODEL_SCHEMA='kimyolab.renderer.ionic-precipitation.v1';

export type ReactionState='not-mixed'|'modeled-reaction'|'modeled-no-reaction'|'not-modeled';

export interface IonicPrecipitationRendererModel {
  schema:typeof IONIC_RENDERER_MODEL_SCHEMA;
  reagents:Array<{id:string;label:string}>;
  selectedA:string|null;
  selectedB:string|null;
  canMix:boolean;
  reactionState:ReactionState;
  observation:{precipitate:boolean;precipitateColor:string|null;text:string}|null;
  equation:{canWrite:boolean;solved:boolean;lastResult:{correct:boolean;text:string}|null;syntaxHelp:string};
  mixes:Array<{n:number;state:ReactionState;text:string}>;
  rejection:string|null;
  /** from the engine's construction evidence, not decided in the UI */
  goalReached:boolean;
  accessibleSummary:string;
}

const SUB='₀₁₂₃₄₅₆₇₈₉';
export const formulaLabel=(f:string)=>f.replace(/\d/g,d=>SUB[Number(d)]!);
const COLOR:Readonly<Record<string,string>>=Object.freeze({white:'Oq',yellow:'Sariq',black:'Qora',blue:'Ko‘k',green:'Yashil',brown:'Qo‘ng‘ir',red:'Qizil'});
// syntax examples deliberately use ions that are not on the shelf (the help must not hint at an answer)
const SYNTAX_HELP='Yozish tartibi: ionlarni zaryadi bilan yozing (masalan K+, Fe3+, NO3-, PO4^3-); hadlar orasiga “ + ” (atrofida bo‘sh joy), tomonlar orasiga “->”. Ko‘p atomli ion zaryadining kattaligi ^ bilan yoziladi: PO4^3-. Holat belgisi ((s), (aq)) ixtiyoriy.';
const SYNTAX_REASON:Readonly<Record<string,string>>=Object.freeze({
  empty:'Tenglamani yozing.',
  arrow:'Tenglamada bitta strelka (->) bo‘lishi kerak.',
  term:'Hadlarni “ + ” bilan ajrating (plyus atrofida bo‘sh joy).',
  formula:'Formula yoki zaryad tushunarsiz. Ko‘p atomli ion zaryadini ^ bilan yozing, masalan PO4^3-.',
});
const REJECTION:Readonly<Record<IonicRejection,string>>=Object.freeze({
  REAGENT_NOT_AVAILABLE:'Bu reagent tokchada yo‘q.',
  MIX_INCOMPLETE:'Avval ikkala reagentni tanlang.',
  MIX_SAME_REAGENT:'Ikki xil reagent tanlang.',
  EQUATION_NO_REACTION:'Tenglama faqat modelda mavjud reaksiya kuzatilgandan keyin yoziladi.',
  EQUATION_SYNTAX:'Tenglamani o‘qib bo‘lmadi.',
  EQUATION_ALREADY_SOLVED:'Bu reaksiyaning tenglamasi allaqachon to‘g‘ri yozilgan.',
  IONIC_ACTION_INVALID:'Bu amalni bajarib bo‘lmadi.',
});

function observationText(o:Observation):string{
  switch(o.type){
    case 'precipitate': return o.color&&COLOR[o.color]?`${COLOR[o.color]} cho‘kma hosil bo‘ldi.`:'Cho‘kma hosil bo‘ldi.';
    case 'gas': return 'Gaz ajralib chiqdi.';
    case 'color-change': return 'Eritma rangi o‘zgardi.';
    case 'temperature-change': return o.direction==='up'?'Eritma isidi.':'Eritma sovudi.';
    case 'no-visible-change': return 'Ko‘rinadigan o‘zgarish kuzatilmadi.';
    default: return 'O‘zgarish kuzatildi.';
  }
}
const stateOf=(m:MixResult|null):ReactionState=>!m?'not-mixed':m.outcome==='reaction'?'modeled-reaction':m.outcome==='no-reaction'?'modeled-no-reaction':'not-modeled';
function mixText(m:MixResult,label:(id:string)=>string):string{
  const pair=`${label(m.reagents[0])} + ${label(m.reagents[1])}`;
  if(m.outcome==='not-modeled') return `${pair}: bu juftlik modelda yo‘q — natija ko‘rsatilmaydi. Bu “reaksiya bormaydi” degani emas.`;
  if(m.outcome==='no-reaction') return `${pair}: reaksiya bormaydi (modelda shunday qayd etilgan). Ko‘rinadigan o‘zgarish yo‘q.`;
  return `${pair}: ${(m.observations??[]).map(observationText).join(' ')||'O‘zgarish kuzatildi.'}`;
}

function isState(x:any):x is IonicMixingState{
  return x&&Array.isArray(x.reagents)&&x.reagents.every((r:any)=>typeof r?.speciesId==='string'&&typeof r?.formula==='string')
    &&x.selected&&'A' in x.selected&&'B' in x.selected&&Array.isArray(x.mixes)&&Array.isArray(x.equations)&&Array.isArray(x.solved)&&typeof x.achieved==='boolean';
}

/** The canonical converter: engine result → IonicPrecipitationRendererModel. Throws on a non-ionic result. */
export function toIonicPrecipitationRendererModel(result:unknown):IonicPrecipitationRendererModel{
  const r=result as {finalState?:{ionic?:unknown};evidence?:unknown[]};
  const s=r?.finalState?.ionic;
  if(!isState(s)) throw new Error('IONIC_RENDERER_MODEL_INPUT_INVALID');
  const formula=new Map(s.reagents.map(x=>[x.speciesId,x.formula]));
  const label=(id:string)=>formulaLabel(formula.get(id)??id);
  const c=s.current;
  const reactionState=stateOf(c);
  const precipitate=c?.outcome==='reaction'?(c.observations??[]).find(o=>o.type==='precipitate') as {type:'precipitate';color?:string}|undefined:undefined;
  const observation=c?{precipitate:Boolean(precipitate),precipitateColor:precipitate?.color&&COLOR[precipitate.color]?COLOR[precipitate.color]!:null,text:mixText(c,label)}:null;
  const solved=Boolean(c?.reactionId&&s.solved.includes(c.reactionId));
  const last=c?.reactionId?[...s.equations].reverse().find(e=>e.reactionId===c.reactionId):undefined;
  const lastResult=last?{correct:last.correct,text:last.correct?'✓ Tenglama to‘g‘ri.':'✗ Tenglama noto‘g‘ri. Ionlarni, zaryadlarni va koeffitsiyentlarni tekshiring (tomoshabin ionlar yozilmaydi).'}:null;
  const rejection=s.rejected?(s.rejected==='EQUATION_SYNTAX'&&s.syntaxReason?SYNTAX_REASON[s.syntaxReason]??REJECTION.EQUATION_SYNTAX:REJECTION[s.rejected]):null;
  const goalReached=(Array.isArray(r.evidence)?r.evidence:[]).some((e:any)=>e?.type==='construction'&&e.achieved===true);
  const parts=[
    `Reagentlar: ${s.selected.A?label(s.selected.A):'—'} va ${s.selected.B?label(s.selected.B):'—'}.`,
    observation?`Kuzatuv: ${observation.text}`:'Hali aralashtirilmagan.',
    lastResult?`Net-ion: ${lastResult.text}`:'',
    rejection??'',
    goalReached?'Maqsadga yetildi.':'',
  ].filter(Boolean);
  return {
    schema:IONIC_RENDERER_MODEL_SCHEMA,
    reagents:s.reagents.map(x=>({id:x.speciesId,label:formulaLabel(x.formula)})),
    selectedA:s.selected.A,selectedB:s.selected.B,
    canMix:Boolean(s.selected.A&&s.selected.B&&s.selected.A!==s.selected.B&&!c),
    reactionState,observation,
    equation:{canWrite:reactionState==='modeled-reaction'&&!solved,solved,lastResult,syntaxHelp:SYNTAX_HELP},
    mixes:s.mixes.map(m=>({n:m.n,state:stateOf(m),text:mixText(m,label)})),
    rejection,goalReached,
    accessibleSummary:parts.join(' '),
  };
}
