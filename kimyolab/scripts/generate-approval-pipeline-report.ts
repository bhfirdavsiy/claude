import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildStableSignoffTargets} from './stable-signoff-targets.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const exists=(rel:string)=>fs.existsSync(path.join(root,rel));
const beta:any={};
let betaDecisionRows=0;
for(const id of ['beta1','beta2','beta3']){
  const rel=`review-packets/${id}-approval-register.json`;
  const data=read(rel); beta[id.toUpperCase()]={file:rel,records:data.records.length}; betaDecisionRows+=data.records.length;
}
const targets=buildStableSignoffTargets(root).targets as any;
const checks={
  gateApprovalImporter:exists('scripts/import-gate-approval.ts'),
  betaApprovalImporter:exists('scripts/import-beta-approvals.ts'),
  approvalOverridesSource:exists('content-src/activity-approval-overrides.json'),
  browserEvidenceImporter:exists('scripts/import-browser-evidence.ts'),
  windowsBrowserRunner:exists('scripts/windows/Run_KimyoLab_Browser_Gates.cmd'),
  windowsEvidenceCollector:exists('scripts/windows/Collect_KimyoLab_Browser_Evidence.ps1'),
};
const report={generatedAt:new Date().toISOString(),schema:'kimyolab.approval-pipeline.v1',valid:Object.values(checks).every(Boolean),checks,betaDecisionRows,beta,gateTargets:{'CHEM-033':{version:targets['CHEM-033'].version,hash:targets['CHEM-033'].hash,fileCount:targets['CHEM-033'].reviewSurfaceFileCount},'PROD-002':{version:targets['PROD-002'].version,hash:targets['PROD-002'].hash,fileCount:targets['PROD-002'].reviewSurfaceFileCount},'VISUAL-001':{version:targets['VISUAL-001'].version,hash:targets['VISUAL-001'].hash,readyForReview:targets['VISUAL-001'].readyForReview}},commands:{importGate:'npm run approval:import -- <GATE_ID> <approval.json>',importBeta:'npm run beta:approvals:import -- <filled-register.json>',refresh:'npm run approvals:refresh',importBrowser:'npm run browser:evidence:import -- <unpacked-browser-evidence-folder>',preflight:'npm run stable:preflight'}};
fs.writeFileSync(path.join(root,'reports/approval-pipeline.json'),`${JSON.stringify(report,null,2)}\n`,'utf8');
console.log(JSON.stringify({valid:report.valid,betaDecisionRows,chemistryVersion:report.gateTargets['CHEM-033'].version}));
if(!report.valid) process.exitCode=1;
