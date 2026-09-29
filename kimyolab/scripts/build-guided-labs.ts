import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'content-src');
const configDir=path.join(source,'activity-configs');
const practices=JSON.parse(fs.readFileSync(path.join(source,'practice-activities.json'),'utf8'));
const mappings=JSON.parse(fs.readFileSync(path.join(source,'mapping-links.json'),'utf8'));
const units=JSON.parse(fs.readFileSync(path.join(source,'learning-units.json'),'utf8'));
const reactions=JSON.parse(fs.readFileSync(path.join(source,'chemistry/reactions.json'),'utf8'));
const reactionById=new Map(reactions.map((r:any)=>[r.id,r]));
const hardeningMapPath=path.join(source,'chemistry/guided-step-reaction-map.json');
const hardeningMap=fs.existsSync(hardeningMapPath)?JSON.parse(fs.readFileSync(hardeningMapPath,'utf8')):{};
const modelMapPath=path.join(source,'chemistry/guided-step-model-map.json');
const modelMap=fs.existsSync(modelMapPath)?JSON.parse(fs.readFileSync(modelMapPath,'utf8')):{};
const qualitativePath=path.join(source,'chemistry/qualitative-tests.json');
const qualitativeData=fs.existsSync(qualitativePath)?JSON.parse(fs.readFileSync(qualitativePath,'utf8')):{tests:[]};
const qualitativeById=new Map((qualitativeData.tests??[]).map((x:any)=>[x.id,{...x,modelType:'qualitative-test'}]));
const schoolModelsPath=path.join(source,'chemistry/school-lab-models.json');
const schoolModelsData=fs.existsSync(schoolModelsPath)?JSON.parse(fs.readFileSync(schoolModelsPath,'utf8')):{models:[]};
const schoolModelById=new Map((schoolModelsData.models??[]).map((x:any)=>[x.id,x]));
const modelById=new Map([...qualitativeById,...schoolModelById]);
const unitById=new Map(units.map((u:any)=>[u.id,u]));
const configured=new Set<string>();
for(const name of fs.readdirSync(configDir)){
  if(!name.endsWith('.json')||name==='guided-labs.json') continue;
  const data=JSON.parse(fs.readFileSync(path.join(configDir,name),'utf8'));
  for(const id of Object.keys(data||{})) configured.add(id);
}
const out:Record<string,unknown>={};
for(const activity of practices){
  if(activity.type!=='experiment'||configured.has(activity.id)) continue;
  const steps=activity.legacyContent?.steps;
  if(!Array.isArray(steps)||steps.length===0) continue;
  const mapping=mappings.find((m:any)=>m.practiceActivityId===activity.id&&m.role==='primary')??mappings.find((m:any)=>m.practiceActivityId===activity.id);
  const unit:any=mapping?unitById.get(mapping.learningUnitId):undefined;
  const conceptId=activity.conceptIds?.[0]??unit?.conceptIds?.[0];
  if(!conceptId) throw new Error(`GUIDED_LAB_CONCEPT_MISSING:${activity.id}`);
  const stepReactionMap=hardeningMap[activity.id]??{};
  const stepModelMap=modelMap[activity.id]??{};
  const hardenedSteps=steps.map((label:string,index:number)=>{
    const stepKey=String(index+1);
    const mapped=stepReactionMap[stepKey];
    const modelId=stepModelMap[stepKey];
    const reactionIds=mapped?(Array.isArray(mapped)?mapped:[mapped]):[];
    const records=reactionIds.map((reactionId:string)=>{
      const reaction:any=reactionById.get(reactionId);
      if(!reaction) throw new Error(`GUIDED_LAB_REACTION_MISSING:${activity.id}:${index+1}:${reactionId}`);
      return reaction;
    });
    const reactionObservations=records.flatMap((reaction:any)=>Array.isArray(reaction.observations)?reaction.observations.slice(0,1):[]);
    let model:any=undefined;
    let modelObservations:any[]=[];
    if(modelId){
      model=modelById.get(modelId);
      if(!model) throw new Error(`GUIDED_LAB_MODEL_MISSING:${activity.id}:${stepKey}:${modelId}`);
      if(model.reviewStatus!=='pending'&&model.reviewStatus!=='approved') throw new Error(`GUIDED_LAB_MODEL_REVIEW_STATUS_INVALID:${activity.id}:${stepKey}:${modelId}`);
      modelObservations=Array.isArray(model.observations)?model.observations:(model.observation?[model.observation]:[]);
      if(!modelObservations.length) throw new Error(`GUIDED_LAB_MODEL_OBSERVATION_MISSING:${activity.id}:${stepKey}:${modelId}`);
    }
    if(!reactionIds.length&&!modelId) return {id:`step-${index+1}`,actionType:`guided.step.${index+1}`,label};
    const observations=[...reactionObservations,...modelObservations];
    return {
      id:`step-${index+1}`,actionType:`guided.step.${index+1}`,label,
      ...(reactionIds.length?{reactionIds,...(reactionIds.length===1?{reactionId:reactionIds[0]}:{})}:{}),
      ...(modelId?{modelId,modelType:model.modelType??'school-lab-model',sourceRefs:model.sourceRefs??[],reviewStatus:model.reviewStatus}:{}),
      ...(reactionIds.length&&modelId?{groundingMode:'hybrid'}:{}),
      ...(observations.length?{observations,observation:observations[0]}:{})
    };
  });
  out[activity.id]={
    type:'experiment',version:'1.0.0',conceptId,
    scenario:{id:`guided.${activity.id}`,steps:hardenedSteps},
    safetyNotes:activity.legacyContent?.safety?[String(activity.legacyContent.safety)]:[],
    virtualOnly:true,
    authoredSource:'legacyContent.steps',
    readiness:'guided-protocol',
    hardening:(Object.keys(stepReactionMap).length+Object.keys(stepModelMap).length)?{
      status:Object.keys(stepModelMap).length?'chemistry-grounded-partial':'reaction-grounded-partial',
      groundedSteps:new Set([...Object.keys(stepReactionMap),...Object.keys(stepModelMap)]).size,
      reactionGroundedSteps:Object.keys(stepReactionMap).length,
      modelGroundedSteps:Object.keys(stepModelMap).length,
      hybridGroundedSteps:Object.keys(stepReactionMap).filter((key)=>Object.prototype.hasOwnProperty.call(stepModelMap,key)).length
    }:{status:'procedural-only',groundedSteps:0,reactionGroundedSteps:0,modelGroundedSteps:0,hybridGroundedSteps:0}
  };
}
fs.writeFileSync(path.join(configDir,'guided-labs.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({generated:Object.keys(out).length,output:'content-src/activity-configs/guided-labs.json'}));
