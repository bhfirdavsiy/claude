// TT 4.1.5 — freeze manifest: SHA-256 of what a frozen KimyoLab commit consists of (toolchain lock, source trees,
// committed generated content, configuration surface, feature-flag defaults, reports). Deterministic, no timestamp.
// A file cannot contain the hash of the commit that contains it: the commit SHA is recorded where the freeze is
// declared (the PR / audit report), and `--check` proves the working tree still equals this manifest.
//   npm run freeze:manifest            → writes reports/freeze-manifest.json
//   npm run freeze:manifest -- --check → fails when the tree differs from the committed manifest
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {computeTreeHash} from './deploy-surface-hash.ts';
import {FEATURE_FLAGS} from '../src/app/feature-flags.ts';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const FREEZE_MANIFEST='reports/freeze-manifest.json';
const sha=(rel:string)=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,rel))).digest('hex');
const tree=(rel:string,exclude:string[]=[])=>{ const t=computeTreeHash(path.join(ROOT,rel),exclude); return {fileCount:t.fileCount,sha256:t.sha256}; };
/** reports that are this manifest's own output or are rewritten with a wall-clock time on every run are listed but not
 *  hashed: their bytes change without any input changing (the inputs that produce them are hashed above) */
const VOLATILE=new Set([FREEZE_MANIFEST]);

export function freezeManifest(){
  // the manifest itself is always listed (present or not), so a first write and a later --check list the same files
  const reports=[...new Set([...fs.readdirSync(path.join(ROOT,'reports')).filter(f=>f.endsWith('.json')).map(f=>`reports/${f}`),FREEZE_MANIFEST])].sort();
  const pack=JSON.parse(fs.readFileSync(path.join(ROOT,'public/content/manifest.json'),'utf8'));
  return {
    schema:'kimyolab.freeze-manifest.v1',
    decision:'NOT_A_RELEASE_OR_PILOT_DECISION',
    semantics:'What a frozen commit consists of. The commit SHA is recorded where the freeze is declared; `npm run freeze:manifest -- --check` proves the tree equals this manifest. A freeze is not an approval: chemistry, pedagogy, rights and release decisions stay with the named humans.',
    toolchain:{node:fs.readFileSync(path.join(ROOT,'.nvmrc'),'utf8').trim(),packageJson:sha('package.json'),packageLock:sha('package-lock.json')},
    source:{src:tree('src'),scripts:tree('scripts'),server:tree('server'),contentSrc:tree('content-src'),tests:tree('tests',['e2e/__snapshots__'])},
    generated:{note:'committed build outputs; npm run verify proves they equal a fresh build (generated-files-committed)',publicContent:tree('public/content'),publicAppPreview:tree('public/app-preview')},
    contentPack:{activeVersion:pack.activeVersion??null,checksum:pack.checksum??null,manifest:sha('public/content/manifest.json')},
    config:{deployConfig:sha('scripts/lib/deploy-config.ts'),envExample:sha('config/nobook.env.example'),typecheckRatchet:sha('config/typecheck-ratchet.json'),
      featureFlags:Object.fromEntries(Object.entries(FEATURE_FLAGS).map(([k,v])=>[k,{default:v.default}]))},
    reports:reports.map(r=>VOLATILE.has(r)?{file:r,sha256:null,reason:'this manifest'}:{file:r,sha256:sha(r)}),
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const body=`${JSON.stringify(freezeManifest(),null,2)}\n`;
  const f=path.join(ROOT,FREEZE_MANIFEST);
  if(process.argv.includes('--check')){
    if(!fs.existsSync(f)||fs.readFileSync(f,'utf8')!==body){
      const old=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):{};
      const now=JSON.parse(body);
      const diff=(a:any,b:any,p=''):string[]=>typeof a!=='object'||a===null||typeof b!=='object'||b===null?(JSON.stringify(a)===JSON.stringify(b)?[]:[p||'/']):[...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>diff(a[k],b[k],`${p}/${k}`));
      console.error(`STALE ${FREEZE_MANIFEST}: ${diff(old,now).slice(0,20).join(', ')}`); process.exit(1);
    }
    console.log(JSON.stringify({freeze:'MATCH'}));
  } else { fs.writeFileSync(f,body); console.log(JSON.stringify({written:FREEZE_MANIFEST})); }
}
