import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateExternalLabBindings} from '../src/integrations/external-labs/registry.ts';
import {validateExternalLabUrl} from '../src/integrations/external-labs/url-policy.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bindings=validateExternalLabBindings(JSON.parse(fs.readFileSync(path.join(root,'content-src/external-lab-bindings.json'),'utf8')));
const units=JSON.parse(fs.readFileSync(path.join(root,'content-src/learning-units.json'),'utf8'));
const unitIds=new Set(units.map((x:any)=>x.id));
const issues:string[]=[];
for(const binding of bindings){
  for(const id of binding.learningUnitIds) if(!unitIds.has(id)) issues.push(`UNKNOWN_LEARNING_UNIT:${binding.id}:${id}`);
  if(binding.externalUrl!==undefined){const verdict=validateExternalLabUrl(binding.provider,binding.externalUrl);if(!verdict.ok)issues.push(`${verdict.code}:${binding.id}`);}
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
console.log(JSON.stringify({bindingCount:report.bindingCount,mappedPlacements:report.mappedPlacements,issues:report.issues,valid:report.valid}));
if(!report.valid) process.exitCode=1;
