// P2.4 — governed content operations (ADR-P2-005). Commands:
//   npm run theory:check  -- <packet.json>   every apply check, no write (any environment)
//   npm run theory:import -- <packet.json>   store a workbench packet as a NON-canonical working draft
//                                            (authoring-drafts/theory/<lu>.json); never packed, never approval
//   npm run theory:apply  -- <packet.json>   a PERSON makes a fully dual-reviewed packet canonical, then the pack and
//                                            the theory reports are regenerated; refused in CI / agent environments
//   npm run source:queue                     write the source-review queue (review-packets/source-intake/queue.json)
//   npm run source:apply  -- <intake.json>   a PERSON adds a human-APPROVED source to the registry; refused in automation
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {automationContext} from '../src/domain/assessment/governance.ts';
import {checkTheoryPacket,applyTheoryPacket,importTheoryDraft,applySourceIntake,sourceReviewQueue} from './lib/content-operations.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const SOURCE_QUEUE='review-packets/source-intake/queue.json';

export function writeSourceQueue(base=root){
  const entries=sourceReviewQueue(base);
  const queue={schema:'kimyolab.source-review-queue.v1',
    semantics:'Submitted sources and their DERIVED state. A machine validates metadata, computes hashes and detects duplicates; only a human decision on the current hash, accepting the claimed category, approves. Nothing here is authoritative until npm run source:apply.',
    counts:{entries:entries.length,byState:Object.fromEntries(['DRAFT','READY_FOR_REVIEW','APPROVED','CHANGES_REQUESTED','REJECTED'].map(s=>[s,entries.filter(e=>e.state===s).length]))},entries};
  fs.mkdirSync(path.dirname(path.join(base,SOURCE_QUEUE)),{recursive:true});
  fs.writeFileSync(path.join(base,SOURCE_QUEUE),`${JSON.stringify(queue,null,2)}\n`,'utf8');
  return queue;
}

function refuseInAutomation(command:string){
  const automation=automationContext(process.env);
  if(automation.length){ console.error(`${command.toUpperCase().replace(':','_')}_REFUSED_IN_AUTOMATION: ${automation.join(', ')} — a person runs canonical applies`); process.exit(1); }
}
const readArg=(arg:string|undefined,command:string)=>{ if(!arg){ console.error(`usage: npm run ${command} -- <file.json>`); process.exit(2); } return JSON.parse(fs.readFileSync(path.resolve(arg),'utf8')); };

async function main(){
  const [command,arg]=process.argv.slice(2);
  if(command==='theory:check'){ const c=checkTheoryPacket(root,readArg(arg,command)); console.log(JSON.stringify({ok:c.ok,review:c.review,issues:c.issues},null,2)); if(!c.ok) process.exitCode=1; return; }
  if(command==='theory:import'){ const r=importTheoryDraft(root,readArg(arg,command)); console.log(JSON.stringify({...r,canonical:false},null,2)); if(!r.imported) process.exitCode=1; return; }
  if(command==='theory:apply'){
    refuseInAutomation(command);
    const r=applyTheoryPacket(root,readArg(arg,command));
    console.log(JSON.stringify(r,null,2));
    if(!r.applied){ process.exitCode=1; return; }
    for(const script of ['content:pack','theory:authoring']) execFileSync('npm',['run','-s',script],{cwd:root,stdio:'inherit',shell:process.platform==='win32'});
    return;
  }
  if(command==='source:queue'){ const q=writeSourceQueue(); console.log(JSON.stringify(q.counts)); return; }
  if(command==='source:apply'){
    refuseInAutomation(command);
    const r=applySourceIntake(root,readArg(arg,command));
    console.log(JSON.stringify(r,null,2));
    if(!r.applied) process.exitCode=1; else writeSourceQueue();
    return;
  }
  console.error('usage: content-operations.ts theory:check|theory:import|theory:apply <packet> | source:queue | source:apply <intake>');
  process.exit(2);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
