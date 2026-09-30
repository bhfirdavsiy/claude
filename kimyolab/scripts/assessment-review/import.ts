import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {importRegister} from './lib.ts';
import {automationContext} from '../../src/domain/assessment/governance.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const file=process.argv[2];
if(!file){console.error('USAGE: npm run assessment:review:import -- <register.json>');process.exit(2);}
const automation=automationContext(process.env);
if(automation.length){console.error(`REVIEW_IMPORT_REFUSED_IN_AUTOMATION: ${automation.join(', ')} — a person runs the import`);process.exit(1);}
try{console.log(JSON.stringify(importRegister(root,JSON.parse(fs.readFileSync(path.resolve(file),'utf8')))));}
catch(error:any){console.error(String(error?.message??error));process.exitCode=1;}
