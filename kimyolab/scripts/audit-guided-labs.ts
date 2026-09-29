import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const practices=JSON.parse(fs.readFileSync(path.join(root,'content-src/practice-activities.json'),'utf8'));
const guided=JSON.parse(fs.readFileSync(path.join(root,'content-src/activity-configs/guided-labs.json'),'utf8'));
const triage=JSON.parse(fs.readFileSync(path.join(root,'reports/guided-lab-triage.json'),'utf8'));
const coverageTargets=JSON.parse(fs.readFileSync(path.join(root,'content-src/chemistry/guided-step-coverage-targets.json'),'utf8'));
const reactionMap=JSON.parse(fs.readFileSync(path.join(root,'content-src/chemistry/guided-step-reaction-map.json'),'utf8'));
const modelMap=JSON.parse(fs.readFileSync(path.join(root,'content-src/chemistry/guided-step-model-map.json'),'utf8'));
const triageById=new Map((triage.rows??[]).map((x:any)=>[x.id,x]));
const rows=[] as any[];
for(const id of Object.keys(guided).sort()){
  const a=practices.find((x:any)=>x.id===id);
  const c=guided[id];
  const t:any=triageById.get(id);
  const grounded=Number(c?.hardening?.groundedSteps??0);
  const reaction=Number(c?.hardening?.reactionGroundedSteps??0);
  const model=Number(c?.hardening?.modelGroundedSteps??0);
  let status='GUIDED_PROTOCOL';
  let reason='Primarily apparatus/material/physical-observation procedure; chemistry model is not required for the current authored protocol.';
  if(t?.status==='REACTION_KB_PARTIAL'){
    status=grounded>0?'CHEMISTRY_BASELINED_REACTION':'CHEMISTRY_MODEL_REQUIRED';
    reason=grounded>0?'At least one authored chemistry step is grounded in curated Reaction KB evidence; deeper step coverage can continue without inventing chemistry.':'Chemistry-relevant protocol has no bounded evidence model yet.';
  } else if(t?.status==='DOMAIN_MODEL_BASELINED'||t?.status==='DOMAIN_MODEL_REQUIRED'){
    status=model>0?'CHEMISTRY_BASELINED_DOMAIN':'CHEMISTRY_MODEL_REQUIRED';
    reason=model>0?'A source-linked bounded school-lab model now grounds the domain-specific chemistry steps; expert approval is still pending.':'Domain-specific chemistry requires a bounded model before the guided lab can be considered technically baselined.';
  }
  rows.push({id,title:a?.title??id,grade:Number(id.match(/experiment\.(\d+)/)?.[1]??0),status,reason,groundedSteps:grounded,reactionGroundedSteps:reaction,modelGroundedSteps:model,safety:a?.legacyContent?.safety??''});
}
const targetRows=[] as any[];
for(const [id,steps] of Object.entries(coverageTargets.labs??{})){
  for(const rawStep of steps as number[]){
    const key=String(rawStep);
    const reaction=Object.prototype.hasOwnProperty.call(reactionMap[id]??{},key);
    const model=Object.prototype.hasOwnProperty.call(modelMap[id]??{},key);
    targetRows.push({activityId:id,step:rawStep,grounded:reaction||model,reaction,model});
  }
}
const missingTargets=targetRows.filter(x=>!x.grounded);
const summary={
 total:rows.length,
 proceduralGuided:rows.filter(x=>x.status==='GUIDED_PROTOCOL').length,
 chemistryBaselined:rows.filter(x=>x.status.startsWith('CHEMISTRY_BASELINED')).length,
 chemistryBaselineMissing:rows.filter(x=>x.status==='CHEMISTRY_MODEL_REQUIRED').length,
 chemistryGroundedSteps:rows.reduce((n,x)=>n+x.groundedSteps,0),
 reactionGroundedSteps:rows.reduce((n,x)=>n+x.reactionGroundedSteps,0),
 modelGroundedSteps:rows.reduce((n,x)=>n+x.modelGroundedSteps,0),
 chemistryTargetSteps:targetRows.length,
 chemistryTargetGrounded:targetRows.length-missingTargets.length,
 chemistryTargetMissing:missingTargets.length,
 chemistryTargetCoverage:targetRows.length?Number((((targetRows.length-missingTargets.length)/targetRows.length)*100).toFixed(1)):0,
};
fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports','guided-lab-hardening.json'),JSON.stringify({generatedAt:new Date().toISOString(),classification:'engineering-audit-not-expert-approval',coverageTargetVersion:coverageTargets.version,summary,rows,targetRows,missingTargets},null,2)+'\n');
console.log(JSON.stringify(summary));
if(summary.chemistryBaselineMissing||summary.chemistryTargetMissing) process.exitCode=1;
