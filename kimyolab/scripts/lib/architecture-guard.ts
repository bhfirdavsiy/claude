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

/** Presentation layers (render/UI models/bootstrap) — they may see AssessmentPrompt, never AssessmentKey (P1.1 C3). */
const PRESENTATION=[/^src\/features\//,/^src\/app\/bootstrap\.ts$/];
/** Answer-key layer and evaluator: owned by the domain + orchestrator + content source only. */
export const ASSESSMENT_KEY_NAMES=new Set(['AssessmentKey','AssessmentKeyPack','validateKeyPack','ASSESSMENT_KEY_PACK_PATH','evaluateAssessment','evaluationToEvidenceDrafts','correctOptionId']);

export interface GuardViolation {file:string;line:number;rule:string;detail:string}

const MASTERY_FUNCTION='computeConceptMastery';
const isForbiddenTarget=(target:string)=>FORBIDDEN_IMPORT_TARGETS.some(r=>r.test(target));

/**
 * Bypass-resistant by construction (P1.0 closeout §10): the guard resolves what a local name REALLY
 * refers to (aliased and namespace imports), flags re-exports that would launder a boundary module, and
 * treats every way of reaching a mutation method — call, property read, element access with a literal,
 * destructuring — as the same access. It is a lint, not a sandbox: computed dynamic keys are out of scope.
 */
export function checkSource(rel:string,source:string):GuardViolation[]{
  const out:GuardViolation[]=[];
  const sf=ts.createSourceFile(rel,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const line=(node:any)=>sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1;
  const privileged=AUTHORITY.test(rel)||PERSISTENCE.test(rel)||EVIDENCE_MODEL.test(rel);
  const noPersistenceImports=NO_PERSISTENCE_IMPORTS.some(r=>r.test(rel));
  const presentation=PRESENTATION.some(r=>r.test(rel));
  const flagKey=(node:any,name:string)=>{ if(presentation&&ASSESSMENT_KEY_NAMES.has(name)) out.push({file:rel,line:line(node),rule:'ASSESSMENT_KEY_IN_PRESENTATION',detail:name}); };
  /** local identifier → original exported name (for aliased imports). */
  const aliases=new Map<string,string>();
  const resolve=(p:string)=>path.posix.normalize(path.posix.join(path.posix.dirname(rel),p));
  const flagMutation=(node:any,name:string)=>{ if(!privileged&&MUTATION_METHODS.has(name)) out.push({file:rel,line:line(node),rule:'STATE_MUTATION_OUTSIDE_BOUNDARY',detail:name}); };
  const flagBoundary=(node:any,name:string)=>{ if(!privileged&&BOUNDARY_FUNCTIONS.has(name)) out.push({file:rel,line:line(node),rule:'PROGRESS_TRANSITION_OUTSIDE_ORCHESTRATOR',detail:name}); };

  const visit=(node:any)=>{
    // ---- imports: aliases, namespace imports, forbidden layers
    if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)){
      const target=resolve(node.moduleSpecifier.text);
      const typeOnly=Boolean(node.importClause?.isTypeOnly);
      const bindings=node.importClause?.namedBindings;
      if(noPersistenceImports&&!typeOnly&&isForbiddenTarget(target)){
        const allTypes=bindings&&ts.isNamedImports(bindings)&&!node.importClause?.name&&bindings.elements.every((e:any)=>e.isTypeOnly);
        if(!allTypes) out.push({file:rel,line:line(node),rule:'LAYER_IMPORTS_PERSISTENCE',detail:target});
      }
      if(bindings&&ts.isNamedImports(bindings)){
        for(const e of bindings.elements){
          const original=(e.propertyName??e.name).text;
          aliases.set(e.name.text,original);
          flagKey(e,original);
          if(!typeOnly&&!e.isTypeOnly) flagBoundary(e,original);
        }
      }
      if(bindings&&ts.isNamespaceImport(bindings)&&!typeOnly&&!privileged&&/runtime\/progress\/reducer\.ts$/.test(target))
        out.push({file:rel,line:line(node),rule:'PROGRESS_TRANSITION_OUTSIDE_ORCHESTRATOR',detail:`* as ${bindings.name.text}`});
    }
    // ---- re-exports: a non-privileged module must not launder persistence/transition modules
    if(ts.isExportDeclaration(node)&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)&&!privileged&&!node.isTypeOnly){
      const target=resolve(node.moduleSpecifier.text);
      const clause=node.exportClause;
      const names:string[]=clause&&ts.isNamedExports(clause)?clause.elements.filter((e:any)=>!e.isTypeOnly).map((e:any)=>(e.propertyName??e.name).text):['*'];
      if(isForbiddenTarget(target)&&names.length) out.push({file:rel,line:line(node),rule:'REEXPORT_OF_BOUNDARY_MODULE',detail:`${names.join(',')} from ${target}`});
      else for(const n of names) if(BOUNDARY_FUNCTIONS.has(n)||MUTATION_METHODS.has(n)) out.push({file:rel,line:line(node),rule:'REEXPORT_OF_BOUNDARY_MODULE',detail:n});
    }
    // ---- property access of a mutation method (call, read, bind — all the same)
    if(ts.isPropertyAccessExpression(node)){ flagMutation(node.name,node.name.text); flagKey(node.name,node.name.text); }
    // P1.1 (D8): the legacy second routing key must not come back anywhere in the runtime.
    if((ts.isPropertyAccessExpression(node)||ts.isPropertySignature(node)||ts.isPropertyAssignment(node)||ts.isShorthandPropertyAssignment(node)||ts.isBindingElement(node))&&node.name&&ts.isIdentifier(node.name)&&node.name.text==='configFamily')
      out.push({file:rel,line:line(node),rule:'LEGACY_ROUTING_KEY',detail:'configFamily'});
    if(presentation&&(ts.isPropertySignature(node)||ts.isPropertyAssignment(node))&&node.name&&ts.isIdentifier(node.name)) flagKey(node.name,node.name.text);
    if(presentation&&ts.isStringLiteral(node)&&/assessment\/keys\.json$/.test(node.text)) flagKey(node,'ASSESSMENT_KEY_PACK_PATH');
    if(ts.isElementAccessExpression(node)&&node.argumentExpression&&(ts.isStringLiteral(node.argumentExpression)||ts.isNoSubstitutionTemplateLiteral(node.argumentExpression)))
      flagMutation(node,node.argumentExpression.text);
    // ---- destructuring: const {updateProgress}=store / const {updateProgress:u}=store
    if(ts.isObjectBindingPattern(node)) for(const el of node.elements){
      const key=el.propertyName&&ts.isIdentifier(el.propertyName)?el.propertyName.text:ts.isIdentifier(el.name)?el.name.text:undefined;
      if(key) flagMutation(el,key);
    }
    // ---- calls: resolve aliases before checking boundary / mastery functions
    if(ts.isCallExpression(node)){
      const callee=node.expression;
      const local=ts.isPropertyAccessExpression(callee)?callee.name.text:ts.isIdentifier(callee)?callee.text:undefined;
      const name=local&&ts.isIdentifier(callee)?aliases.get(local)??local:local;
      if(name&&ts.isIdentifier(callee)) flagBoundary(node,name);
      if(name&&ts.isPropertyAccessExpression(callee)&&BOUNDARY_FUNCTIONS.has(name)) flagBoundary(node,name);
      if(name===MASTERY_FUNCTION){
        const arg=node.arguments[0];
        const hasContext=arg&&ts.isObjectLiteralExpression(arg)&&arg.properties.some((p:any)=>(ts.isPropertyAssignment(p)||ts.isShorthandPropertyAssignment(p))&&p.name?.text==='context');
        if(!hasContext) out.push({file:rel,line:line(node),rule:'MASTERY_WITHOUT_CONTEXT',detail:'computeConceptMastery needs an explicit context'});
      }
    }
    ts.forEachChild(node,visit);
  };
  visit(sf);
  // de-duplicate (an import binding and its call may both be reported for the same line)
  const seen=new Set<string>();
  return out.filter(v=>{const k=`${v.rule}|${v.line}|${v.detail}`;if(seen.has(k))return false;seen.add(k);return true;});
}

export function checkTree(root:string):GuardViolation[]{
  const out:GuardViolation[]=[];
  const walk=(dir:string)=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,e.name);if(e.isDirectory())walk(full);else if(e.name.endsWith('.ts')){const rel=path.relative(root,full).split(path.sep).join('/');out.push(...checkSource(rel,fs.readFileSync(full,'utf8')));}}};
  walk(path.join(root,'src'));
  return out;
}
