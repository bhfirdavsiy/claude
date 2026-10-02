// feedback:semantics (P2.9) — audit of the learner feedback semantics of the 35 activities P2.7 recorded as feedback
// debt (29 form simulations without a wrong-answer verdict, 6 experiments without an enforced step order). Writes
//   reports/learner-feedback-semantics.json       one row per activity: what the engine knows, what the learner hears,
//                                                 the semantics state and the decision it waits for
//   reports/feedback-semantics-expansion.json     what P2.9 changed technically, what each human decision unlocks
//   review-packets/feedback-semantics/*.md         one packet per activity that needs a human decision
// Deterministic and data-driven: every fact comes from the activity configs, the content and the code contract. Nothing
// here decides chemistry truth, invents a wrong answer, imposes an order, scores, or writes any approval.
// `--check` compares instead of writing (exit 1 on any difference).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FEEDBACK_CATEGORIES} from '../src/runtime/shared/learner-input.ts';
import {KINETICS_EFFECTS} from '../src/domain/chemistry/kinetics-model.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));

/** The audit scope, frozen: the feedback observations of the P2.7 sweep as committed on main @ f11c799
 *  (reports/accessibility-gap-summary.json#feedbackObservations). */
export const AUDIT_SCOPE={
  source:'reports/accessibility-gap-summary.json#feedbackObservations @ f11c799 (P2.7)',
  ENGINE_GIVES_NO_VERDICT_FOR_NON_TARGET_STATE:['practice.simulation.10.17.monohydric-alcohols','practice.simulation.10.19.phenols','practice.simulation.10.21.carbonyls','practice.simulation.10.23.esters','practice.simulation.11.16.planned','practice.simulation.7.02.planned','practice.simulation.7.06.planned','practice.simulation.7.10.planned','practice.simulation.7.13.planned','practice.simulation.7.16.planned','practice.simulation.7.17.planned','practice.simulation.8.02.planned','practice.simulation.8.03.planned','practice.simulation.8.04.planned','practice.simulation.8.05.planned','practice.simulation.8.06.planned','practice.simulation.8.09.planned','practice.simulation.8.19.planned','practice.simulation.8.20.planned','practice.simulation.8.7','practice.simulation.9.01.planned','practice.simulation.9.02.planned','practice.simulation.9.03.planned','practice.simulation.9.04.planned','practice.simulation.9.07.planned','practice.simulation.9.08.planned','practice.simulation.9.18.water-hardness','practice.simulation.9.20.cu-ag-au','practice.simulation.9.21.group12'],
  STEP_ORDER_NOT_ENFORCED_BY_ENGINE:['practice.experiment.10.3','practice.experiment.10.5','practice.experiment.10.8','practice.experiment.10.9','practice.experiment.11.2','practice.experiment.9.10'],
} as const;

export const SEMANTICS_STATES=['SEMANTICS_CLEAR','TECHNICAL_FIX_ELIGIBLE','HUMAN_DECISION_REQUIRED','CONTENT_REQUIRED'] as const;
const PACKET_DIR='review-packets/feedback-semantics';
/** beta2-advanced 9.10: the electrolysis adapter's completion set lives in code (src/runtime/beta2/advanced.ts) */
const BETA2_ADVANCED_ELECTROLYSIS_ACTIONS=['connectCurrent','observeCathode','observeAnode'];

function configRegistry(){
  const dir=path.join(root,'content-src/activity-configs'); const reg:Record<string,{file:string;config:any}>={};
  for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort()){ const j=read(`content-src/activity-configs/${f}`); for(const [id,config] of Object.entries(j)) reg[id]={file:`content-src/activity-configs/${f}`,config}; }
  return reg;
}

