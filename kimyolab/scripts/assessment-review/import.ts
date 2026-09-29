import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {importRegister} from './lib.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const file=process.argv[2];
if(!file){console.error('USAGE: npm run assessment:review:import -- <register.json>');process.exit(2);}
try{console.log(JSON.stringify(importRegister(root,JSON.parse(fs.readFileSync(path.resolve(file),'utf8')))));}
catch(error:any){console.error(String(error?.message??error));process.exitCode=1;}
