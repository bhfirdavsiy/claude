import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeApprovalHash} from './approval-evidence.ts';

const defaultRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function readJson(root:string,rel:string){return JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));}
function readJsonOptional(root:string,rel:string,fallback:any={}){const file=path.join(root,rel);return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):fallback;}
function listJsonFiles(root:string,relDir:string){
  const base=path.join(root,relDir);
  if(!fs.existsSync(base)) return [] as string[];
  const out:string[]=[];
  const walk=(dir:string)=>{
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const file=path.join(dir,entry.name);
      if(entry.isDirectory()) walk(file);
      else if(entry.isFile()&&entry.name.endsWith('.json')) out.push(path.relative(root,file).split(path.sep).join('/'));
    }
  };
  walk(base);
  return out.sort();
}
function chemistryReviewSurface(root:string){
  const files=[
    ...listJsonFiles(root,'content-src/chemistry'),
    ...listJsonFiles(root,'content-src/activity-configs'),
    // P1.4 closeout: localized chemistry terminology (element names) is reviewed with the chemistry data
    ...listJsonFiles(root,'content-src/locales'),
  ].sort();
  return {
    schema:'kimyolab.chemistry-review-surface.v2',
    files:files.map(rel=>({path:rel,data:readJson(root,rel)})),
  };
}
function didacticReviewSurface(root:string){
  const direct=[
    'content-src/concepts.json',
    'content-src/learning-units.json',
    'content-src/practice-activities.json',
    'content-src/theory-activities.json',
    'content-src/mapping-links.json',
    'content-src/external-lab-bindings.json',
    'content-src/learning-cycle.json',
    'content-src/assessment-items.json',
    'content-src/activity-overrides.json',
    'content-src/practice-additions.json',
    'content-src/mapping-overrides.json',
    'content-src/beta2-capability-matrix.json',
    'content-src/beta3-capability-matrix.json',
  ].filter(rel=>fs.existsSync(path.join(root,rel)));
  const files=[...direct,...listJsonFiles(root,'content-src/activity-configs')].sort();
  return {schema:'kimyolab.didactic-review-surface.v2',files:files.map(rel=>({path:rel,data:readJson(root,rel)}))};
}
function readManifestVersion(root:string,key:string){
  const yaml=fs.readFileSync(path.join(root,'content-src/manifest.yaml'),'utf8');
  const match=yaml.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)["']?\\s*$`,'m'));
  if(!match) throw new Error(`MANIFEST_KEY_MISSING:${key}`);
  return match[1].trim();
}

function visualReviewTarget(root:string){
  const production=readJsonOptional(root,'reports/production-build.json',{});
  const browser=readJsonOptional(root,'reports/browser-gates.json',{});
  const screenshots=Array.isArray(browser?.visual?.screenshots)
    ? browser.visual.screenshots.map((item:any)=>({route:item.route,path:item.path,sha256:item.sha256})).sort((a:any,b:any)=>String(a.route).localeCompare(String(b.route)))
    : [];
  const buildSha256=typeof production?.sha256==='string'?production.sha256:'';
  const browserBuildSha256=typeof browser?.prodBuild?.sha256==='string'?browser.prodBuild.sha256:'';
  const readyForReview=production?.valid===true&&browser?.prodBuild?.status==='pass'&&browserBuildSha256===buildSha256&&screenshots.length>0;
  const payload={productionBuildSha256:buildSha256,screenshots};
  return {
    reviewerRole:'Visual QA Reviewer',
    version:buildSha256?`production-build:${buildSha256}`:'production-build:unavailable',
    hash:computeApprovalHash(payload),
    evidencePackage:'reports/visual-regression/phase12-smoke',
    readyForReview,
    screenshotCount:screenshots.length,
  };
}

export function buildStableSignoffTargets(root=defaultRoot){
  const chemistryVersion=readManifestVersion(root,'chemistryRulesVersion');
  const contentVersion=readManifestVersion(root,'contentVersion');
  const chemistryPayload=chemistryReviewSurface(root);
  const didacticPayload=didacticReviewSurface(root);
  return {
    generatedAt:new Date().toISOString(),
    targets:{
      'CHEM-033':{
        reviewerRole:'Chemistry Reviewer',
        version:chemistryVersion,
        hash:computeApprovalHash(chemistryPayload),
        evidencePackage:'docs/approvals/CHEM-033-review-package.md',
        reviewSurfaceSchema:chemistryPayload.schema,
        reviewSurfaceFiles:chemistryPayload.files.map((item:any)=>item.path),
        reviewSurfaceFileCount:chemistryPayload.files.length,
      },
      'PROD-002':{
        reviewerRole:'Didactic Reviewer',
        version:contentVersion,
        hash:computeApprovalHash(didacticPayload),
        evidencePackage:'docs/approvals/PROD-002-review-package.md',
        reviewSurfaceSchema:didacticPayload.schema,
        reviewSurfaceFiles:didacticPayload.files.map((item:any)=>item.path),
        reviewSurfaceFileCount:didacticPayload.files.length,
      },
      'VISUAL-001':visualReviewTarget(root),
    },
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=buildStableSignoffTargets();
  fs.writeFileSync(path.join(defaultRoot,'reports/stable-signoff-targets.json'),`${JSON.stringify(report,null,2)}\n`,'utf8');
  console.log(JSON.stringify(report.targets));
}
