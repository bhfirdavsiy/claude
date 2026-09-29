import {fileURLToPath} from 'node:url';
// P0.9 — full JSON Schema validation with additionalProperties:false catches every error class.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {validateCanonicalContent,readCanonicalContent} from '../scripts/lib/content-schema.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const contentDir=path.join(root,'content-src'), schemaDir=path.join(root,'schemas');
const base=readCanonicalContent(contentDir);
const clone=(v)=>structuredClone(v);
function codesFor(override){return new Set(validateCanonicalContent(contentDir,schemaDir,override).issues.map(i=>i.code));}

test('canonical content-src passes strict validation',()=>{
  const {records,issues}=validateCanonicalContent(contentDir,schemaDir);
  assert.ok(records>900);
  assert.deepEqual(issues,[]);
});

const cases=[
  ['unknown property','UNKNOWN_PROPERTY',()=>{const u=clone(base.learningUnits);u[0].surprise=true;return {learningUnits:u};}],
  ['wrong type','WRONG_TYPE',()=>{const u=clone(base.learningUnits);u[0].title=42;return {learningUnits:u};}],
  ['wrong enum','WRONG_ENUM',()=>{const p=clone(base.practiceActivities);p[0].type='hologram';return {practiceActivities:p};}],
  ['missing required','MISSING_REQUIRED',()=>{const c=clone(base.concepts);delete c[0].name;return {concepts:c};}],
  ['invalid ID format','INVALID_ID_FORMAT',()=>{const m=clone(base.mappingLinks);m[0].id='Mapping 1';return {mappingLinks:m};}],
  ['invalid reference','INVALID_REFERENCE',()=>{const m=clone(base.mappingLinks);m[0].learningUnitId='lu.7.999';return {mappingLinks:m};}],
  ['invalid nested object','UNKNOWN_PROPERTY',()=>{const t=clone(base.theoryActivities);t[0].approvals.technical.hack='x';return {theoryActivities:t};}],
  ['invalid nested enum','WRONG_ENUM',()=>{const t=clone(base.theoryActivities);t[0].approvals.didactic.status='maybe';return {theoryActivities:t};}],
  ['duplicate ID','DUPLICATE_ID',()=>{const c=clone(base.concepts);c.push(clone(c[0]));return {concepts:c};}],
  ['cross-collection duplicate ID','DUPLICATE_ID',()=>{const b=clone(base.externalLabBindings);b[1].id=b[0].id;return {externalLabBindings:b};}],
  ['assessment answer not among options','INVALID_REFERENCE',()=>{const a=clone(base.assessmentBank);a.items[0].correctOptionId='Z';return {assessmentBank:a};}],
  ['non-https external lab URL','INVALID_VALUE',()=>{const b=clone(base.externalLabBindings);const i=b.findIndex(x=>x.externalUrl);b[i].externalUrl='http://chemai.in/x';return {externalLabBindings:b};}],
];
for(const [name,code,make] of cases){
  test(`schema gate catches: ${name}`,()=>{assert.ok(codesFor(make()).has(code),`${code} expected`);});
}

test('every canonical schema object is closed (additionalProperties:false)',()=>{
  for(const file of fs.readdirSync(schemaDir).filter(f=>f.endsWith('.schema.json'))){
    const text=fs.readFileSync(path.join(schemaDir,file),'utf8');
    assert.equal(/"additionalProperties":\s*true/.test(text),false,file);
  }
});
