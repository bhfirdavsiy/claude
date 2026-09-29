import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const configs=JSON.parse(fs.readFileSync(path.join(root,'content-src/activity-configs/guided-labs.json'),'utf8'));
const activities=JSON.parse(fs.readFileSync(path.join(root,'content-src/practice-activities.json'),'utf8'));
const byId=new Map(activities.map((x:any)=>[x.id,x]));

const procedural=new Set([
  'practice.experiment.7.1','practice.experiment.7.12','practice.experiment.8.11','practice.experiment.8.15',
  'practice.experiment.9.6','practice.experiment.9.7','practice.experiment.9.12','practice.experiment.10.7'
]);
const partial:Record<string,string[]>={
  'practice.experiment.7.9':['rxn.nacl-h2so4','rxn.cuo-hcl','rxn.naoh-hcl','rxn.caco3-hcl'],
  'practice.experiment.7.10':['rxn.mg-h2so4','rxn.zn-hcl'],
  'practice.experiment.7.11':['rxn.cao-water','rxn.co2-water'],
  'practice.experiment.8.6':['rxn.zncl2-naoh','rxn.znoh2-hcl'],
  'practice.experiment.8.8':['rxn.agno3-nacl','rxn.agno3-nabr','rxn.agno3-nai'],
  'practice.experiment.8.9':['rxn.agno3-nacl'],
  'practice.experiment.8.10':['rxn.cl2-kbr','rxn.br2-ki'],
  'practice.experiment.8.13':['rxn.bacl2-h2so4'],
  'practice.experiment.8.14':['rxn.nh4cl-caoh2','rxn.nh3-hcl'],
  'practice.experiment.9.4':['rxn.caco3-hcl','rxn.co2-water'],
  'practice.experiment.9.16':['rxn.zncl2-naoh','rxn.znoh2-hcl'],
};
const domain=new Set([
  'practice.experiment.9.9','practice.experiment.9.13','practice.experiment.9.15','practice.experiment.9.19',
  'practice.experiment.9.20','practice.experiment.10.2','practice.experiment.10.6','practice.experiment.10.10'
]);
const reactionDb=JSON.parse(fs.readFileSync(path.join(root,'content-src/chemistry/reactions.json'),'utf8'));
const reactionIds=new Set(reactionDb.map((x:any)=>x.id));
const ids=Object.keys(configs).sort();
const rows=ids.map(id=>{
  let status='UNCLASSIFIED',candidateReactionIds:string[]=[];
  if(procedural.has(id)) status='PROCEDURAL_GUIDED';
  else if(partial[id]) {status='REACTION_KB_PARTIAL';candidateReactionIds=partial[id];}
  else if(domain.has(id)) status=Number((configs as any)[id]?.hardening?.modelGroundedSteps??0)>0?'DOMAIN_MODEL_BASELINED':'DOMAIN_MODEL_REQUIRED';
  const missing=candidateReactionIds.filter(x=>!reactionIds.has(x));
  return {id,title:(byId.get(id) as any)?.title??'',status,candidateReactionIds,missingReactionIds:missing};
});
const unclassified=rows.filter(x=>x.status==='UNCLASSIFIED');
const missingReactionIds=rows.flatMap(x=>x.missingReactionIds);
const reactionGroundedLabs=Object.values(configs).filter((c:any)=>Number(c?.hardening?.reactionGroundedSteps??0)>0);
const chemistryGroundedLabs=Object.values(configs).filter((c:any)=>Number(c?.hardening?.groundedSteps??0)>0);
const summary={
 total:rows.length,
 proceduralGuided:rows.filter(x=>x.status==='PROCEDURAL_GUIDED').length,
 reactionKbPartial:rows.filter(x=>x.status==='REACTION_KB_PARTIAL').length,
 domainModelRequired:rows.filter(x=>x.status==='DOMAIN_MODEL_REQUIRED').length,
 domainModelBaselined:rows.filter(x=>x.status==='DOMAIN_MODEL_BASELINED').length,
 unclassified:unclassified.length,
 candidateReactionRefs:rows.reduce((n,x)=>n+x.candidateReactionIds.length,0),
 missingReactionRefs:missingReactionIds.length,
 reactionGroundedLabs:reactionGroundedLabs.length,
 reactionGroundedSteps:reactionGroundedLabs.reduce((n:number,c:any)=>n+Number(c?.hardening?.reactionGroundedSteps??c?.hardening?.groundedSteps??0),0),
 chemistryGroundedLabs:chemistryGroundedLabs.length,
 chemistryGroundedSteps:chemistryGroundedLabs.reduce((n:number,c:any)=>n+Number(c?.hardening?.groundedSteps??0),0),
 modelGroundedSteps:chemistryGroundedLabs.reduce((n:number,c:any)=>n+Number(c?.hardening?.modelGroundedSteps??0),0),
};
const report={generatedAt:new Date().toISOString(),classification:'engineering-triage-not-expert-approval',summary,rows};
fs.writeFileSync(path.join(root,'reports/guided-lab-triage.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(summary));
if(unclassified.length||missingReactionIds.length) process.exitCode=1;
