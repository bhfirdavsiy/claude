// Governed authoring commands (P1.9):
//   npm run authoring:draft -- <taskId>        — writes a DRAFT skeleton to authoring-drafts/<taskId>.json (null placeholders)
//   npm run authoring:preview -- <draft.json>  — validates the draft and writes the patch to authoring-output/ (no content change)
//   npm run authoring:apply -- <draft.json>    — a PERSON applies a completed draft to one allowlisted content file;
//                                                refused in CI / agent environments. Every review of that content becomes STALE.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deriveAuthoringTasks,draftFor,previewDraft,applyDraft,DRAFT_DIR,PATCH_DIR} from './lib/authoring.ts';
import {automationContext} from '../src/domain/assessment/governance.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

async function main(){
  const [command,arg]=process.argv.slice(2);
  if(command==='draft'){
    const task=deriveAuthoringTasks(root).find(t=>t.id===arg);
    if(!task){ console.error(`AUTHORING_TASK_UNKNOWN:${arg}`); process.exit(1); }
    const file=path.join(root,DRAFT_DIR,`${task.id}.json`);
    if(fs.existsSync(file)){ console.error(`DRAFT_EXISTS:${path.relative(root,file)}`); process.exit(1); }
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,`${JSON.stringify(draftFor(root,task),null,2)}\n`,'utf8');
    console.log(JSON.stringify({draft:path.relative(root,file),status:'DRAFT',canonical:false}));
    return;
  }
  if(command==='preview'||command==='apply'){
    if(!arg){ console.error(`usage: npm run authoring:${command} -- <draft.json>`); process.exit(2); }
    const draft=JSON.parse(fs.readFileSync(path.resolve(arg),'utf8'));
    if(command==='preview'){
      const p=previewDraft(root,draft);
      if(p.patch&&p.taskId){ const out=path.join(root,PATCH_DIR,`${p.taskId}.patch.json`); fs.mkdirSync(path.dirname(out),{recursive:true}); fs.writeFileSync(out,`${JSON.stringify({status:'DRAFT OUTPUT',canonical:false,...p},null,2)}\n`,'utf8'); }
      console.log(JSON.stringify(p,null,2));
      if(!p.ok) process.exitCode=1;
      return;
    }
    const automation=automationContext(process.env);
    if(automation.length){ console.error(`AUTHORING_APPLY_REFUSED_IN_AUTOMATION: ${automation.join(', ')} — a person applies content changes`); process.exit(1); }
    const out=applyDraft(root,draft);
    console.log(JSON.stringify(out,null,2));
    if(!out.applied){ process.exitCode=1; return; }
    console.error('Applied. Every earlier review of this content is now STALE: rebuild (npm run review:build) and request a new review.');
    return;
  }
  if(command==='tasks'){ console.log(JSON.stringify(deriveAuthoringTasks(root).map(t=>({id:t.id,status:t.status,surface:t.surface,action:t.action,targetId:t.targetId})),null,2)); return; }
  console.error('usage: authoring.ts tasks | draft <taskId> | preview <draft> | apply <draft>');
  process.exit(2);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
