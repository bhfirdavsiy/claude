// P1.5 regression (written FIRST, before the fix): practice.experiment.9.14 must be completable through the UI
// path the shipped page actually uses. On the pre-P1.5 code the page uses the legacy experiment form, whose three
// buttons send selectSalt / addIndicator / recordMedium WITHOUT a payload — the adapter can never see a salt or a
// medium, so the activity can never complete (renderer-foundation-readiness: CANNOT_SUCCEED). This test FAILS on
// that code and PASSES once the hydrolysis renderer exposes the domain's choices.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {buildPracticeUiModel} from '../src/features/practice/ui-model.ts';
import {isPracticeResultComplete} from '../src/runtime/learning-orchestrator/selectors.ts';
import {renderPracticePage} from '../src/features/practice/host.ts';
import {createDefaultRendererRegistry} from '../src/renderers/index.ts';
import {HydrolysisModel} from '../src/domain/chemistry/hydrolysis-model.ts';
import {memoryPackFetch} from './helpers/memory-pack.mjs';
import {installMiniDom} from './helpers/mini-dom.mjs';

const ACTIVITY='practice.experiment.9.14';
const settle=async()=>{ for(let i=0;i<30;i++) await new Promise(r=>setTimeout(r,0)); };

test('regression 9.14: a learner can complete the hydrolysis experiment through the UI the page actually renders',async()=>{
  const client=new ContentClient({fetchImpl:memoryPackFetch(),baseUrl:'/content'});
  const page=await client.loadPractice(ACTIVITY);
  const session=new ReferencePracticeSession(page);
  let last;
  const port={apply:async(c)=>(last=await session.apply(c)),current:()=>session.result()};
  // the learner knows the right answer (taken from the domain, not from a table in this test)
  const salt=page.referenceConfig.salt;
  const medium=HydrolysisModel.from(page.chemistry.hydrolysis).classify(salt).medium;
  if(!page.executionPlan.rendererRequirement){
    // the legacy form: one "Bajarish" button per control, exactly what render.ts sends
    for(const control of buildPracticeUiModel(page).controls) await port.apply({kind:'experiment-action',action:{type:control.action}});
  }else{
    const dom=installMiniDom();
    try{
      renderPracticePage(dom.root,page,port,createDefaultRendererRegistry());
      await settle();
      const pick=(sel)=>{ const input=dom.root.querySelector(sel); assert.ok(input,sel); input.checked=true; input.dispatch('change'); };
      pick(`[data-salt="${salt}"]`); await settle();
      pick(`[data-medium="${medium}"]`); await settle();
      dom.root.querySelector('[data-action="add-indicator"]').click(); await settle();
    }finally{ dom.restore(); }
  }
  assert.ok(last,'the UI sent at least one command');
  assert.equal(isPracticeResultComplete(page.type,last),true,'the learner can complete 9.14 through the shipped UI');
});
