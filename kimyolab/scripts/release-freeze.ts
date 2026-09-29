// P0.15.6 — Release freeze. Run on the merge commit AFTER `npm run verify` passed on that same commit:
//   npm run verify && npm run release:freeze -- --tag kimyolab-p0-integrity-20.1.0
// Refuses unless the acceptance report is PASS for exactly HEAD and the tree is clean.
// Creates an annotated tag whose message embeds the version manifest; pushing it is a separate, explicit step.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argv=process.argv.slice(2);
const arg=(name:string)=>argv.includes(name)?argv[argv.indexOf(name)+1]:undefined;
const tag=arg('--tag')??'kimyolab-p0-integrity-20.1.0';
const requiredBranch=arg('--branch')??'main';
function git(args:string[]){const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});if(r.status!==0)throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);return r.stdout.trim();}
function fail(code:string,detail=''):never{console.error(`${code}${detail?`: ${detail}`:''}`);process.exit(1);}

if(!/^kimyolab-[a-z0-9.-]+$/.test(tag)) fail('RELEASE_TAG_INVALID',tag);
const head=git(['rev-parse','HEAD']);
const branch=git(['rev-parse','--abbrev-ref','HEAD']);
if(branch!==requiredBranch&&!argv.includes('--allow-any-branch')) fail('RELEASE_BRANCH_MISMATCH',`on ${branch}, expected ${requiredBranch}`);
const dirty=git(['status','--porcelain','--',':!reports',':!review-packets']);
if(dirty) fail('RELEASE_TREE_DIRTY',dirty);
if(spawnSync('git',['rev-parse','-q','--verify',`refs/tags/${tag}`],{cwd:root}).status===0) fail('RELEASE_TAG_EXISTS',tag);
const reportFile=path.join(root,'reports/p0-acceptance.json');
if(!fs.existsSync(reportFile)) fail('ACCEPTANCE_REPORT_MISSING','run npm run verify first');
const acceptance=JSON.parse(fs.readFileSync(reportFile,'utf8'));
if(acceptance.status!=='PASS'||acceptance.partialRun) fail('ACCEPTANCE_NOT_PASS',acceptance.status);
if(acceptance.commit!==head) fail('ACCEPTANCE_COMMIT_MISMATCH',`report is for ${acceptance.commit}, HEAD is ${head}`);

const freeze={
  tag,
  commit:head,
  branch,
  frozenAt:new Date().toISOString(),
  milestone:acceptance.milestone,
  acceptanceGeneratedAt:acceptance.generatedAt,
  versions:acceptance.versions,
  typecheckDebt:acceptance.typecheckDebt,
};
git(['tag','-a',tag,head,'-m',`KimyoLab ${acceptance.milestone} release freeze\n\n${JSON.stringify(freeze,null,2)}`]);
fs.writeFileSync(path.join(root,'reports/p0-release-freeze.json'),JSON.stringify(freeze,null,2)+'\n');
console.log(JSON.stringify(freeze,null,2));
console.log(`\nTag ${tag} created at ${head}. Publish with: git push origin refs/tags/${tag}`);
