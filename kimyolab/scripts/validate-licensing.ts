import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateLicensing,type LicenseSourceRef} from '../src/runtime/governance/licensing.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const roots=['css','js','images','fonts','vendor','inc'];
const assets:string[]=[];
function walk(dir:string){
  if(!fs.existsSync(dir)) return;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) walk(full);
    else assets.push(path.relative(root,full).split(path.sep).join('/'));
  }
}
for(const rel of roots) walk(path.join(root,rel));
assets.sort();

const sourceFiles=['learning-units.json','theory-activities.json','practice-activities.json','concepts.json','chemistry/species.json','chemistry/reactions.json'];
const sourceRefs:LicenseSourceRef[]=[];
for(const rel of sourceFiles){
  const value=JSON.parse(fs.readFileSync(path.join(root,'content-src',rel),'utf8'));
  const records=Array.isArray(value)?value:[];
  for(const record of records) if(Array.isArray(record?.sourceRefs)) sourceRefs.push(...record.sourceRefs);
}
const records=JSON.parse(fs.readFileSync(path.join(root,'content-src/licenses.json'),'utf8'));
const result=validateLicensing({assets,records,sourceRefs});
const report={
  ...result,
  pendingAssetCount:result.pendingAssets.length,
  missingAssetCount:result.missingAssets.length,
  unlicensedSourceRefCount:result.unlicensedSourceRefs.length,
};
fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports/licensing.json'),`${JSON.stringify(report,null,2)}\n`,'utf8');
console.log(JSON.stringify({totalAssets:report.totalAssets,approvedAssets:report.approvedAssets,pendingAssetCount:report.pendingAssetCount,missingAssetCount:report.missingAssetCount,unlicensedSourceRefCount:report.unlicensedSourceRefCount,releaseReady:report.releaseReady}));
if(process.argv.includes('--strict')&&!result.releaseReady) process.exitCode=1;
