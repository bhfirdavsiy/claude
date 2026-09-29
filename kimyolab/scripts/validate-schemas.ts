// Schema gate: every canonical schema compiles under Ajv strict mode and closes every
// object with additionalProperties:false (unless explicitly marked as an extension point).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createContentAjv} from './lib/content-schema.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const schemaDir=path.join(root,'schemas');
const issues:string[]=[];
let ajv:any;
try{ajv=createContentAjv(schemaDir);}catch(error){issues.push(`SCHEMA_COMPILE:${error instanceof Error?error.message:String(error)}`);}

function walk(node:unknown,where:string,file:string){
  if(Array.isArray(node)){node.forEach((x,i)=>walk(x,`${where}/${i}`,file));return;}
  if(!node||typeof node!=='object') return;
  const obj=node as Record<string,unknown>;
  if(obj.properties&&obj.additionalProperties===undefined&&obj['x-kimyolab-extension']!==true) issues.push(`ADDITIONAL_PROPERTIES_OPEN:${file}#${where}`);
  if(obj.additionalProperties===true&&obj['x-kimyolab-extension']!==true) issues.push(`ADDITIONAL_PROPERTIES_TRUE:${file}#${where}`);
  // if/then/else/not only constrain an object that is already closed; they do not define one.
  for(const [k,v] of Object.entries(obj)) if(!['if','then','else','not'].includes(k)) walk(v,`${where}/${k}`,file);
}
const files=fs.readdirSync(schemaDir).filter(f=>f.endsWith('.schema.json')).sort();
for(const file of files){
  const schema=JSON.parse(fs.readFileSync(path.join(schemaDir,file),'utf8'));
  if(schema.$schema!=='https://json-schema.org/draft/2020-12/schema') issues.push(`SCHEMA_DIALECT:${file}`);
  walk(schema,'',file);
  if(ajv&&!ajv.getSchema(file)) issues.push(`SCHEMA_NOT_REGISTERED:${file}`);
}
console.log(JSON.stringify({schemas:files.length,issues:issues.length}));
for(const issue of issues) console.error(issue);
if(issues.length) process.exitCode=1;
