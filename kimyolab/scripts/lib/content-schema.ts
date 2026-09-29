// Full JSON Schema (2020-12, Ajv) validation for canonical content (P0.9).
// The custom minimal validator is no longer the source of truth for content-src.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const Ajv2020=require('ajv/dist/2020').default ?? require('ajv/dist/2020');
const addFormats=require('ajv-formats').default ?? require('ajv-formats');

export type ContentIssueCode=
  | 'UNKNOWN_PROPERTY'
  | 'WRONG_TYPE'
  | 'WRONG_ENUM'
  | 'MISSING_REQUIRED'
  | 'INVALID_ID_FORMAT'
  | 'INVALID_FORMAT'
  | 'INVALID_VALUE'
  | 'INVALID_REFERENCE'
  | 'DUPLICATE_ID'
  | 'ROOT_SHAPE';

export interface ContentIssue { code:ContentIssueCode; file:string; path:string; message:string }

export const CANONICAL_COLLECTIONS=[
  {file:'concepts.json',schema:'concept.schema.json',kind:'array'},
  {file:'learning-units.json',schema:'learning-unit.schema.json',kind:'array'},
  {file:'theory-activities.json',schema:'theory-activity.schema.json',kind:'array'},
  {file:'practice-activities.json',schema:'practice-activity.schema.json',kind:'array'},
  {file:'mapping-links.json',schema:'mapping-link.schema.json',kind:'array'},
  {file:'external-lab-bindings.json',schema:'external-lab-binding.schema.json',kind:'array'},
  {file:'assessment-items.json',schema:'assessment-bank.schema.json',kind:'object'},
] as const;

export function createContentAjv(schemaDir:string){
  const ajv=new Ajv2020({allErrors:true,strict:true,strictTypes:false,strictRequired:false});
  addFormats(ajv);
  for(const name of fs.readdirSync(schemaDir).filter(f=>f.endsWith('.schema.json')).sort()){
    ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemaDir,name),'utf8')),name);
  }
  return ajv;
}

function classify(error:any):ContentIssueCode{
  switch(error.keyword){
    case 'additionalProperties': return 'UNKNOWN_PROPERTY';
    case 'type': return 'WRONG_TYPE';
    case 'enum': case 'const': return 'WRONG_ENUM';
    case 'required': return 'MISSING_REQUIRED';
    case 'pattern': return /(^|\/)(id|.*Id|.*Ids\/\d+|legacyIds\/\d+)$/.test(error.instancePath)?'INVALID_ID_FORMAT':'INVALID_VALUE';
    case 'format': return 'INVALID_FORMAT';
    default: return 'INVALID_VALUE';
  }
}

export function schemaIssues(ajv:any,schemaName:string,value:unknown,file:string,basePath:string):ContentIssue[]{
  const validate=ajv.getSchema(schemaName);
  if(!validate) throw new Error(`SCHEMA_NOT_FOUND:${schemaName}`);
  if(validate(value)) return [];
  // Collapse oneOf/anyOf/if noise to the most specific messages.
  const errors=(validate.errors??[]).filter((e:any)=>!['oneOf','anyOf','if','allOf','not'].includes(e.keyword)||validate.errors.length===1);
  return errors.map((e:any)=>{
    const extra=e.keyword==='additionalProperties'?`/${e.params.additionalProperty}`:e.keyword==='required'?`/${e.params.missingProperty}`:'';
    return {code:classify(e),file,path:`${basePath}${e.instancePath}${extra}`,message:`${e.keyword}: ${e.message}`};
  });
}

export interface CanonicalContent {
  concepts:any[]; learningUnits:any[]; theoryActivities:any[]; practiceActivities:any[]; mappingLinks:any[]; externalLabBindings:any[]; assessmentBank:any;
}

export function readCanonicalContent(dir:string):CanonicalContent{
  const read=(f:string)=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
  return {
    concepts:read('concepts.json'),learningUnits:read('learning-units.json'),theoryActivities:read('theory-activities.json'),
    practiceActivities:read('practice-activities.json'),mappingLinks:read('mapping-links.json'),externalLabBindings:read('external-lab-bindings.json'),
    assessmentBank:read('assessment-items.json'),
  };
}

function duplicates(file:string,rows:any[]):ContentIssue[]{
  const seen=new Map<string,number>(); const out:ContentIssue[]=[];
  rows.forEach((row,i)=>{const id=row?.id;if(typeof id!=='string')return;if(seen.has(id))out.push({code:'DUPLICATE_ID',file,path:`$[${i}]/id`,message:`duplicate id ${id} (first at [${seen.get(id)}])`});else seen.set(id,i);});
  return out;
}

