// Review workflow commands (P1.8):
//   npm run review:build                     — review packets (chemistry KB, assessment), review reports, workbench HTML
//   npm run review:status                    — the review reports only (deterministic; part of content:validate)
//   npm run review:validate -- <decisions>   — import preview of a workbench decision file; writes nothing
//   npm run review:import -- <decisions>     — a PERSON imports a valid decision file through the existing importers
// Nothing here approves, signs off or edits content. Missing human review is PENDING, never a failure.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildWorkbenchModel,validateDecisionFile,importDecisionFile,humanReviewStatus,changeQueue,authoringCandidates,goldenSliceDependencies,promotionImpact,REVIEW_REPORTS} from './lib/review-workbench.ts';
import {automationContext} from '../src/domain/assessment/governance.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

export async function writeReviewReports(base=root){
  const {evaluatePilot}=await import('./pilot-status.ts');
  const model=buildWorkbenchModel(base);
  const write=(rel:string,body:unknown)=>{ fs.mkdirSync(path.dirname(path.join(base,rel)),{recursive:true}); fs.writeFileSync(path.join(base,rel),`${JSON.stringify(body,null,2)}\n`,'utf8'); };
  const status=humanReviewStatus(model,base);
  write(REVIEW_REPORTS.status,status);
  write(REVIEW_REPORTS.changeQueue,changeQueue(model,base));
  write(REVIEW_REPORTS.candidates,authoringCandidates(model));
  write(REVIEW_REPORTS.goldenSlice,goldenSliceDependencies(model,base));
  write(REVIEW_REPORTS.impact,await promotionImpact(model,base,evaluatePilot));
  return {model,status};
}

async function main(){
  const [command,file]=process.argv.slice(2);
  if(command==='status'||command==='build'){
    if(command==='build'){
      const {writeAll}=await import('./chemistry-kb.ts');
      const {buildPackets}=await import('./assessment-review/lib.ts');
      writeAll(root); buildPackets(root);
    }
    const {status}=await writeReviewReports(root);
    if(command==='build'){ const {writeWorkspace}=await import('./generate-reviewer-workspace.ts'); writeWorkspace(root); }
    console.log(JSON.stringify({gate:'PENDING',humanDecisionsImported:status.humanDecisionsImported.total,chemistry:{total:status.chemistry.total,pending:status.chemistry.pending,approved:status.chemistry.approved,stale:status.chemistry.stale},assessment:{total:status.assessment.total,fullyApproved:status.assessment.fullyApproved},pilot:status.pilot}));
    return;
  }
  if(command==='validate'||command==='import'){
    if(!file){ console.error(`usage: npm run review:${command} -- <decision file>`); process.exit(2); }
    const envelope=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
    if(command==='validate'){
      const v=validateDecisionFile(root,envelope);
      console.log(JSON.stringify(v,null,2));
      if(v.issues.length) process.exitCode=1;
      return;
    }
    const automation=automationContext(process.env);
    if(automation.length){ console.error(`REVIEW_IMPORT_REFUSED_IN_AUTOMATION: ${automation.join(', ')} — a person runs the import`); process.exit(1); }
    const out=importDecisionFile(root,envelope);
    console.log(JSON.stringify(out,null,2));
    if(out.pilotSignoffsNotImported) console.error(`${out.pilotSignoffsNotImported} pilot sign-off(s) validated but NOT written: the pilot owner adds them to content-src/pilot-signoffs.json in a pull request (ADR-P1-004).`);
    if(out.issues.length){ process.exitCode=1; return; }
    await writeReviewReports(root);
    return;
  }
  console.error('usage: review.ts build | status | validate <file> | import <file>');
  process.exit(2);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
