import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFormula } from '../src/domain/chemistry/formula-parser.ts';
import { balanceSpecies } from '../src/domain/chemistry/equation-balancer.ts';
import { SpeciesRegistry } from '../src/domain/chemistry/species-registry.ts';
import { ReactionMatcher } from '../src/domain/chemistry/reaction-matcher.ts';
import {evaluateExternalApproval} from './approval-evidence.ts';
import {buildStableSignoffTargets} from './stable-signoff-targets.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const chem=path.join(root,'content-src/chemistry');
const species=JSON.parse(fs.readFileSync(path.join(chem,'species.json'),'utf8'));
const reactions=JSON.parse(fs.readFileSync(path.join(chem,'reactions.json'),'utf8'));
const solution=JSON.parse(fs.readFileSync(path.join(chem,'solubility.json'),'utf8'));
const schoolModelsPath=path.join(chem,'school-lab-models.json');
const schoolModels=fs.existsSync(schoolModelsPath)?JSON.parse(fs.readFileSync(schoolModelsPath,'utf8')):{sourceRefs:[],models:[]};
let formulaErrors=0,reactionBalanceErrors=0,referenceErrors=0,sourceErrors=0;
let schoolModelErrors=0;
let registry;
try{registry=SpeciesRegistry.from(species)}catch{referenceErrors++}
for(const s of species){
  try{if(/^[A-Z^]/.test(s.formula))parseFormula(s.formula)}catch{formulaErrors++}
  if(!s.sourceRefs?.length)sourceErrors++;
}
const formulas=new Set(species.map((s:any)=>s.formula));
for(const r of reactions){
  if(!r.sourceRefs?.length)sourceErrors++;
  for(const x of [...r.reactants,...r.products]) if(!formulas.has(x.formula)) referenceErrors++;
  try{balanceSpecies(r.reactants.map((x:any)=>x.formula),r.products.map((x:any)=>x.formula))}catch{reactionBalanceErrors++}
}
for(const d of solution.dissociation||[]){
  if(!formulas.has(d.formula))referenceErrors++;
  for(const ion of d.ions||[])if(!formulas.has(ion.formula))referenceErrors++;
}
try{ReactionMatcher.from(reactions)}catch{referenceErrors++}
const schoolSourceIds=new Set((schoolModels.sourceRefs??[]).map((x:any)=>x.id));
const schoolModelIds=new Set<string>();
for(const m of schoolModels.models??[]){
  if(!m?.id||schoolModelIds.has(m.id)||!m?.modelType||!Array.isArray(m.observations)||!m.observations.length||!Array.isArray(m.sourceRefs)||!m.sourceRefs.length||!['pending','approved'].includes(m.reviewStatus)) schoolModelErrors++;
  schoolModelIds.add(m?.id);
  for(const ref of m?.sourceRefs??[]) if(!schoolSourceIds.has(ref)) sourceErrors++;
}

const target=buildStableSignoffTargets(root).targets['CHEM-033'];
let approvalRecord:any=undefined;
try{approvalRecord=JSON.parse(fs.readFileSync(path.join(root,'reports/chemistry-expert-approval.json'),'utf8'));}catch{}
const effectiveApproval=evaluateExternalApproval(approvalRecord,{version:target.version,hash:target.hash,reviewerRole:target.reviewerRole});
const report={
  speciesRecords:species.length,
  reactionRecords:reactions.length,
  dissociationRules:(solution.dissociation||[]).length,
  formulaErrors,
  reactionBalanceErrors,
  referenceErrors,
  sourceErrors,
  schoolLabModelRecords:(schoolModels.models??[]).length,
  schoolLabModelErrors:schoolModelErrors,
  unknownReactionPolicy:'REACTION_NOT_MODELED',
  expertApproval:effectiveApproval.status,
  expertApprovalValid:effectiveApproval.valid,
  expertApprovalReason:effectiveApproval.reason,
  expertReviewVersion:target.version,
  expertReviewHash:target.hash,
  expertReviewSurfaceSchema:target.reviewSurfaceSchema,
  expertReviewSurfaceFileCount:target.reviewSurfaceFileCount,
};
fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports/chemistry-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(formulaErrors||reactionBalanceErrors||referenceErrors||sourceErrors||schoolModelErrors)process.exitCode=1;
