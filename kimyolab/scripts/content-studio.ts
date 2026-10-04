// P2.12 — Content Studio reports and the candidate check (ADR-P2-013).
//   npm run studio:report            → reports/content-studio-readiness.json, reports/content-studio-lab-roundtrip.json
//   npm run studio:report -- --check → fails when a committed report differs from the generator
//   npm run studio:check -- <file>   → re-verifies a downloaded publish candidate (any environment, writes nothing)
//
// Every status in these reports is one of: implemented · preview only · human review required · not yet supported.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CONTENT_ROLES} from '../src/studio/content-roles.ts';
import {ACTIVE_PDF_NAMES,attachPdf,emptyExcerpt,inspectPdf,validateExcerpt,overallStatus} from '../src/studio/pdf-excerpt.ts';
import {instructionFromLegacy,labRoundTrip,analyzeInstruction} from '../src/studio/lab-instruction.ts';
import {verifyPublishCandidate,type LabCheckContext} from '../src/studio/publish-candidate.ts';
import {compileTopicLabProfiles} from './lib/topic-lab-profiles.ts';
import {createLabRuntime,createLabState,type LabAction} from '../src/domain/lab/lab-runtime.ts';
import {createLabDomain} from '../src/domain/lab/lab-domain.ts';
import type {TopicLabProfile} from '../src/domain/lab/topic-lab-profile.ts';
import {loadRegistry,REACTION_SCRIPTS} from './guided-dynamic-lab.ts';
import {studioData,studioModuleClosure,STUDIO_CSP} from './build-content-studio.ts';
import {syntheticPdf} from './lib/synthetic-pdf.ts';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
export const STUDIO_REPORTS={readiness:'reports/content-studio-readiness.json',roundTrip:'reports/content-studio-lab-roundtrip.json'};

