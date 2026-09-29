import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateExternalLabBindings} from '../src/integrations/external-labs/registry.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bindings=validateExternalLabBindings(JSON.parse(fs.readFileSync(path.join(root,'content-src/external-lab-bindings.json'),'utf8')));
const units=JSON.parse(fs.readFileSync(path.join(root,'content-src/learning-units.json'),'utf8'));
const unitIds=new Set(units.map((x:any)=>x.id));
const issues:string[]=[];
const allowedOrigins:Record<string,Set<string>>={
  chemai:new Set(['chemai.in']),
  'chem-lab-station':new Set(['chemlaboratory.vercel.app']),
};
for(const binding of bindings){
  for(const id of binding.learningUnitIds) if(!unitIds.has(id)) issues.push(`UNKNOWN_LEARNING_UNIT:${binding.id}:${id}`);
  if(binding.externalUrl){
    try{const url=new URL(binding.externalUrl);if(url.protocol!=='https:')issues.push(`NON_HTTPS_EXTERNAL_URL:${binding.id}`);const allowed=allowedOrigins[binding.provider];if(allowed&&!allowed.has(url.hostname))issues.push(`EXTERNAL_ORIGIN_NOT_ALLOWED:${binding.id}:${url.hostname}`);}catch{issues.push(`EXTERNAL_URL_INVALID:${binding.id}`);}
  }
  if(binding.provider==='nobook'&&binding.mode!=='embed') issues.push(`NOBOOK_MODE_MUST_BE_EMBED:${binding.id}`);
  if(binding.provider!=='nobook'&&binding.mode==='embed') issues.push(`THIRD_PARTY_EMBED_NOT_APPROVED:${binding.id}`);
  if(!binding.localAssessmentRequired) issues.push(`LOCAL_ASSESSMENT_REQUIRED:${binding.id}`);
}
const placements=bindings.flatMap(binding=>binding.learningUnitIds.map(learningUnitId=>({bindingId:binding.id,provider:binding.provider,learningUnitId})));
const report={
  generatedAt:new Date().toISOString(),
  bindingCount:bindings.length,
  mappedPlacements:placements.length,
  providers:Object.fromEntries(['nobook','chemai','chem-lab-station'].map(provider=>[provider,bindings.filter(x=>x.provider===provider).length])),
  uniqueLearningUnits:new Set(placements.map(x=>x.learningUnitId)).size,
  nobookModules:[...new Set(bindings.filter(x=>x.provider==='nobook').map(x=>x.nobookModuleId))].sort(),
  localAssessmentRequired:bindings.every(x=>x.localAssessmentRequired),
  issues,
  valid:issues.length===0,
  placements,
};
fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports/external-lab-integration.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(!report.valid) process.exitCode=1;
