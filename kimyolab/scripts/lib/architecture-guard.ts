// Architecture guard (P1.0 §31). Parses sources with the TypeScript compiler API (imports, call
// expressions, object literals) instead of regexes, and enforces the canonical-runtime boundaries.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const ts=require('typescript');

/** Store operations that change learner state. Only the persistence boundary may call them. */
export const MUTATION_METHODS=new Set(['saveProgress','updateProgress','recordAttempt','appendAttemptEvidence','saveEvidence','finishAttempt','saveMastery','saveAssessment','resetStore','isolate']);
/** Functions that bind evidence to attempts or create progress transitions. */
export const BOUNDARY_FUNCTIONS=new Set(['bindEvidenceToAttempt','bindDraftsToAttempt','reduceProgress','createProgress']);

const AUTHORITY=/^src\/runtime\/learning-orchestrator\//;
const PERSISTENCE=/^src\/runtime\/progress\//;
/** The evidence model module defines the bind functions (composition inside it is not a boundary crossing). */
const EVIDENCE_MODEL=/^src\/runtime\/evidence\/types\.ts$/;
/** Presentation/engine layers must not even import persistence or transition modules. */
const NO_PERSISTENCE_IMPORTS=[/^src\/features\/[^/]+\/render\.ts$/,/^src\/features\/labs\/external-render\.ts$/,/^src\/app\/bootstrap\.ts$/,/^src\/runtime\/practice-router\//,/^src\/engines\//,/^src\/runtime\/reference-slices\//,/^src\/runtime\/beta[123]\//,/^src\/features\/practice\/session\.ts$/];
// Engines legitimately import evidence *draft* types from runtime/evidence; persistence and transitions are off limits.
const FORBIDDEN_IMPORT_TARGETS=[/runtime\/progress\/indexeddb-store\.ts$/,/runtime\/progress\/reducer\.ts$/,/runtime\/progress\/migrations\.ts$/];

export interface GuardViolation {file:string;line:number;rule:string;detail:string}

export function checkSource(rel:string,source:string):GuardViolation[]{
  const out:GuardViolation[]=[];
  const sf=ts.createSourceFile(rel,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const line=(node:any)=>sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1;
  const privileged=AUTHORITY.test(rel)||PERSISTENCE.test(rel)||EVIDENCE_MODEL.test(rel);
  const noPersistenceImports=NO_PERSISTENCE_IMPORTS.some(r=>r.test(rel));
  const visit=(node:any)=>{
    if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)){
      const target=path.posix.normalize(path.posix.join(path.posix.dirname(rel),node.moduleSpecifier.text));
      const typeOnly=node.importClause?.isTypeOnly;
      if(noPersistenceImports&&!typeOnly&&FORBIDDEN_IMPORT_TARGETS.some(r=>r.test(target))) out.push({file:rel,line:line(node),rule:'LAYER_IMPORTS_PERSISTENCE',detail:target});
      if(!privileged&&!typeOnly&&/runtime\/progress\/reducer\.ts$/.test(target)){
        const names=(node.importClause?.namedBindings?.elements??[]).filter((e:any)=>!e.isTypeOnly).map((e:any)=>(e.propertyName??e.name).text);
        if(names.some((n:string)=>BOUNDARY_FUNCTIONS.has(n))) out.push({file:rel,line:line(node),rule:'PROGRESS_TRANSITION_OUTSIDE_ORCHESTRATOR',detail:names.join(',')});
      }
    }
    if(ts.isCallExpression(node)){
      const callee=node.expression;
      const name=ts.isPropertyAccessExpression(callee)?callee.name.text:ts.isIdentifier(callee)?callee.text:undefined;
      if(name&&!privileged){
        if(ts.isPropertyAccessExpression(callee)&&MUTATION_METHODS.has(name)) out.push({file:rel,line:line(node),rule:'STATE_MUTATION_OUTSIDE_BOUNDARY',detail:name});
        if(BOUNDARY_FUNCTIONS.has(name)) out.push({file:rel,line:line(node),rule:'PROGRESS_TRANSITION_OUTSIDE_ORCHESTRATOR',detail:name});
      }
      if(name==='computeConceptMastery'){
        const arg=node.arguments[0];
        const hasContext=arg&&ts.isObjectLiteralExpression(arg)&&arg.properties.some((p:any)=>(ts.isPropertyAssignment(p)||ts.isShorthandPropertyAssignment(p))&&p.name?.text==='context');
        if(!hasContext) out.push({file:rel,line:line(node),rule:'MASTERY_WITHOUT_CONTEXT',detail:'computeConceptMastery needs an explicit context'});
      }
    }
    ts.forEachChild(node,visit);
  };
  visit(sf);
  return out;
}

export function checkTree(root:string):GuardViolation[]{
  const out:GuardViolation[]=[];
  const walk=(dir:string)=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,e.name);if(e.isDirectory())walk(full);else if(e.name.endsWith('.ts')){const rel=path.relative(root,full).split(path.sep).join('/');out.push(...checkSource(rel,fs.readFileSync(full,'utf8')));}}};
  walk(path.join(root,'src'));
  return out;
}
