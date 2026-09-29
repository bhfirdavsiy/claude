import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateReleaseLicensing} from './release-licensing.ts';
import type {LicenseSourceRef} from '../src/runtime/governance/licensing.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bundle=path.resolve(root,process.argv[2]??'dist-rc');
const manifestFile=path.join(bundle,'release-manifest.json');
if(!fs.existsSync(manifestFile)) throw new Error('RELEASE_MANIFEST_MISSING');
const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
const sourceFiles=['learning-units.json','theory-activities.json','practice-activities.json','concepts.json','chemistry/species.json','chemistry/reactions.json'];
const sourceRefs:LicenseSourceRef[]=[];
for(const rel of sourceFiles){
  const file=path.join(root,'content-src',rel);
  if(!fs.existsSync(file)) continue;
  const value=JSON.parse(fs.readFileSync(file,'utf8'));
  for(const record of Array.isArray(value)?value:[]) if(Array.isArray(record?.sourceRefs)) sourceRefs.push(...record.sourceRefs);
}
const unlicensed=[...new Set(sourceRefs.filter(ref=>ref.type!=='internal'&&!ref.license).map(ref=>ref.id))];
const result=validateReleaseLicensing({files:manifest.files??[],unlicensedSourceRefs:unlicensed});
fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports/release-licensing.json'),`${JSON.stringify(result,null,2)}\n`,'utf8');
console.log(JSON.stringify(result));
if(!result.releaseReady) process.exitCode=1;
