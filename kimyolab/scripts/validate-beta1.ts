import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBeta1ReadinessReport } from '../src/runtime/beta1/readiness.ts';
import { loadBeta1ConfigRegistry } from '../src/runtime/beta1/config.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(p:string)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const reference=read('content-src/activity-configs/reference-slices.json');
const beta=loadBeta1ConfigRegistry(read('content-src/activity-configs/beta1.json'));
const report=buildBeta1ReadinessReport({
  units:read('content-src/learning-units.json'),
  practices:read('content-src/practice-activities.json'),
  mappings:read('content-src/mapping-links.json'),
  configRegistry:{...reference,...beta},
});
const pendingApprovals=report.rows.reduce((sum,row)=>sum+row.approvalPending.length,0);
const output={
  generatedAt:new Date().toISOString(),
  totalLearningUnits:report.totalLearningUnits,
  technicalReady:report.technicalReady,
  releaseReady:report.releaseReady,
  technicalErrors:report.totalLearningUnits-report.technicalReady,
  pendingApprovals,
  rows:report.rows,
};
fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports/beta1-readiness.json'),`${JSON.stringify(output,null,2)}\n`,'utf8');
console.log(JSON.stringify({totalLearningUnits:output.totalLearningUnits,technicalReady:output.technicalReady,releaseReady:output.releaseReady,technicalErrors:output.technicalErrors,pendingApprovals:output.pendingApprovals}));
if(output.technicalErrors>0) process.exitCode=1;
