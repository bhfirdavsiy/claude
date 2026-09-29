// P0.15.6 — Release freeze. Run on the merge commit on `main`:
//   npm run release:freeze -- --tag kimyolab-p0-integrity-20.1.0
// It does NOT trust an existing reports/p0-acceptance.json (an untracked, hand-editable file):
// it requires a clean tree, runs the full acceptance (`verify`) itself, requires PASS for exactly
// HEAD, requires that verify changed nothing but report artefacts, and only then creates an
// annotated tag whose message embeds the version manifest. Pushing the tag is a separate step.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argv=process.argv.slice(2);
const arg=(name:string)=>argv.includes(name)?argv[argv.indexOf(name)+1]:undefined;
const tag=arg('--tag')??'kimyolab-p0-integrity-20.1.0';
const RELEASE_BRANCH='main';
/** verify rewrites these report artefacts; nothing else may change. */
const VERIFY_ARTEFACTS=[/^reports\//,/^review-packets\//];

function git(args:string[]){const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});if(r.status!==0)throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);return r.stdout.trim();}
function fail(code:string,detail=''):never{console.error(`${code}${detail?`: ${detail}`:''}`);process.exit(1);}
function dirtyPaths(){return git(['status','--porcelain','--untracked-files=normal','--','.']).split('\n').filter(Boolean).map(l=>l.slice(3).replace(/^kimyolab\//,''));}

if(!/^kimyolab-[a-z0-9.-]+$/.test(tag)) fail('RELEASE_TAG_INVALID',tag);
const branch=git(['rev-parse','--abbrev-ref','HEAD']);
if(branch!==RELEASE_BRANCH) fail('RELEASE_BRANCH_MISMATCH',`on ${branch}, expected ${RELEASE_BRANCH}`);
const head=git(['rev-parse','HEAD']);
const dirty=dirtyPaths();
if(dirty.length) fail('RELEASE_TREE_DIRTY',dirty.join(', '));
if(spawnSync('git',['rev-parse','-q','--verify',`refs/tags/${tag}`],{cwd:root}).status===0) fail('RELEASE_TAG_EXISTS',tag);

const started=Date.now();
console.log(`Running P0 acceptance on ${head} …`);
const run=spawnSync(process.execPath,['scripts/p0-acceptance.ts'],{cwd:root,stdio:'inherit'});
if(run.status!==0) fail('ACCEPTANCE_NOT_PASS',`verify exited with ${run.status}`);
const acceptance=JSON.parse(fs.readFileSync(path.join(root,'reports/p0-acceptance.json'),'utf8'));
if(Date.parse(acceptance.generatedAt)<started) fail('ACCEPTANCE_REPORT_STALE');
if(acceptance.status!=='PASS'||acceptance.partialRun) fail('ACCEPTANCE_NOT_PASS',acceptance.status);
if(acceptance.commit!==head||acceptance.workingTreeCleanAtStart!==true) fail('ACCEPTANCE_NOT_FOR_HEAD',`${acceptance.commit} clean=${acceptance.workingTreeCleanAtStart}`);
if(git(['rev-parse','HEAD'])!==head) fail('RELEASE_HEAD_MOVED');
const changed=dirtyPaths().filter(p=>!VERIFY_ARTEFACTS.some(r=>r.test(p)));
if(changed.length) fail('RELEASE_VERIFY_MUTATED_SOURCE',changed.join(', '));

const freeze={
  tag,
  commit:head,
  branch,
  frozenAt:new Date().toISOString(),
  milestone:acceptance.milestone,
  acceptance:Object.fromEntries(['status','typecheck','schema','chemistry','contentIntegrity','security','evidence','migration','unit','e2e','cleanBuild'].map(k=>[k,acceptance[k]])),
  acceptanceGeneratedAt:acceptance.generatedAt,
  versions:acceptance.versions,
  typecheckDebt:acceptance.typecheckDebt,
};
git(['tag','-a',tag,head,'-m',`KimyoLab ${acceptance.milestone} release freeze\n\n${JSON.stringify(freeze,null,2)}`]);
fs.writeFileSync(path.join(root,'reports/p0-release-freeze.json'),JSON.stringify(freeze,null,2)+'\n');
console.log(JSON.stringify(freeze,null,2));
console.log(`\nTag ${tag} created at ${head}. Publish with: git push origin refs/tags/${tag}`);