function simulationRow(id:string,file:string,c:any,activity:any,labels:Record<string,string>){
  if(c.task==='kinetics-factor'){
    return {
      engine:{runtime:'beta3-advanced',semantics:'CLOSED_DOMAIN_MODEL',detail:`the kinetics model (content-src/chemistry/kinetics.json) gives ONE effect for ${c.factor}/${c.change}; the answer domain is closed (${KINETICS_EFFECTS.join(' | ')})`},
      canonicalIncorrect:{defined:true,source:'KINETICS_EFFECTS + kinetics model: every other value of the closed domain is not the modeled effect'},
      learnerHears:{empty:'UNSUPPORTED_INPUT (no option chosen → localized alert)',nonTarget:'INCORRECT',target:'CORRECT'},
      state:'SEMANTICS_CLEAR' as const,
      finding:'The engine already judged a wrong option INCORRECT (score 0). The P2.7 note came from the accessibility harness: the option order was computed with localeCompare(…,\'uz\') in Node and rendered in Chromium, whose ICU data order the labels differently — the "wrong" probe clicked the correct option. Fixed in the product (code-point order, src/features/practice/form-question.ts).',
      decision:null,
    };
  }
  const controls:string[]=c.controls??[];
  const fixed=Object.keys(c.targetState??{}).filter(k=>!controls.includes(k));
  const missingLabels=controls.filter(f=>!labels[`field.${f}`]);
  const blankStart=controls.every(f=>c.initialState?.[f]===''||c.initialState?.[f]===0);
  return {
    engine:{runtime:'generic',semantics:'TARGET_STATE_ONLY',detail:`${file}: the reducer sets fields; evidence only when the whole state equals targetState (src/runtime/beta1/router.ts simulationAdapter). No option set, no incorrect states, no field dependencies are declared.`},
    canonicalIncorrect:{defined:false,source:'none: the config holds only initialState and targetState'},
    target:c.targetState, initial:c.initialState, controls, fixedContext:Object.fromEntries(fixed.map(k=>[k,c.targetState[k]])),
    fieldLabels:Object.fromEntries(controls.map(f=>[f,labels[`field.${f}`]??null])),
    startsBlank:blankStart,
    learnerHears:{empty:'UNSUPPORTED_INPUT (localized alert, nothing recorded)',nonTarget:'VALID_INTERMEDIATE (recorded, explicitly not judged; the page states that only the target state is checked)',target:'CORRECT + complete'},
    state:missingLabels.length?'CONTENT_REQUIRED' as const:'HUMAN_DECISION_REQUIRED' as const,
    finding:missingLabels.length?`control label(s) missing in the catalog: ${missingLabels.join(', ')}`:'A non-target value can be chemically valid (another substance, another true pair, an exploratory setting) or wrong; the config cannot tell which, and a verdict cannot be inferred from field names or labels.',
    decision:{
      question:'Should any non-target state of this activity be announced as INCORRECT? If yes, which values (per field, with the source that makes them incorrect)?',
      unlocks:'a declared incorrect-state list in the config → the engine can emit INCORRECT evidence; config version 2.0.0 and new evidence ids (scoring context changes)',
    },
    goal:activity?.goal??null,
  };
}

function experimentRow(id:string,file:string,c:any,activity:any){
  const actions:string[]=c.capability==='electrolysis-experiment'?BETA2_ADVANCED_ELECTROLYSIS_ACTIONS:(c.requiredActions??[]);
  const runtime=file.includes('beta2-organic')?'beta2-organic':file.includes('beta3')?'beta3-advanced':'beta2-advanced';
  return {
    engine:{runtime,semantics:'SET_COMPLETION',detail:`complete when every required action has been done at least once, in any order; evidence only at completion. The order of the array is not declared as an order (${c.capability==='electrolysis-experiment'?'src/runtime/beta2/advanced.ts':file}).`},
    requiredActions:actions,
    orderDeclared:false,
    legacySteps:activity?.legacyContent?.steps??[],
    learnerHears:{validOrder:'VALID_INTERMEDIATE per step, CORRECT + complete at the last one',otherOrder:'the same (accepted, no verdict)',repeat:'a done step stays done (button aria-disabled)'},
    state:'HUMAN_DECISION_REQUIRED' as const,
    finding:'The numbered list and the legacy textbook steps suggest a sequence, but no config, domain model or engine declares one. Enforcing the array position would impose an order the content never stated (a procedural/chemistry judgement).',
    decision:{
      question:'Is a step order REQUIRED for this experiment? If yes, give the dependencies (which step requires which), not only a list, and the reason (safety, chemistry, didactics).',
      unlocks:'declared step dependencies in the config → the engine rejects an early step as PROCEDURE_BLOCKED (no evidence, step stays open); config version 2.0.0',
    },
    goal:activity?.goal??null,
  };
}