export function referenceIssues(c:CanonicalContent):ContentIssue[]{
  const out:ContentIssue[]=[];
  const concepts=new Set(c.concepts.map(x=>x?.id)); const units=new Set(c.learningUnits.map(x=>x?.id));
  const theories=new Set(c.theoryActivities.map(x=>x?.id)); const practices=new Set(c.practiceActivities.map(x=>x?.id));
  const ref=(ok:boolean,file:string,p:string,what:string)=>{if(!ok)out.push({code:'INVALID_REFERENCE',file,path:p,message:`unknown ${what}`});};
  c.concepts.forEach((x,i)=>{for(const [k,ids] of [['prerequisiteIds',x?.prerequisiteIds],['relatedConceptIds',x?.relatedConceptIds]] as const)(ids??[]).forEach((id:string,j:number)=>ref(concepts.has(id),'concepts.json',`$[${i}]/${k}/${j}`,`concept ${id}`));});
  c.learningUnits.forEach((x,i)=>{for(const k of ['conceptIds','prerequisiteConceptIds'])(x?.[k]??[]).forEach((id:string,j:number)=>ref(concepts.has(id),'learning-units.json',`$[${i}]/${k}/${j}`,`concept ${id}`));});
  c.theoryActivities.forEach((x,i)=>(x?.conceptIds??[]).forEach((id:string,j:number)=>ref(concepts.has(id),'theory-activities.json',`$[${i}]/conceptIds/${j}`,`concept ${id}`)));
  c.practiceActivities.forEach((x,i)=>{for(const k of ['conceptIds','prerequisiteConceptIds'])(x?.[k]??[]).forEach((id:string,j:number)=>ref(concepts.has(id),'practice-activities.json',`$[${i}]/${k}/${j}`,`concept ${id}`));});
  c.mappingLinks.forEach((x,i)=>{
    ref(units.has(x?.learningUnitId),'mapping-links.json',`$[${i}]/learningUnitId`,`learning unit ${x?.learningUnitId}`);
    if(x?.theoryActivityId!==undefined) ref(theories.has(x.theoryActivityId),'mapping-links.json',`$[${i}]/theoryActivityId`,`theory activity ${x.theoryActivityId}`);
    ref(practices.has(x?.practiceActivityId),'mapping-links.json',`$[${i}]/practiceActivityId`,`practice activity ${x?.practiceActivityId}`);
    (x?.conceptIds??[]).forEach((id:string,j:number)=>ref(concepts.has(id),'mapping-links.json',`$[${i}]/conceptIds/${j}`,`concept ${id}`));
  });
  c.externalLabBindings.forEach((x,i)=>(x?.learningUnitIds??[]).forEach((id:string,j:number)=>ref(units.has(id),'external-lab-bindings.json',`$[${i}]/learningUnitIds/${j}`,`learning unit ${id}`)));
  (c.assessmentBank?.items??[]).forEach((x:any,i:number)=>{
    ref(units.has(x?.learningUnitId),'assessment-items.json',`$.items[${i}]/learningUnitId`,`learning unit ${x?.learningUnitId}`);
    (x?.conceptIds??[]).forEach((id:string,j:number)=>ref(concepts.has(id),'assessment-items.json',`$.items[${i}]/conceptIds/${j}`,`concept ${id}`));
    const options=new Set((x?.options??[]).map((o:any)=>o?.id));
    ref(options.has(x?.correctOptionId),'assessment-items.json',`$.items[${i}]/correctOptionId`,`option ${x?.correctOptionId}`);
  });
  return out;
}

/** Validates the full canonical data set: schema (additionalProperties:false), duplicates and references. */
export function validateCanonicalContent(contentDir:string,schemaDir:string,override?:Partial<CanonicalContent>){
  const ajv=createContentAjv(schemaDir);
  const content={...readCanonicalContent(contentDir),...override} as CanonicalContent;
  const byFile:Record<string,unknown>={
    'concepts.json':content.concepts,'learning-units.json':content.learningUnits,'theory-activities.json':content.theoryActivities,
    'practice-activities.json':content.practiceActivities,'mapping-links.json':content.mappingLinks,'external-lab-bindings.json':content.externalLabBindings,
    'assessment-items.json':content.assessmentBank,
  };
  const issues:ContentIssue[]=[];
  let records=0;
  for(const entry of CANONICAL_COLLECTIONS){
    const value=byFile[entry.file];
    if(entry.kind==='array'){
      if(!Array.isArray(value)){issues.push({code:'ROOT_SHAPE',file:entry.file,path:'$',message:'root must be an array'});continue;}
      value.forEach((row,i)=>{records++;issues.push(...schemaIssues(ajv,entry.schema,row,entry.file,`$[${i}]`));});
      issues.push(...duplicates(entry.file,value));
    }else{
      records++;
      issues.push(...schemaIssues(ajv,entry.schema,value,entry.file,'$'));
      if(Array.isArray((value as any)?.items)) issues.push(...duplicates(entry.file,(value as any).items));
    }
  }
  // IDs must be unique across entity kinds as well.
  const global=new Map<string,string>();
  for(const [file,rows] of Object.entries(byFile)){
    const list=Array.isArray(rows)?rows:(rows as any)?.items??[];
    for(const row of list){const id=row?.id;if(typeof id!=='string')continue;const prev=global.get(id);if(prev&&prev!==file)issues.push({code:'DUPLICATE_ID',file,path:'$',message:`id ${id} also used in ${prev}`});else global.set(id,file);}
  }
  issues.push(...referenceIssues(content));
  return {records,issues};
}
