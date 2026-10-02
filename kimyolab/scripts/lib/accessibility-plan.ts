// P2.7 — accessibility flow plans. For EVERY activity in the learning-depth baseline this derives the keyboard path a
// learner takes through the REAL page: which control, which option, what to type, which button — plus a wrong-answer
// probe and an empty-input probe. The success path is the SAME one the learning-depth solver proves in node
// (legacyCanSucceed / uiPathCanSucceed); this module only translates engine commands into UI operations (option
// INDEX, step INDEX, data-attribute of a renderer control). It authors no chemistry and no answer: every value comes
// from the activity's own config or from the existing domain model, exactly as the learning-depth baseline does.
// The plans contain answers, so they are never written to reports or shipped; the sweep computes them at run time.
import fs from 'node:fs';
import path from 'node:path';
import {ContentClient} from '../../src/app/content-client.ts';
import {buildPracticeUiModel} from '../../src/features/practice/ui-model.ts';
import {diskFetch} from '../pilot-status.ts';
import {legacyCanSucceed} from './learning-depth.ts';
import {IonicEngine} from '../../src/domain/chemistry/ionic-engine.ts';
import {EquilibriumModel} from '../../src/domain/chemistry/equilibrium-model.ts';
import {ManganeseRedoxModel} from '../../src/domain/chemistry/manganese-redox-model.ts';
import {HydrolysisModel} from '../../src/domain/chemistry/hydrolysis-model.ts';

/** UI families (ADR-P2-008): one family = one shared presentation primitive, so one fix covers every member. */
export const A11Y_FAMILIES=['form-simulation','trainer','calculation','case','guided-experiment','scripted-experiment','renderer:atom-builder','renderer:hydrolysis-medium','renderer:ionic-precipitation','renderer:condition-prediction'] as const;
export type A11yFamily=typeof A11Y_FAMILIES[number];

/** One learner operation. Legacy forms are addressed by their position on the page (the DOM carries no answer). */
export type A11yOp=
  | {op:'choice';form:number;index:number}          // legacy choice form: arrow keys to option `index`, then submit
  | {op:'type';form:number;value:string}             // legacy typed form (text / number / formula): type, then submit
  | {op:'step';index:number}                         // legacy experiment step button
  | {op:'case';checks:number[];decision:string;justification:string}
  | {op:'radio';attr:string;value:string}            // renderer radio group, reached with Tab + arrows
  | {op:'select';slot:string;value:string}           // renderer <select>, arrow keys
  | {op:'press';selector:string;times?:number}       // renderer button, Enter
  | {op:'fill';selector:string;value:string};         // renderer text input, typed then Enter

export interface A11yPlan {
  activityId:string; type:string; learningUnits:string[]; family:A11yFamily|null; uiKind:string|null;
  interaction:string; depth:string; launchable:boolean; reason?:string;
  success:A11yOp[]; wrong:A11yOp[]|null; empty:A11yOp[]|null;
  /** why there is no empty/invalid probe (the action is unavailable until its prerequisite is chosen) */
  emptyNotApplicable?:string;
}

const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));

function legacyFamily(uiKind:string,depth:string):A11yFamily{
  if(uiKind==='simulation') return 'form-simulation';
  if(uiKind==='experiment') return depth==='GUIDED'?'guided-experiment':'scripted-experiment';
  return uiKind as A11yFamily;
}