export function buildFeedbackSemantics(){
  const reg=configRegistry();
  const practices:any[]=read('content-src/practice-activities.json');
  const labels:Record<string,string>=read('content-src/locales/uz-latn/learner-interaction.json').labels;
  const byId=new Map(practices.map(p=>[p.id,p]));
  const ids=[...AUDIT_SCOPE.ENGINE_GIVES_NO_VERDICT_FOR_NON_TARGET_STATE,...AUDIT_SCOPE.STEP_ORDER_NOT_ENFORCED_BY_ENGINE];
  const rows=ids.map(id=>{
    const r=reg[id]; if(!r) throw new Error(`FEEDBACK_AUDIT_CONFIG_MISSING:${id}`);
    const activity=byId.get(id);
    const observation=(AUDIT_SCOPE.ENGINE_GIVES_NO_VERDICT_FOR_NON_TARGET_STATE as readonly string[]).includes(id)?'ENGINE_GIVES_NO_VERDICT_FOR_NON_TARGET_STATE':'STEP_ORDER_NOT_ENFORCED_BY_ENGINE';
    const body=r.config.type==='simulation'?simulationRow(id,r.file,r.config,activity,labels):experimentRow(id,r.file,r.config,activity);
    const needsPacket=body.state==='HUMAN_DECISION_REQUIRED';
    const technicalFixesApplied=body.engine.semantics==='CLOSED_DOMAIN_MODEL'?['choice-order','feedback-taxonomy']:body.engine.semantics==='TARGET_STATE_ONLY'?['feedback-taxonomy','valid-intermediate']:['feedback-taxonomy','current-step-marker'];
    return {
      activityId:id,activityType:r.config.type,title:activity?.title??null,configSource:r.file,configVersion:r.config.version,
      p27Observation:observation,...body,technicalFixesApplied,
      evidenceSemanticsChanged:false,scoringChanged:false,
      reviewPacket:needsPacket?`${PACKET_DIR}/${id}.md`:null,
    };
  });
  const count=(k:string)=>rows.filter(r=>r.state===k).length;
  const report={
    schema:'kimyolab.learner-feedback-semantics.v1',
    semantics:'Audit of what each activity\'s engine can judge and what the learner hears. No scoring, no chemistry decision, no approval. A HUMAN_DECISION_REQUIRED row waits for a reviewer; nothing here pre-selects the answer.',
    scope:AUDIT_SCOPE.source,
    taxonomy:{categories:[...FEEDBACK_CATEGORIES],module:'src/runtime/shared/learner-input.ts',catalog:'content-src/locales/uz-latn/learner-interaction.json (ui.*)'},
    states:[...SEMANTICS_STATES],
    summary:{activities:rows.length,simulations:rows.filter(r=>r.activityType==='simulation').length,experiments:rows.filter(r=>r.activityType==='experiment').length,
      ...Object.fromEntries(SEMANTICS_STATES.map(s=>[s,count(s)])),reviewPackets:rows.filter(r=>r.reviewPacket).length,evidenceSemanticsChanged:0,scoringChanged:0},
    activities:rows,
  };
  return report;
}

