import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateReleaseGate} from '../src/runtime/governance/release-gate.ts';
import {validateContentPackIntegrity} from './content-pack-integrity.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function read(rel:string){return JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));}
const browserRaw=read('reports/browser-gates.json');
const releaseLicensingPath=path.join(root,'reports/release-licensing.json');
const licensingSource=fs.existsSync(releaseLicensingPath)?'reports/release-licensing.json':'reports/licensing.json';
const browser=Object.fromEntries(Object.entries(browserRaw).map(([key,value]:[string,any])=>[key,value.status]));
const result=evaluateReleaseGate({
  mapping:read('reports/mapping-validation.json'),
  content:read('reports/content-validation.json'),
  chemistry:read('reports/chemistry-validation.json'),
  beta1:read('reports/beta1-readiness.json'),
  beta2:read('reports/beta2-readiness.json'),
  beta3:read('reports/beta3-readiness.json'),
  licensing:read(licensingSource),
  packIntegrity:validateContentPackIntegrity(root),
  browser:browser as any,
});
const report={generatedAt:new Date().toISOString(),...result,licensingSource,browser:browserRaw};
fs.writeFileSync(path.join(root,'reports/release-gate.json'),`${JSON.stringify(report,null,2)}\n`,'utf8');
console.log(JSON.stringify({technicalReady:report.technicalReady,releaseReady:report.releaseReady,blockers:report.blockers}));
if(process.argv.includes('--technical')){
  if(!report.technicalReady) process.exitCode=1;
}else if(!report.releaseReady) process.exitCode=1;