/** engine commands (the solver's proven path) → UI operations on the legacy form page */
function legacyOps(ui:any,commands:any[]):A11yOp[]{
  const indexOf=(q:any,value:any)=>q.input.choices.findIndex((c:any)=>c.value===String(value));
  if(ui.kind==='experiment') return commands.map(cmd=>({op:'step',index:ui.controls.findIndex((x:any)=>x.action===cmd.action.type)}));
  if(ui.kind==='simulation') return commands.map(cmd=>{
    const form=ui.controls.findIndex((x:any)=>x.field===cmd.action.field); const q=ui.controls[form].question;
    return q.input.kind==='choice'?{op:'choice',form,index:indexOf(q,cmd.action.value)}:{op:'type',form,value:String(cmd.action.value)};
  });
  if(ui.kind==='trainer') return commands.map(cmd=>ui.question.input.kind==='choice'?{op:'choice',form:0,index:indexOf(ui.question,cmd.answer)}:{op:'type',form:0,value:String(cmd.answer)});
  if(ui.kind==='calculation') return commands.map(cmd=>({op:'type',form:ui.steps.findIndex((s:any)=>s.id===cmd.response.stepId),value:String(cmd.response.value)}));
  return commands.map(cmd=>({op:'case',checks:cmd.value.evidenceIds.map((id:string)=>ui.evidenceOptions.findIndex((o:any)=>o.id===id)),decision:cmd.value.decision,justification:cmd.value.justification}));
}

/** a plausible learner mistake on the first answerable control; null when the family has no wrong answer to give */
function legacyWrong(ui:any,success:A11yOp[]):A11yOp[]|null{
  const first=success[0]; if(!first) return null;

  if(first.op==='choice'){ const q=ui.kind==='trainer'?ui.question:ui.controls[first.form].question; const n=q.input.choices.length; return n>1?[{op:'choice',form:first.form,index:(first.index+1)%n},...(ui.kind==='simulation'?success.slice(1):[])]:null; }
  // a multi-field simulation judges the whole state: the mistake goes in the first field, the others are answered
  const rest=ui.kind==='simulation'?success.slice(1):[];
  if(first.op==='type'){ const numeric=ui.kind==='calculation'||(ui.kind==='simulation'&&ui.controls[first.form].question.input.kind==='number'); return [{op:'type',form:first.form,value:numeric?String(Number(first.value)+1000):'noto‘g‘ri-javob'},...rest]; }
  if(first.op==='case') return [{op:'case',checks:[],decision:'',justification:''}];
  // a scripted step out of order (the second before the first) where the scenario has an order to break
  if(first.op==='step'&&success.length>1&&success[1]!.op==='step'&&(success[1] as any).index!==first.index) return [{op:'step',index:(success[1] as any).index}];
  return null;
}

function legacyEmpty(ui:any):A11yOp[]|null{
  if(ui.kind==='simulation') return [ui.controls[0].question.input.kind==='choice'?{op:'choice',form:0,index:-1}:{op:'type',form:0,value:''}];
  if(ui.kind==='trainer') return [ui.question.input.kind==='choice'?{op:'choice',form:0,index:-1}:{op:'type',form:0,value:''}];
  if(ui.kind==='calculation') return [{op:'type',form:0,value:''}];
  if(ui.kind==='case') return [{op:'case',checks:[],decision:'',justification:''}];
  return null; // experiment: every step is a button — there is no free input to leave empty
}