export function buildExpansion(report:ReturnType<typeof buildFeedbackSemantics>,bundleDelta:unknown){
  return {
    schema:'kimyolab.feedback-semantics-expansion.v1',
    semantics:'What P2.9 changed technically (no verdict, order, score or evidence semantics changed) and what each pending human decision would unlock. Progress weights and formulas are unchanged.',
    technicalChanges:[
      {id:'feedback-taxonomy',what:'one taxonomy (CORRECT, INCORRECT, VALID_INTERMEDIATE, UNSUPPORTED_INPUT, PROCEDURE_BLOCKED, SYSTEM_ERROR) derived from the existing engine result contract; the page shows catalog text per category and exposes data-feedback',files:['src/runtime/shared/learner-input.ts','src/features/practice/render.ts'],affects:'every legacy practice page; texts of CORRECT/INCORRECT/UNSUPPORTED_INPUT unchanged'},
      {id:'valid-intermediate',what:'a recorded state without a verdict says so ("not the final result yet") instead of "Natija saqlandi" (which read like a result); generic target-only simulations state that only the target state is checked',files:['src/features/practice/render.ts','src/features/practice/ui-model.ts'],affects:`${report.activities.filter((r:any)=>r.engine.semantics==='TARGET_STATE_ONLY').length} target-only simulations + every intermediate step`},
      {id:'procedure-blocked',what:'the experiment engine keeps rejecting a step whose declared dependency is open (status/code unchanged) and adds reason STEP_DEPENDENCY_UNMET; the learner hears "do the earlier step first" instead of "your input is invalid"',files:['src/engines/experiment/engine.ts','src/engines/experiment/types.ts'],affects:'experiments with declared dependencies (beta1 generic scenarios); none of the 6 audited experiments'},
      {id:'current-step-marker',what:'the current-step marker (aria-current=step) moves to the first step not done, never to the DOM neighbour of the step just done',files:['src/features/practice/render.ts'],affects:'every scripted experiment; for the 6 order-free ones the marker no longer points at a finished step'},
      {id:'choice-order',what:'choices are ordered by NFC lower-case code points instead of localeCompare(…,\'uz\'), whose result depends on the runtime\'s ICU data (Node ≠ Chromium for "O‘…" labels)',files:['src/features/practice/form-question.ts'],affects:'option ORDER only (values, evidence and correctness unchanged); fixed the false P2.7 note on 11.16'},
      {id:'quiz-validation',what:'quiz and reflection forms: novalidate + localized role=alert listing the unanswered questions / incomplete parts, aria-invalid on them, focus to the first one (the browser\'s English bubble no longer answers)',files:['src/features/learning-hub/render.ts','src/features/learning-hub/model.ts','src/app/content-client.ts'],affects:'every unit quiz / reflection'},
    ],
    unchanged:{evidenceSemantics:true,scoring:true,configVersions:true,progressWeights:true,masteryWrittenByUi:false},
    pendingDecisions:{
      simulations:{count:report.activities.filter((r:any)=>r.activityType==='simulation'&&r.state==='HUMAN_DECISION_REQUIRED').length,question:'which non-target states are INCORRECT (per activity, sourced)',ifDecided:'config gains a declared incorrect-state list → INCORRECT evidence (score 0); config version 2.0.0 + new evidence ids (ADR-P1-006 rule); a11y wrongAnswer becomes measurable'},
      experiments:{count:report.activities.filter((r:any)=>r.activityType==='experiment'&&r.state==='HUMAN_DECISION_REQUIRED').length,question:'is a step order required, and which dependencies',ifDecided:'config gains step dependencies → PROCEDURE_BLOCKED for an early step (the engine path already exists and is tested on the beta1 scenarios); config version 2.0.0'},
    },
    bundleDelta,
  };
}

