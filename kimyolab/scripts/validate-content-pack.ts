import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateContentPackIntegrity} from './content-pack-integrity.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const result=validateContentPackIntegrity(root);
fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports/content-pack-integrity.json'),`${JSON.stringify(result,null,2)}\n`,'utf8');
console.log(JSON.stringify({valid:result.valid,issues:result.issues.length}));
if(!result.valid) process.exitCode=1;