/** renderer activities: the intents the renderer emits (renderer-foundation-readiness uiPathCanSucceed), as UI operations */
function rendererOps(model:any):{success:A11yOp[];wrong:A11yOp[]|null;empty:A11yOp[]|null;emptyNotApplicable?:string}{
  const c=model.referenceConfig; const capability=model.executionPlan.rendererRequirement.capability;
  if(capability==='atom-builder'){
    const success:A11yOp[]=(['protons','neutrons','electrons'] as const).map(p=>({op:'press',selector:`[data-particle="${p}"] button:last-of-type`,times:c.target[p]}));
    return {success,wrong:null,empty:null,emptyNotApplicable:'no free input: every control is a +/− button and − is unavailable at 0'};
  }
  if(capability==='hydrolysis-medium'){
    const medium=(HydrolysisModel.from(model.chemistry.hydrolysis).classify(c.salt) as any).medium;
    const media=['acidic','neutral','basic']; const wrongMedium=media.find(m=>m!==medium)!;
    return {success:[{op:'radio',attr:'data-salt',value:c.salt},{op:'radio',attr:'data-medium',value:medium},{op:'press',selector:'[data-action="add-indicator"]'}],
      wrong:[{op:'radio',attr:'data-salt',value:c.salt},{op:'radio',attr:'data-medium',value:wrongMedium},{op:'press',selector:'[data-action="add-indicator"]'}],empty:null,emptyNotApplicable:'nothing invalid can be sent: the prediction and the reveal are unavailable (disabled) until a salt and a prediction are chosen'};
  }
  if(capability==='ionic-precipitation'){
    const rx=model.chemistry.reactions.find((x:any)=>x.id===c.reactionId);
    const bySpecies=(f:string)=>(model.chemistry.species??[]).find((x:any)=>x.formula===f)?.id;
    const equation=IonicEngine.from({reactions:model.chemistry.reactions,rules:model.chemistry.solutionRules}).netIonicEquation(c.reactionId).equation;
    const mix:A11yOp[]=[{op:'select',slot:'A',value:bySpecies(rx.reactants[0].formula)},{op:'select',slot:'B',value:bySpecies(rx.reactants[1].formula)},{op:'press',selector:'[data-action="mix"]'}];
    return {success:[...mix,{op:'fill',selector:'.kl-ionic__equation input',value:equation}],wrong:[...mix,{op:'fill',selector:'.kl-ionic__equation input',value:equation.replace(/^\S+\s*\+\s*/,'')}] /* well-formed but incomplete: the first ion dropped */,empty:[...mix,{op:'fill',selector:'.kl-ionic__equation input',value:''}]};
  }
  // condition-prediction
  const beta2=c.capability==='manganese-redox-simulation';
  const condition=beta2?c.targetMedium:c.task==='equilibrium-shift'?c.perturbation:c.medium;
  const outcome=c.task==='equilibrium-shift'?(EquilibriumModel.from(model.chemistry.equilibrium).resolve(c.reactionId,condition) as any).shift:(ManganeseRedoxModel.from(model.chemistry.manganeseRedox).resolve(condition) as any).product;
  return {success:[{op:'radio',attr:'data-condition',value:condition},{op:'radio',attr:'data-outcome',value:outcome},{op:'press',selector:'[data-action="reveal"]'}],
    wrong:null,empty:null,emptyNotApplicable:'nothing invalid can be sent: the prediction and the reveal are unavailable (disabled) until a condition and a prediction are chosen'};
}

export async function buildAccessibilityPlans(root:string):Promise<A11yPlan[]>{
  const baseline=readJson(root,'reports/learning-depth-baseline.json');
  const client=new ContentClient({fetchImpl:diskFetch(root) as any,baseUrl:'/content'});
  const plans:A11yPlan[]=[];
  for(const a of baseline.activities){
    const base={activityId:a.activityId,type:a.type,learningUnits:a.learningUnits,interaction:a.interaction,depth:a.depth};
    if(a.canSucceed==='NOT_LAUNCHABLE'){ plans.push({...base,family:null,uiKind:null,launchable:false,reason:a.reason,success:[],wrong:null,empty:null}); continue; }
    const model:any=await client.loadPractice(a.activityId);
    if(a.renderer.kind==='registry'){
      const ops=rendererOps(model);
      plans.push({...base,family:`renderer:${a.renderer.capability}` as A11yFamily,uiKind:a.renderer.capability,launchable:true,...ops});
      continue;
    }
    const ui:any=buildPracticeUiModel(model);
    const solved=await legacyCanSucceed(model);
    const success=legacyOps(ui,solved.commands??[]);
    const empty=legacyEmpty(ui);
    plans.push({...base,family:legacyFamily(ui.kind,a.classifiedDepth??a.depth),uiKind:ui.kind,launchable:true,success,wrong:legacyWrong(ui,success),empty,...(empty?{}:{emptyNotApplicable:'no free input: every experiment step is a button'})});
  }
  return plans;
}
