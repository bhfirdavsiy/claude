import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function fail(code:string):never{throw new Error(code);}
const sha256=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function readJson(file:string){return JSON.parse(fs.readFileSync(file,'utf8'));}
function copyTree(src:string,dst:string){fs.mkdirSync(dst,{recursive:true});for(const e of fs.readdirSync(src,{withFileTypes:true})){const a=path.join(src,e.name),b=path.join(dst,e.name);if(e.isDirectory())copyTree(a,b);else fs.copyFileSync(a,b);}}

export function importBrowserEvidence(evidenceRoot:string,base=root){
  const source=path.resolve(evidenceRoot);
  const reportFile=[path.join(source,'reports/browser-gates.json'),path.join(source,'browser-gates.json')].find(fs.existsSync);
  if(!reportFile) fail('BROWSER_EVIDENCE_REPORT_MISSING');
  const report=readJson(reportFile);
  const production=readJson(path.join(base,'reports/production-build.json'));
  if(report.environment?.managedPolicyBlocked===true) fail('BROWSER_EVIDENCE_MANAGED_POLICY_BLOCKED');
  if(report.prodBuild?.status!=='pass') fail('BROWSER_EVIDENCE_BUILD_NOT_PASS');
  const bind=report.prodBuild;
  if(bind.sha256!==production.sha256||bind.fileCount!==production.fileCount||bind.deploySurfaceSha256!==production.deploySurfaceSha256||bind.deployFileCount!==production.deployFileCount) fail('BROWSER_EVIDENCE_BUILD_HASH_MISMATCH');
  for(const gate of ['e2e','accessibility','webVitals']) if(report[gate]?.status!=='pass') fail(`BROWSER_EVIDENCE_GATE_NOT_PASS:${gate}`);
  if(!['pending','pass'].includes(report.visual?.status)||!Array.isArray(report.visual.screenshots)||report.visual.screenshots.length===0) fail('BROWSER_EVIDENCE_VISUAL_NOT_READY');
  const evidenceScreenshotRoot=path.join(source,'reports/visual-regression/phase12-smoke');
  if(!fs.existsSync(evidenceScreenshotRoot)) fail('BROWSER_EVIDENCE_SCREENSHOT_DIR_MISSING');
  for(const shot of report.visual.screenshots){
    const rel=String(shot.path??'').replace(/\\/g,'/');
    const file=rel.startsWith('reports/')?path.join(source,rel):path.join(evidenceScreenshotRoot,path.basename(rel));
    if(!fs.existsSync(file)) fail(`BROWSER_EVIDENCE_SCREENSHOT_MISSING:${rel}`);
    if(shot.sha256&&sha256(file)!==shot.sha256) fail(`BROWSER_EVIDENCE_SCREENSHOT_HASH_MISMATCH:${rel}`);
  }
  const targetShots=path.join(base,'reports/visual-regression/phase12-smoke');
  fs.rmSync(targetShots,{recursive:true,force:true});copyTree(evidenceScreenshotRoot,targetShots);
  fs.writeFileSync(path.join(base,'reports/browser-gates.json'),`${JSON.stringify({...report,importedAt:new Date().toISOString(),importSource:path.basename(source)},null,2)}\n`,'utf8');
  const audit={generatedAt:new Date().toISOString(),status:'IMPORTED',productionBuildSha256:production.sha256,deploySurfaceSha256:production.deploySurfaceSha256,screenshotCount:report.visual.screenshots.length,source:path.basename(source)};
  fs.writeFileSync(path.join(base,'reports/browser-evidence-import.json'),`${JSON.stringify(audit,null,2)}\n`,'utf8');
  return audit;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const dir=process.argv[2];if(!dir) fail('USAGE:browser:evidence:import -- <unpacked-evidence-folder>');console.log(JSON.stringify(importBrowserEvidence(dir)));}
  catch(error:any){console.error(String(error?.message??error));process.exitCode=1;}
}
