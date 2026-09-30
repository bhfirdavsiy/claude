// Architecture guard (P1.0 §31). Parses sources with the TypeScript compiler API (imports, call
// expressions, object literals) instead of regexes, and enforces the canonical-runtime boundaries.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
import {ELEMENT_SYMBOL_SET} from '../../src/domain/chemistry/periodic-table.ts';
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
const PRESENTATION=[/^src\/features\//,/^src\/app\/bootstrap\.ts$/,/^src\/renderers\//];
/** P1.4 renderer package: draws RendererModels and emits intents — no persistence, mastery, readiness or chemistry. */
const RENDERER=/^src\/renderers\//;
const RENDERER_FORBIDDEN_IMPORTS:Array<[RegExp,string]>=[
  [/^src\/runtime\/(progress|learning-orchestrator|evidence)\/|^src\/features\/progress\//,'RENDERER_IMPORTS_PERSISTENCE'],
  [/^src\/domain\/mastery\//,'RENDERER_IMPORTS_MASTERY'],
  [/^src\/domain\/(readiness|assessment|pilot)\/|^src\/runtime\/governance\//,'RENDERER_DERIVES_READINESS'],
  [/^src\/domain\/chemistry\/|^src\/engines\/|^src\/runtime\/(reference-slices|beta1|beta2|beta3)\//,'CHEMISTRY_DOMAIN_IMPORTED_IN_RENDERER'],
];
/** P1.5: renderers draw RendererModels only — never the content pack, raw chemistry KB or activity configs. */
const CONTENT_DATA=/\.json$|^content-src\/|^public\/content\/|activity-configs|^src\/app\/content-client\.ts$/;
const CONTENT_DATA_TEXT=/\.json\b|activity-configs|content-src\/|chemistry\/[a-z-]+\.json|\/content\//;
const PARTICLE_FIELDS=new Set(['protons','neutrons','electrons']);
const DERIVED_ATOM_FIELDS=new Set(['atomicNumber','massNumber','charge']);
/** Answer-key layer and evaluator: owned by the domain + orchestrator + content source only. */
export const ASSESSMENT_KEY_NAMES=new Set(['AssessmentKey','AssessmentKeyPack','validateKeyPack','ASSESSMENT_KEY_PACK_PATH','evaluateAssessment','evaluationToEvidenceDrafts','correctOptionId']);

/** Mastery is derived by the orchestrator; presentation receives a MasteryViewModel only (P1.2 §26). */
const MASTERY_DERIVATION=new Set(['computeConceptMastery','buildMasteryView','rescoreEvidence']);

/** Readiness / approval derivation belongs to the build (compileReadiness) and the domain — presentation only reads the pack (P1.3 §43). */
const READINESS_DERIVATION=new Set(['deriveActivityReadiness','compileReadiness','reviewStateOf','reviewPendingOf','effectiveApprovalState','deriveItemLifecycle','derivePilotStatus']);
/** Human decision registers. Only the review importer may write the assessment register; nothing writes sign-offs. */
const HUMAN_REGISTERS=/(assessment-reviews|pilot-signoffs|chemistry-reviews)\.json/;
const REGISTER_WRITERS=new Set(['scripts/assessment-review/lib.ts','scripts/chemistry-review/import.ts']);
const REGISTER_IDENTIFIERS=new Set(['REGISTER_FILE','SIGNOFF_FILE','REVIEW_REGISTER_FILE']);
const FS_WRITES=new Set(['writeFileSync','writeFile','appendFileSync','appendFile','renameSync','rename','copyFileSync','copyFile','createWriteStream']);
/** Rules that also apply to build scripts (the rest guard the runtime in src/). */
export const SCRIPT_RULES=new Set(['HUMAN_APPROVAL_WRITTEN_BY_TOOLING','BANK_LEVEL_APPROVAL']);

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
    // ---- P1.5: a renderer never loads content itself (fetch, dynamic import, or a content/config path literal)
    if(RENDERER.test(rel)){
      if(ts.isCallExpression(node)&&((ts.isIdentifier(node.expression)&&['fetch','require'].includes(node.expression.text))||node.expression.kind===ts.SyntaxKind.ImportKeyword))
        out.push({file:rel,line:line(node),rule:'RENDERER_IMPORTS_CONTENT_DATA',detail:node.expression.getText?.()??'call'});
      if((ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))&&!ts.isImportDeclaration(node.parent)&&CONTENT_DATA_TEXT.test(node.text))
        out.push({file:rel,line:line(node),rule:'RENDERER_IMPORTS_CONTENT_DATA',detail:node.text});
      if(ts.isTemplateExpression(node)){
        const text=[node.head.text,...node.templateSpans.map((x:any)=>x.literal.text)].join('${}');
        if(CONTENT_DATA_TEXT.test(text)) out.push({file:rel,line:line(node),rule:'RENDERER_IMPORTS_CONTENT_DATA',detail:text});
      }
    }
    // ---- imports: aliases, namespace imports, forbidden layers
    if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)){
      const target=resolve(node.moduleSpecifier.text);
      const typeOnly=Boolean(node.importClause?.isTypeOnly);
      const bindings=node.importClause?.namedBindings;
      if(RENDERER.test(rel)&&CONTENT_DATA.test(target)) out.push({file:rel,line:line(node),rule:'RENDERER_IMPORTS_CONTENT_DATA',detail:target});
      if(RENDERER.test(rel)&&!typeOnly){
        const valueBindings=!bindings||!ts.isNamedImports(bindings)||Boolean(node.importClause?.name)||bindings.elements.some((e:any)=>!e.isTypeOnly);
        const hit=RENDERER_FORBIDDEN_IMPORTS.find(([re])=>re.test(target));
        if(hit&&valueBindings) out.push({file:rel,line:line(node),rule:hit[1],detail:target});
      }
      if(noPersistenceImports&&!typeOnly&&isForbiddenTarget(target)){
        const allTypes=bindings&&ts.isNamedImports(bindings)&&!node.importClause?.name&&bindings.elements.every((e:any)=>e.isTypeOnly);
        if(!allTypes) out.push({file:rel,line:line(node),rule:'LAYER_IMPORTS_PERSISTENCE',detail:target});
      }
      if(bindings&&ts.isNamedImports(bindings)){
        for(const e of bindings.elements){
          const original=(e.propertyName??e.name).text;
          aliases.set(e.name.text,original);
          flagKey(e,original);
          if(presentation&&!e.isTypeOnly&&!typeOnly&&MASTERY_DERIVATION.has(original)) out.push({file:rel,line:line(e),rule:'MASTERY_COMPUTED_IN_PRESENTATION',detail:original});
          if(presentation&&!e.isTypeOnly&&!typeOnly&&READINESS_DERIVATION.has(original)) out.push({file:rel,line:line(e),rule:'READINESS_DERIVED_IN_PRESENTATION',detail:original});
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
    // ---- P1.3: approvals are human decisions — tooling never writes them, the bank never claims them
    if(ts.isStringLiteral(node)&&HUMAN_REGISTERS.test(node.text)&&rel.startsWith('src/')) out.push({file:rel,line:line(node),rule:'HUMAN_APPROVAL_WRITTEN_BY_TOOLING',detail:`runtime code references ${node.text}`});
    if(ts.isCallExpression(node)&&!REGISTER_WRITERS.has(rel)){
      const callee=node.expression;
      const fn=ts.isPropertyAccessExpression(callee)?callee.name.text:ts.isIdentifier(callee)?callee.text:undefined;
      if(fn&&FS_WRITES.has(fn)){
        let target:string|undefined;
        const scan=(n:any)=>{ if(target) return; if((ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))&&HUMAN_REGISTERS.test(n.text)) target=n.text; else if(ts.isIdentifier(n)&&REGISTER_IDENTIFIERS.has(n.text)) target=n.text; else if(ts.isTemplateExpression(n)&&HUMAN_REGISTERS.test(n.getText(sf))) target=n.getText(sf); else ts.forEachChild(n,scan); };
        node.arguments.forEach(scan);
        if(target) out.push({file:rel,line:line(node),rule:'HUMAN_APPROVAL_WRITTEN_BY_TOOLING',detail:`${fn}(${target})`});
      }
    }
    const isApprovedLiteral=(n:any)=>n&&(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))&&n.text==='APPROVED';
    if(ts.isPropertyAssignment(node)&&ts.isIdentifier(node.name)&&node.name.text==='lifecycle'&&isApprovedLiteral(node.initializer)) out.push({file:rel,line:line(node),rule:'BANK_LEVEL_APPROVAL',detail:"lifecycle:'APPROVED' is derived from human review records, never authored"});
    if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(node.left)&&node.left.name.text==='lifecycle'&&isApprovedLiteral(node.right)) out.push({file:rel,line:line(node),rule:'BANK_LEVEL_APPROVAL',detail:"assigning lifecycle='APPROVED'"});
    // ---- P1.3 (future RendererRegistry contract): presentation never selects behaviour by a concrete activity id
    if(presentation){
      const idLike=(n:any)=>n&&((ts.isPropertyAccessExpression(n)&&['id','activityId','practiceActivityId'].includes(n.name.text))||(ts.isIdentifier(n)&&['activityId','practiceActivityId'].includes(n.text)));
      const activityLiteral=(n:any)=>n&&(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))&&/^practice\./.test(n.text);
      if(ts.isSwitchStatement(node)&&idLike(node.expression)&&node.caseBlock.clauses.some((c:any)=>ts.isCaseClause(c)&&activityLiteral(c.expression))) out.push({file:rel,line:line(node),rule:'RENDERER_SELECTED_BY_ACTIVITY_ID',detail:'switch over a concrete activity id'});
      if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken,ts.SyntaxKind.EqualsEqualsToken].includes(node.operatorToken.kind)&&((idLike(node.left)&&activityLiteral(node.right))||(idLike(node.right)&&activityLiteral(node.left)))) out.push({file:rel,line:line(node),rule:'RENDERER_SELECTED_BY_ACTIVITY_ID',detail:'comparison with a concrete activity id'});
    }
    // ---- P1.4: renderers display chemistry, they never compute it (Z, A, charge) or carry an element table
    if(RENDERER.test(rel)){
      const particleRef=(n:any)=>n&&((ts.isPropertyAccessExpression(n)&&PARTICLE_FIELDS.has(n.name.text))||(ts.isIdentifier(n)&&PARTICLE_FIELDS.has(n.text))||(ts.isElementAccessExpression(n)&&n.argumentExpression&&ts.isStringLiteral(n.argumentExpression)&&PARTICLE_FIELDS.has(n.argumentExpression.text)));
      if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.PlusToken,ts.SyntaxKind.MinusToken].includes(node.operatorToken.kind)&&(particleRef(node.left)||particleRef(node.right)))
        out.push({file:rel,line:line(node),rule:'CHEMISTRY_COMPUTED_IN_RENDERER',detail:node.getText(sf).slice(0,60)});
      const derivedName=(n:any)=>n&&ts.isIdentifier(n)&&DERIVED_ATOM_FIELDS.has(n.text)?n.text:undefined;
      const passthrough=(init:any,name:string)=>init&&ts.isPropertyAccessExpression(init)&&init.name.text===name;
      if(ts.isPropertyAssignment(node)){const name=derivedName(node.name);if(name&&!passthrough(node.initializer,name)) out.push({file:rel,line:line(node),rule:'CHEMISTRY_COMPUTED_IN_RENDERER',detail:`${name} must come from the domain model`});}
      if(ts.isVariableDeclaration(node)&&derivedName(node.name)&&node.initializer&&!passthrough(node.initializer,node.name.text)) out.push({file:rel,line:line(node),rule:'CHEMISTRY_COMPUTED_IN_RENDERER',detail:`${node.name.text} must come from the domain model`});
      if((ts.isArrayLiteralExpression(node)||ts.isObjectLiteralExpression(node))){
        const values=ts.isArrayLiteralExpression(node)?node.elements:node.properties.map((p:any)=>p.initializer).filter(Boolean);
        const symbols=values.filter((v:any)=>ts.isStringLiteral(v)&&ELEMENT_SYMBOL_SET.has(v.text)&&v.text.length<=2&&/^[A-Z]/.test(v.text));
        if(symbols.length>=3) out.push({file:rel,line:line(node),rule:'CHEMISTRY_COMPUTED_IN_RENDERER',detail:'element table in a renderer (the domain periodic table is the only source)'});
      }
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
  // build scripts: only the approval rules apply (they legitimately use persistence/derivation helpers)
  const scripts:GuardViolation[]=[];
  const walkScripts=(dir:string)=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,e.name);if(e.isDirectory())walkScripts(full);else if(e.name.endsWith('.ts')){const rel=path.relative(root,full).split(path.sep).join('/');scripts.push(...checkSource(rel,fs.readFileSync(full,'utf8')).filter(v=>SCRIPT_RULES.has(v.rule)));}}};
  if(fs.existsSync(path.join(root,'scripts'))) walkScripts(path.join(root,'scripts'));
  out.push(...scripts);
  return out;
}
