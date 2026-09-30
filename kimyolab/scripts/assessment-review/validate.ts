import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateRegister} from './lib.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const file=process.argv[2];
if(!file){console.error('USAGE: npm run assessment:review:validate -- <register.json>');process.exit(2);}
const {rows,issues}=validateRegister(root,JSON.parse(fs.readFileSync(path.resolve(file),'utf8')));
console.log(JSON.stringify({validRows:rows.length,issues}));
if(issues.length) process.exitCode=1;
