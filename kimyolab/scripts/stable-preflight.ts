import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateExternalApproval} from './approval-evidence.ts';
import {buildStableSignoffTargets} from './stable-signoff-targets.ts';

const defaultRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const readOptional=(root:string,rel:string)=>{const file=path.join(root,rel);return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):undefined;};

function browserBuildBinding(input:any){
  const current=input.productionBuild??{};
  const browser=input.browser?.prodBuild??{};
  const valid=current.valid===true&&browser.status==='pass'&&typeof current.sha256==='string'&&current.sha256.length>0&&browser.sha256===current.sha256&&browser.fileCount===current.fileCount&&typeof current.deploySurfaceSha256==='string'&&current.deploySurfaceSha256.length>0&&browser.deploySurfaceSha256===current.deploySurfaceSha256&&browser.deployFileCount===current.deployFileCount;
  return {valid,currentSha256:current.sha256,browserSha256:browser.sha256,currentFileCount:current.fileCount,browserFileCount:browser.fileCount,currentDeploySurfaceSha256:current.deploySurfaceSha256,browserDeploySurfaceSha256:browser.deploySurfaceSha256,currentDeployFileCount:current.deployFileCount,browserDeployFileCount:browser.deployFileCount};
}

export function evaluateStablePreflight(input:any){
  const gates:any[]=[];
  const add=(id:string,category:string,pass:boolean,detail:unknown)=>gates.push({id,category,status:pass?'PASS':'PENDING',detail});
  add('RC-INTERNAL','technical',input.rc.internalReady===true,{technicalPreflight:input.rc.technicalPreflight,internalBlockers:input.rc.internalBlockers});
  add('RELEASE-BUNDLE-INTEGRITY','technical',input.bundle.valid===true,input.bundle);
  add('RELEASE-LICENSING','technical',input.licensing.releaseReady===true,input.licensing);
  add('ROLLBACK-DRILL','technical',input.rollback.valid===true,input.rollback);
  add('CHEM-033','human',input.chemistry.expertApprovalValid===true,{status:input.chemistry.expertApproval,reason:input.chemistry.expertApprovalReason,version:input.chemistry.expertReviewVersion,hash:input.chemistry.expertReviewHash});
  add('PROD-002','human',input.didacticApproval.valid===true,input.didacticApproval);
  for(const [label,beta] of [['BETA1',input.beta1],['BETA2',input.beta2],['BETA3',input.beta3]] as const){
    add(`${label}-APPROVALS`,'human',beta.pendingApprovals===0&&beta.releaseReady===beta.totalLearningUnits,{totalLearningUnits:beta.totalLearningUnits,releaseReady:beta.releaseReady,pendingApprovals:beta.pendingApprovals});
  }

  add('PRODUCTION-BUILD','technical',input.productionBuild?.valid===true,input.productionBuild??{});
  add('HTTP-SMOKE','technical',input.httpSmoke?.httpSmoke?.status==='pass',input.httpSmoke?.httpSmoke??{});
  add('A11Y-STATIC','technical',input.httpSmoke?.staticAccessibility?.status==='pass',input.httpSmoke?.staticAccessibility??{});

  const binding=browserBuildBinding(input);
  for(const name of ['e2e','accessibility','webVitals']){
    const gate=input.browser?.[name]??{};
    add(`BROWSER-${name.toUpperCase()}`,'external',binding.valid&&gate.status==='pass',{...gate,buildBinding:binding});
  }

  const visualGate=input.browser?.visual??{};
  const screenshotsReady=Array.isArray(visualGate.screenshots)&&visualGate.screenshots.length>0;
  const visualPass=binding.valid&&screenshotsReady&&input.visualApproval?.valid===true;
  add('BROWSER-VISUAL','human',visualPass,{browserEvidence:visualGate,buildBinding:binding,approval:input.visualApproval??{status:'pending',valid:false,reason:'APPROVAL_RECORD_MISSING'}});

  const pending=gates.filter(g=>g.status!=='PASS').map(g=>g.id);
  return {gates,pending,stableReady:pending.length===0};
}

export function runStablePreflight(root=defaultRoot){
  const targets=buildStableSignoffTargets(root);
  fs.writeFileSync(path.join(root,'reports/stable-signoff-targets.json'),`${JSON.stringify(targets,null,2)}\n`,'utf8');

  const didacticRecord=read(root,'reports/product-didactic-approval.json');
  const didacticTarget=targets.targets['PROD-002'];
  const didacticApproval=evaluateExternalApproval(didacticRecord,{version:didacticTarget.version,hash:didacticTarget.hash,reviewerRole:didacticTarget.reviewerRole});

  const visualRecord=readOptional(root,'reports/visual-review-approval.json');
  const visualTarget=targets.targets['VISUAL-001'];
  const visualApproval=evaluateExternalApproval(visualRecord,{version:visualTarget.version,hash:visualTarget.hash,reviewerRole:visualTarget.reviewerRole});

  const input={
    rc:read(root,'reports/rc-preflight.json'),
    bundle:read(root,'reports/release-bundle-integrity.json'),
    licensing:read(root,'reports/release-licensing.json'),
    rollback:read(root,'reports/release-rollback-drill.json'),
    chemistry:read(root,'reports/chemistry-validation.json'),
    didacticApproval:{...didacticApproval,version:didacticTarget.version,hash:didacticTarget.hash},
    visualApproval:{...visualApproval,version:visualTarget.version,hash:visualTarget.hash,readyForReview:visualTarget.readyForReview},
    beta1:read(root,'reports/beta1-readiness.json'),
    beta2:read(root,'reports/beta2-readiness.json'),
    beta3:read(root,'reports/beta3-readiness.json'),
    browser:read(root,'reports/browser-gates.json'),
    productionBuild:read(root,'reports/production-build.json'),
    httpSmoke:read(root,'reports/http-smoke.json'),
  };
  const result=evaluateStablePreflight(input);
  const report={generatedAt:new Date().toISOString(),phase:12,name:'Stable Product preflight',...result};
  fs.writeFileSync(path.join(root,'reports/stable-preflight.json'),`${JSON.stringify(report,null,2)}\n`,'utf8');
  return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=runStablePreflight();
  console.log(JSON.stringify({stableReady:report.stableReady,pending:report.pending}));
  if(!process.argv.includes('--status')&&!report.stableReady) process.exitCode=1;
}
