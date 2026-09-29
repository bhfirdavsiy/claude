// P0 acceptance runner (P0.15.1 / P0.15.5). This IS `npm run verify`.
// Runs every gate in order, records real exit codes and writes reports/p0-acceptance.json.
// Nothing in the report is written by hand: each field is derived from the gates below.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {APP_COMPATIBILITY} from '../src/app/app-version.ts';
import {CURRENT_DB_VERSION} from '../src/runtime/progress/indexeddb-store.ts';
import {PROGRESS_SCHEMA_VERSION} from '../src/runtime/progress/types.ts';
import {computeTreeHash} from './deploy-surface-hash.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

export interface Gate { id:string; run:string[]; }
/** Ordered verify chain (TT P0.15.1): lint → typecheck → typecheck:next → schema → content → chemistry → unit → integration → E2E → build. */
export const GATES:Gate[]=[
  {id:'lint',run:['npm','run','-s','lint']},
  {id:'typecheck',run:['npm','run','-s','typecheck']},
  {id:'typecheck:next',run:['npm','run','-s','typecheck:next']},
  {id:'schema',run:['npm','run','-s','schema:validate']},
  {id:'content',run:['npm','run','-s','content:validate']},
  {id:'chemistry',run:['npm','run','-s','chemistry:validate']},
  {id:'unit',run:['npm','run','-s','test']},
  {id:'integration',run:['npm','run','-s','test:integration']},
  {id:'e2e',run:['npm','run','-s','test:e2e']},
  {id:'build',run:['npm','run','-s','build']},
];
/** Focused P0 suites that back individual acceptance fields (they also run inside `unit`). */
const FOCUSED:Gate[]=[
  {id:'suite:contentIntegrity',run:['node','--test','tests/p0-content-integrity.test.mjs']},
  {id:'suite:evidence',run:['node','--test','--test-concurrency=1','tests/p0-evidence-immutability.test.mjs','tests/p0-version-safe-mastery.test.mjs']},
  {id:'suite:migration',run:['node','--test','--test-concurrency=1','tests/p0-progress-migration.test.mjs']},
  {id:'suite:serverPaths',run:['node','--test','tests/p0-server-paths.test.mjs']},
];
/** Acceptance field → gates that must all pass. */
export const FIELDS:Record<string,string[]>={
  typecheck:['typecheck','typecheck:next'],
  schema:['schema','content'],
  chemistry:['chemistry'],
  contentIntegrity:['suite:contentIntegrity','e2e'],
  security:['lint','integration','suite:serverPaths'],
  evidence:['suite:evidence'],
  migration:['suite:migration'],
  unit:['unit'],
  e2e:['e2e'],
  cleanBuild:['build','generated-files-committed'],
};

interface GateResult { id:string; command:string; exitCode:number; durationMs:number; status:'PASS'|'FAIL'; detail?:unknown }

function exec(cmd:string[]):{status:number;stdout:string}{
  const r=spawnSync(cmd[0]!,cmd.slice(1),{cwd:root,encoding:'utf8',stdio:['ignore','pipe','inherit'],shell:process.platform==='win32',maxBuffer:256*1024*1024});
  if(r.stdout) process.stdout.write(r.stdout);
  return {status:r.status??1,stdout:r.stdout??''};
}

function runGate(gate:Gate):GateResult{
  console.log(`\n▶ ${gate.id}: ${gate.run.join(' ')}`);
  const started=Date.now();
  const r=exec(gate.run);
  const result:GateResult={id:gate.id,command:gate.run.join(' '),exitCode:r.status,durationMs:Date.now()-started,status:r.status===0?'PASS':'FAIL'};
  if(gate.id==='typecheck:next'){try{result.detail=JSON.parse(r.stdout.trim().split('\n').find(l=>l.startsWith('{'))??'null');}catch{}}
  console.log(`${result.status==='PASS'?'✓':'✗'} ${gate.id} (${result.durationMs} ms)`);
  return result;
}

function git(args:string[]){const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});return r.status===0?r.stdout.trim():undefined;}

const GENERATED=['public/app-preview','public/content'];
function generatedHash(){return Object.fromEntries(GENERATED.map(rel=>[rel,computeTreeHash(path.join(root,rel)).sha256]));}

/** cleanBuild: a from-scratch build must reproduce exactly the generated files that were in the tree before verify started. */
function generatedFilesCheck(before:Record<string,string>):GateResult{
  const after=generatedHash();
  const changed=GENERATED.filter(rel=>before[rel]!==after[rel]);
  return {id:'generated-files-committed',command:`tree hash of ${GENERATED.join(', ')} before verify == after build`,exitCode:changed.length?1:0,durationMs:0,status:changed.length?'FAIL':'PASS',detail:changed.length?{changed,hint:'run npm run build and commit the regenerated files'}:{sha256:after}};
}

function main(){
  const only=process.argv.includes('--gates')?process.argv[process.argv.indexOf('--gates')+1]!.split(','):undefined;
  const before=generatedHash();
  const results=new Map<string,GateResult>();
  for(const gate of [...GATES,...FOCUSED]) if(!only||only.includes(gate.id)) results.set(gate.id,runGate(gate));
  if(!only||only.includes('generated-files-committed')) results.set('generated-files-committed',generatedFilesCheck(before));

  const fieldStatus=(ids:string[])=>ids.every(id=>results.get(id)?.status==='PASS')?'PASS':'FAIL';
  const fields=Object.fromEntries(Object.entries(FIELDS).map(([k,ids])=>[k,fieldStatus(ids)]));
  const pointer=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
  const pack=JSON.parse(fs.readFileSync(path.join(root,'public/content',pointer.activeVersion,'manifest.json'),'utf8'));
  const allGates=[...results.values()];
  const report={
    milestone:'P0-INTEGRITY',
    status:!only&&allGates.every(g=>g.status==='PASS')?'PASS':'FAIL',
    ...fields,
    generatedAt:new Date().toISOString(),
    partialRun:Boolean(only),
    commit:git(['rev-parse','HEAD'])??null,
    versions:{
      appVersion:APP_COMPATIBILITY.appVersion,
      contentVersion:pack.contentVersion,
      contentChecksum:pack.checksum,
      schemaVersion:pack.schemaVersion,
      scoringVersion:pack.scoringVersion,
      curriculumVersion:pack.curriculumVersion,
      dbVersion:CURRENT_DB_VERSION,
      progressSchemaVersion:PROGRESS_SCHEMA_VERSION,
      node:process.version,
    },
    typecheckDebt:results.get('typecheck:next')?.detail??null,
    gates:allGates,
  };
  fs.mkdirSync(path.join(root,'reports'),{recursive:true});
  fs.writeFileSync(path.join(root,'reports/p0-acceptance.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`\nP0 acceptance: ${report.status}`);
  console.log(JSON.stringify({milestone:report.milestone,status:report.status,...fields},null,2));
  if(report.status!=='PASS') process.exitCode=1;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main();