/** words and shapes an author must never see (the author-facing catalog is checked against this) */
export const TECHNICAL_TERMS=/\bJSON\b|schema|learningUnitId|\blu\.\d|practice\.|theory\.|ReactionMatcher|IonicEngine|ElectrolysisModel|SchoolLab|handler|\bfamily\b|sha-?256|\bhash\b|checksum|revision|\bcommit\b|\bbranch\b|\bCI\b|kimyolab\.[a-z-]+\.v\d|\b[A-Z]{3,}_[A-Z_]{3,}\b|\bnull\b|undefined|\{\{/i;

function chemistryRunner(root:string){
  const j=(rel:string)=>readJson(root,`content-src/chemistry/${rel}`);
  const rt=createLabRuntime(createLabDomain({reactions:j('reactions.json'),solutionRules:j('solubility.json'),species:j('species.json'),electrolysis:j('electrolysis.json'),conditionVocabulary:j('condition-vocabulary.json')}));
  return (actions:LabAction[])=>({run:(p:TopicLabProfile)=>{ let s=createLabState(p); const statuses:string[]=[]; for(const a of actions){ const r=rt.applyLabAction(s,a,p); statuses.push(`${r.status}:${r.error?.code??r.unsupported?.detail??r.guidance.code}`); s=r.nextState; } return {statuses,state:s}; }});
}

export function buildRoundTrip(root=ROOT){
  const {profiles}=compileTopicLabProfiles(root);
  const registry=loadRegistry(root);
  const runner=chemistryRunner(root);
  const activities=readJson(root,'content-src/practice-activities.json') as any[];
  const rows=['practice.experiment.7.10','practice.experiment.8.14'].map(id=>{
    const canonical=profiles.find(p=>p.activityId===id)!;
    const a=activities.find(x=>x.id===id);
    // the Studio's own path: start from the canonical instruction (copied, never written back)
    const draft=instructionFromLegacy(a.goal,a.legacyContent);
    const rt=labRoundTrip(canonical,draft,registry,runner(REACTION_SCRIPTS[id]!));
    const ops=analyzeInstruction(draft,registry);
    return {...rt,operations:ops.length,knownGaps:canonical.completionScope.uncovered.map(u=>({instructionStep:u.instructionStep+1,verb:u.verb,reason:u.reason})),recordedGaps:canonical.gaps.map(g=>g.code),canonicalUntouched:JSON.stringify(readJson(root,'content-src/practice-activities.json').find((x:any)=>x.id===id).legacyContent)===JSON.stringify(a.legacyContent)};
  });
  return {
    schema:'kimyolab.content-studio-lab-roundtrip.v1',phase:'P2.12',
    semantics:'An existing canonical lab instruction passed through the Content Studio (instructionFromLegacy → classifyInstructionStep → resolveOperation → previewProfile). Equal on every dimension means the Studio derives the same operations, trial scope, capability resolution, completion scope and gaps, and the same lab actions give the same chemistry. The canonical activity is copied, never written.',
    summary:{activities:rows.length,equal:rows.filter(r=>r.equal).length},
    rows,
  };
}

/** The repository context a lab candidate is re-analysed with: the same registry and the same canonical profile the
 *  Studio build copies (studio-data labSources → compiled topic lab profiles). */
export function labCheckContext(root=ROOT):LabCheckContext{
  const {profiles}=compileTopicLabProfiles(root);
  const sources=studioData(root).labSources;
  return {registry:loadRegistry(root),profileFor:lu=>{ const src=sources.find(x=>x.learningUnitId===lu); return src?profiles.find(p=>p.activityId===src.practiceActivityId)??null:null; }};
}

/** `npm run studio:check -- <file>` — writes nothing */
export function checkCandidateFile(file:string,root=ROOT){
  const raw=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
  return verifyPublishCandidate(raw,raw?.draft?.payload?.kind==='LAB_INSTRUCTION'?labCheckContext(root):undefined);
}

/** The PDF acceptance contract, demonstrated on synthetic fixtures only (structurally valid negatives, never opened). */
function pdfSafety(){
  const enc=(t:string)=>new TextEncoder().encode(t);
  const valid=new TextDecoder().decode(syntheticPdf());
  const cases:Array<[string,Uint8Array]>=[
    ['header + %%EOF with no document structure',enc('%PDF-1.4\n%%EOF\n')],
    ['objects moved away from their recorded offsets',enc(valid.replace('/Type /Catalog','/Type /Catalog /X 1'))],
    ['encrypted',enc(valid.replace('/Root 1 0 R','/Root 1 0 R /Encrypt 9 0 R'))],
    ['JavaScript open action',syntheticPdf(undefined,{catalogExtra:'/OpenAction << /S /JavaScript /JS (x) >>'})],
    ['#-escaped /JavaScript name',syntheticPdf(undefined,{catalogExtra:'/Names << /J#61vaScript 6 0 R >>',extraObjects:['<< >>']})],
    ['embedded file',syntheticPdf(undefined,{extraObjects:['<< /Type /EmbeddedFile /Length 0 >>\nstream\n\nendstream']})],
    ['compressed object stream',syntheticPdf(undefined,{extraObjects:['<< /Type /ObjStm /N 0 /First 0 /Length 0 >>\nstream\n\nendstream']})],
    ['safe synthetic PDF',syntheticPdf()],
  ];
  return {
    envelope:{status:'implemented',checks:['%PDF-x.y at byte 0','%%EOF in the last 1024 bytes','at most 20 MB','non-empty']},
    structure:{status:'implemented',checks:['startxref → classic cross-reference table (incremental /Prev chain followed)','every in-use object starts at its recorded offset with its own number and generation','trailer /Root → /Catalog → /Pages tree with /Kids and /Count ≥ 1'],refused:['header + %%EOF without valid structure (MALFORMED)','cross-reference streams and hybrid files (UNSUPPORTED_STRUCTURE)']},
    readability:{status:'not yet supported',note:'page content (fonts, drawing operators, text) is never interpreted; the Studio proves a consistent document structure, not that every page renders'},
    activeContent:{status:'implemented',decision:'REJECT (fail closed): never embedded in the Studio or learner viewer, never packaged, the original bytes are never stripped or rewritten',names:ACTIVE_PDF_NAMES.map(n=>`/${n}`).concat('/OpenAction (action, not a destination array)'),
      method:'deny list over every PDF name outside raw stream data, with #xx escapes decoded',
      limitations:['a deny list is not a proof of safety: it covers the named PDF features, not every viewer behaviour','dictionaries inside compressed object streams are invisible to the scan, so such files are refused (UNSUPPORTED_STRUCTURE) instead of trusted','the browser’s PDF viewer is not relied on to neutralise anything']},
    encryption:{status:'implemented',decision:'REJECT'},
    syntheticFixtures:cases.map(([name,bytes])=>{ const r=inspectPdf(bytes); return {fixture:name,accepted:r.ok,reason:r.reason,activeContent:r.activeContent}; }),
  };
}

function hardText(root:string,rel:string){ return fs.readFileSync(path.join(root,rel),'utf8'); }

export function buildStudioReadiness(root=ROOT){
  const labels=readJson(root,'content-src/studio/content-studio.uz-latn.json').labels as Record<string,string>;
  const studioSources=(()=>{ const out:string[]=[]; const walk=(p:string)=>{ for(const e of fs.readdirSync(path.join(root,p),{withFileTypes:true})){ const r=`${p}/${e.name}`; if(e.isDirectory()) walk(r); else if(r.endsWith('.ts')) out.push(r); } }; walk('src/studio'); return out.sort(); })();
  const used=new Set<string>(); const dynamic=new Set<string>();
  for(const f of studioSources){ const t=hardText(root,f); for(const m of t.matchAll(/'(studio\.[a-z0-9.-]+)'/g)) used.add(m[1]!); for(const m of t.matchAll(/`(studio\.[a-z0-9.-]+)\.\$\{/g)) dynamic.add(m[1]!); }
  const missing=[...used].filter(k=>!(k in labels)).sort();
  const technical=Object.entries(labels).filter(([,v])=>TECHNICAL_TERMS.test(v)).map(([k])=>k);
  const closure=studioModuleClosure(root);
  const studioOnly=closure.filter(m=>m.rel.startsWith('src/studio/')||m.rel.startsWith('src/authoring/'));
  const learnerRoots=['app','features','ui','domain','runtime','engines','integrations','renderers'];
  const previewBuild=hardText(root,'scripts/build-browser-preview.ts');
  const learnerBuildScripts=['scripts/build-browser-preview.ts','scripts/build-production.ts','scripts/build-standalone.ts','scripts/build-release-bundle.ts','scripts/deploy-build.ts'];
  const leaks=learnerBuildScripts.filter(f=>fs.existsSync(path.join(root,f))&&/src\/studio|dist-studio|content-studio/.test(hardText(root,f)));
  // preview parity: the learner renderers inside the Studio build are byte-identical to the learner build's modules
  const parity=['src/features/dynamic-lab/render.ts','src/features/textbook-excerpt/render.ts'].map(rel=>{ const inStudio=closure.find(m=>m.rel===rel)?.js??null; const learner=path.join(root,'public/app-preview',rel.replace(/^src\//,'').replace(/\.ts$/,'.js')); const inLearner=fs.existsSync(learner)?fs.readFileSync(learner,'utf8'):null; return {module:rel,inStudioBuild:inStudio!==null,inLearnerBuild:inLearner!==null,identical:inStudio!==null&&inStudio===inLearner}; });
  // the PDF lane, run on a synthetic file (never a real excerpt)
  const pdf=syntheticPdf();
  const excerpt=attachPdf({...emptyExcerpt(),title:'Synthetic test excerpt',source:{title:'Synthetic test source',authority:'KimyoLab test fixture'}},'synthetic test.pdf',pdf);
  const pdfFindings=validateExcerpt(excerpt.payload,{learningUnitId:'lu.7.01'});
  const notPdf=attachPdf(emptyExcerpt(),'x.pdf',new TextEncoder().encode('<html>not a pdf</html>'));
  const progress=readJson(root,'reports/project-progress.json');
  const roundTrip=buildRoundTrip(root);
  return {
    schema:'kimyolab.content-studio-readiness.v1',phase:'P2.12',decision:'NOT_A_RELEASE_OR_PILOT_DECISION',
    semantics:'What the Content Studio MVP does, what is preview only, what needs a human and what is not yet supported. Statuses: implemented | preview only | human review required | not yet supported.',
    architecture:{
      principle:'one canonical content source → two separate interfaces (Learner App, Content Studio)',
      studioBuild:{script:'scripts/build-content-studio.ts',output:'dist-studio/ (git-ignored build output)',entry:'src/studio/ui/main.ts',serve:'npm run studio:serve (127.0.0.1 only)',csp:STUDIO_CSP},
      featureFlag:{name:'contentStudioV1',default:false,gates:'the Studio entry page only; it is not authentication'},
      authentication:{status:'not yet supported',note:'no safe authentication architecture exists; the Studio is a local tool and is never part of the learner deployment, so it is not presented as a production admin system'},
      learnerBoundary:{learnerBuildRoots:learnerRoots,studioRootInLearnerBuild:previewBuild.includes("'studio'"),learnerBuildScriptsReferencingStudio:leaks,studioNavigationInLearnerApp:/content-studio|contentStudioV1|\/studio/.test(hardText(root,'src/app/bootstrap.ts')+hardText(root,'src/app/routes.ts')),learnerProgressInStudio:closure.some(m=>/^src\/(runtime\/progress|features\/progress|runtime\/learning-orchestrator)\//.test(m.rel))},
      canonicalWriteFromStudio:false,
    },
    contentRoles:CONTENT_ROLES.map(r=>({role:r.role,status:r.support==='implemented'?'implemented':'not yet supported',instructionParser:r.instructionParser,canonicalContract:r.canonicalContract,learnerRenderer:r.learnerRenderer})),
    lanes:{
      textbookExcerpt:{
        flow:'Sinf → Mavzu → Darslik PDF qismini yuklash → Ko‘rish → Tekshirish → Nashrga tayyorlash',
        steps:[
          {step:'topic selection by class and topic name',status:'implemented'},
          {step:'upload of a human-cut excerpt (no page detection, cutting, OCR, extraction or mapping)',status:'implemented'},
          {step:'PDF envelope (signature at byte 0, %%EOF), size limit, safe file name, machine checksum',status:'implemented'},
          {step:'PDF structure (classic cross-reference table and /Prev chain, every object at its offset, catalog → page tree with ≥ 1 page); anything else refused',status:'implemented'},
          {step:'encrypted, active/interactive or compressed-storage PDF refused at upload (never shown, never packaged, bytes never rewritten)',status:'implemented'},
          {step:'page content readability (fonts, drawing, text) — not interpreted and not claimed',status:'not yet supported'},
          {step:'learner preview with the learner renderer “Darslikdan o‘qish” (accepted PDF only, loaded on demand); recorded as previewed only when it was drawn',status:'preview only'},
          {step:'deterministic publish candidate with a kimyolab.source-intake.v1 entry for the source',status:'implemented'},
          {step:'source acceptance, publication rights, didactic review',status:'human review required'},
          {step:'excerpt apply into the content pack and a learner hub entry point',status:'not yet supported'},
        ],
        syntheticRun:{fileBytes:pdf.length,inspection:{ok:excerpt.inspection.ok,version:excerpt.inspection.version,structure:excerpt.inspection.structure,activeContent:excerpt.inspection.activeContent},status:overallStatus(pdfFindings),findings:pdfFindings.map(f=>f.code),notPdfRejected:!notPdf.inspection.ok&&notPdf.inspection.reason==='NOT_PDF'},
        pdfSafety:pdfSafety(),
        rights:'an uploaded file is never assumed redistributable: rights stay NOT_DOCUMENTED until a human documents the basis, and no real textbook excerpt is committed or published',
      },
      labInstruction:{
        flow:'Sinf → Mavzu → Yo‘riqnomani kiritish → Tizim tekshiradi → Ko‘rib chiqish → Laboratoriya ko‘rinishi',
        steps:[
          {step:'instruction entry, or a copy of the topic’s canonical instruction',status:'implemented'},
          {step:'operation extraction (classifyInstructionStep) and capability resolution (resolveOperation), no family guessed',status:'implemented'},
          {step:'lab view with the learner dynamic-lab renderer, where a canonical profile exists for the same instruction',status:'preview only'},
          {step:'partial / unsupported operations shown in plain Uzbek',status:'implemented'},
          {step:'a changed instruction or a topic without a profile: no improvised lab view',status:'implemented'},
          {step:'profile authoring (trials, apparatus, substances) and instruction apply',status:'not yet supported'},
          {step:'chemistry and didactic review',status:'human review required'},
        ],
        roundTrip:{activities:roundTrip.summary.activities,equal:roundTrip.summary.equal,report:STUDIO_REPORTS.roundTrip},
      },
    },
    validationCategories:['READY','ATTENTION_REQUIRED','UNSUPPORTED','MISSING_INFORMATION','SOURCE_CONFLICT'],
    previewParity:{renderers:parity,allIdentical:parity.every(p=>p.identical)},
    previewTruth:{status:'implemented',rule:'a draft is recorded as previewed only with evidence of what the preview drew: for a textbook excerpt, the learner renderer drew the accepted PDF whose checksum the draft records; a rejected, missing or replaced file shows no viewer and records no preview. Entering the preview screen is not a preview. Any edit changes the revision, so preview and check are required again.'},
    candidateIntegrity:{status:'implemented',check:'npm run studio:check -- <file> (writes nothing; fails closed)',proves:[
      'candidateRevision equals the hash of the candidate body',
      'draftRevision equals the revision recomputed from the draft inside the candidate',
      'draft.validation.revision and draft.preview.viewedRevision equal that draftRevision (checked and previewed for this exact draft)',
      'validation status and findings equal a fresh validation of the draft (excerpt: in any environment; lab: with the repository registry and canonical profile)',
      'textbook: exactly one file whose name, size and checksum equal the draft record and whose bytes pass the PDF inspection again',
      'textbook: source-intake entry and excerpt record equal the ones recomputed from the draft',
      'lab: derived lab facts (preview state, operations, completion scope, gaps, profile) equal a fresh re-analysis in the repository; without that context the check fails closed',
      'human gates, consumers and apply boundary equal the fixed frame; no gate or review preset',
    ]},
    publishApplyBoundary:{studioAction:'Nashrga tayyorlash (a deterministic publish candidate download)',oneClickPublish:'not yet supported',candidateSchema:'kimyolab.studio-publish-candidate.v1',check:'npm run studio:check -- <file>',stillNeeded:['a human-only excerpt apply command','a documented rights register for textbook excerpts','a learner hub entry point for published excerpts','a human-only apply command for instruction drafts','profile authoring for instructions without a lab profile']},
    localization:{locale:'uz-Latn',catalog:'content-src/studio/content-studio.uz-latn.json',labels:Object.keys(labels).length,usedKeys:used.size,dynamicKeyFamilies:[...dynamic].sort(),missingKeys:missing,technicalTermsInAuthorLabels:technical.length,technicalTermsKeys:technical},
    bundleImpact:{studio:{modules:closure.length,moduleBytes:closure.reduce((n,m)=>n+Buffer.byteLength(m.js),0),studioOnlyModules:studioOnly.length,studioOnlyBytes:studioOnly.reduce((n,m)=>n+Buffer.byteLength(m.js),0),sharedLearnerModules:closure.length-studioOnly.length},learner:'reports/guided-dynamic-lab-readiness.json#bundleDelta.phases["P2.12"]'},
    governanceBlockers:[
      {blocker:'source acceptance for any textbook (human-accepted sources: see reports/theory-authoring-status.json)',status:'human review required'},
      {blocker:'publication rights for textbook excerpts',status:'human review required'},
      {blocker:'chemistry / didactic review of authored content',status:'human review required'},
      {blocker:'authentication for a hosted Studio',status:'not yet supported'},
      {blocker:'one-click publish',status:'not yet supported'},
    ],
    formalMetrics:{learningProduct:progress.learningProductProgress.percent,overall:progress.overallManagementEstimate.percent,note:'authoring infrastructure is not learner content coverage; no formula input changed'},
  };
}

export function studioOutputs(root=ROOT):Record<string,string>{
  const put=(v:unknown)=>`${JSON.stringify(v,null,2)}\n`;
  return {[STUDIO_REPORTS.readiness]:put(buildStudioReadiness(root)),[STUDIO_REPORTS.roundTrip]:put(buildRoundTrip(root))};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [cmd,file]=process.argv.slice(2).filter(a=>a!=='--');
  if(cmd==='check'){
    if(!file){ console.error('usage: npm run studio:check -- <publish-candidate.json>'); process.exit(2); }
    const problems=checkCandidateFile(file);
    console.log(JSON.stringify({file:path.basename(file),ok:problems.length===0,problems}));
    process.exit(problems.length?1:0);
  }
  const check=process.argv.includes('--check'); let stale=0;
  for(const [rel,body] of Object.entries(studioOutputs(ROOT))){
    const f=path.join(ROOT,rel);
    if(check){ if(!fs.existsSync(f)||fs.readFileSync(f,'utf8')!==body){ console.error(`STALE ${rel}`); stale++; } continue; }
    fs.writeFileSync(f,body);
  }
  if(stale) process.exit(1);
  const r=JSON.parse(studioOutputs(ROOT)[STUDIO_REPORTS.roundTrip]!);
  console.log(JSON.stringify({roundTrip:`${r.summary.equal}/${r.summary.activities}`,check}));
}