function packet(row:any){
  const lines=[`# Feedback semantics review — ${row.activityId}`,'',`- **Title:** ${row.title??'—'}`,`- **Goal:** ${row.goal??'—'}`,`- **Config:** \`${row.configSource}\` (version ${row.configVersion})`,`- **Engine:** ${row.engine.semantics} — ${row.engine.detail}`,''];
  if(row.activityType==='simulation'){
    lines.push('## What the activity holds today','',`- **Controls:** ${row.controls.map((c:string)=>`\`${c}\`${row.fieldLabels[c]?` (${row.fieldLabels[c]})`:''}`).join(', ')}`,`- **Initial state:** \`${JSON.stringify(row.initial)}\``,`- **Target state:** \`${JSON.stringify(row.target)}\``);
    if(Object.keys(row.fixedContext).length) lines.push(`- **Fixed context (not a control):** \`${JSON.stringify(row.fixedContext)}\``);
    lines.push('- **Learner hears now:** empty → localized alert; target → correct and complete; any other value → recorded, explicitly *not judged* (VALID_INTERMEDIATE).','','## Question','',row.decision.question,'','Mark exactly one. Nothing is pre-selected.','',
      '- [ ] **A. No verdict.** Other values stay VALID_INTERMEDIATE (the activity is exploratory).',
      '- [ ] **B. Some values are incorrect.** List them below, per field, with the source that makes each one incorrect.',
      '- [ ] **C. The activity needs a content change** (option set, wording, target). Describe it below.','',
      '| Field | Value(s) to announce as incorrect | Source (book, page) |','|---|---|---|','|  |  |  |');
  }else{
    lines.push('## What the activity holds today','',`- **Required actions (engine, any order):** ${row.requiredActions.map((a:string)=>`\`${a}\``).join(' · ')}`,'- **Textbook steps (legacy content):**',...row.legacySteps.map((s:string,i:number)=>`  ${i+1}. ${s}`),'- **Learner hears now:** every action is accepted in any order; completion when all were done once.','','## Question','',row.decision.question,'','Mark exactly one. Nothing is pre-selected.','',
      '- [ ] **A. No order required.** Any order stays accepted.',
      '- [ ] **B. An order is required.** Give the dependencies below (step → steps it requires) and the reason.',
      '- [ ] **C. The activity needs a content change.** Describe it below.','',
      '| Step | Requires (earlier steps) | Reason (safety / chemistry / didactics) |','|---|---|---|','|  |  |  |');
  }
  lines.push('','## Reviewer','','| Name | Role | Date | Signature |','|---|---|---|---|','|  |  |  |  |','',
    '_Generated by `npm run feedback:semantics` from the repository data. This packet records a question, not a decision: the decision belongs to the named human reviewer. An agent never fills in this packet._','');
  return lines.join('\n');
}

function readme(rows:any[]){
  const pending=rows.filter(r=>r.reviewPacket);
  return ['# Feedback semantics — human review packets (P2.9)','','Each packet asks ONE question the repository cannot answer: whether a non-target state is wrong (form simulations), or whether a step order is required (experiments). The agent did not guess; no option is pre-selected.','',
    `Pending: ${pending.length} packets (${pending.filter(r=>r.activityType==='simulation').length} simulations, ${pending.filter(r=>r.activityType==='experiment').length} experiments). Report: \`reports/learner-feedback-semantics.json\`.`,'',
    '| Activity | Type | Packet |','|---|---|---|',...pending.map(r=>`| ${r.activityId} | ${r.activityType} | [${r.activityId}.md](${r.activityId}.md) |`),'',
    'A returned decision changes the activity config (version 2.0.0, new evidence ids) in a separate, reviewed change — never by editing a packet.',''].join('\n');
}

export function feedbackOutputs(bundleDelta:unknown){
  const report=buildFeedbackSemantics();
  const files:Record<string,string>={
    'reports/learner-feedback-semantics.json':`${JSON.stringify(report,null,2)}\n`,
    'reports/feedback-semantics-expansion.json':`${JSON.stringify(buildExpansion(report,bundleDelta),null,2)}\n`,
    [`${PACKET_DIR}/README.md`]:readme(report.activities),
  };
  for(const r of report.activities) if(r.reviewPacket) files[r.reviewPacket]=packet(r);
  return files;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const check=process.argv.includes('--check');
  // bundle delta: the P2.8 closing numbers (reports/accessibility-gap-summary.json @ 159f7cf) vs the current build
  const {bundle}=await import('./lib/computed-model-interaction.ts');
  const before={learnerModules:162,learnerModuleBytes:702745,standaloneBytes:5691105};
  const now=bundle(root) as any;
  const bundleDelta={before,after:{learnerModules:now.learnerModules,learnerModuleBytes:now.learnerModuleBytes,standaloneBytes:now.standaloneBytes},
    delta:{learnerModules:now.learnerModules-before.learnerModules,learnerModuleBytes:now.learnerModuleBytes-before.learnerModuleBytes,standaloneBytes:now.standaloneBytes-before.standaloneBytes}};
  const out=feedbackOutputs(bundleDelta); let diff=0;
  if(!check) fs.rmSync(path.join(root,PACKET_DIR),{recursive:true,force:true});
  for(const [rel,text] of Object.entries(out)){
    const abs=path.join(root,rel);
    if(check){ if(!fs.existsSync(abs)||fs.readFileSync(abs,'utf8')!==text){ console.error(`✗ stale: ${rel}`); diff++; } }
    else { fs.mkdirSync(path.dirname(abs),{recursive:true}); fs.writeFileSync(abs,text); }
  }
  const s=JSON.parse(out['reports/learner-feedback-semantics.json']!).summary;
  console.log(`feedback:semantics ${check?(diff?'STALE':'CURRENT'):'written'} — ${s.activities} activities: ${SEMANTICS_STATES.map(k=>`${k} ${s[k]}`).join(', ')}; packets ${s.reviewPackets}`);
  if(diff) process.exit(1);
}
