// P2.8 — real target-server acceptance (fail closed). READY_FOR_DEPLOYMENT needs a record in docs/deploy/acceptance/
// that a HUMAN operator wrote after installing THIS exact artefact on a real HTTPS origin and running the preflight and
// the smoke there. An agent may only write the TEMPLATE (docs/deploy/acceptance-template.json); it never writes an
// accepted record. Anything malformed, stale, for another artefact, local, automated or not ACCEPTED does not count.
import fs from 'node:fs';
import path from 'node:path';

export const ACCEPTANCE_SCHEMA='kimyolab.target-acceptance.v1';
export const ACCEPTANCE_DIR='docs/deploy/acceptance';
export const ACCEPTANCE_FIELDS=['schema','artifactSha256','contentVersion','basePath','targetOrigin','acceptedAt','acceptedBy','actorType','preflightResult','smokeResult','decision'] as const;
/** identities that are automation, never a human acceptance */
const AUTOMATION=/\b(bot|ci|agent|automation|github-actions|claude|copilot|runner|service)\b|\[bot\]/i;
const LOCAL_HOST=/^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+)$|\.(localhost|local|test|example|invalid|internal|lan)$/i;

export interface ExpectedArtifact { sha256:string; contentVersion:string; basePath:string }

/** Every reason this record does not count (empty = a valid acceptance of THIS artefact). */
export function acceptanceProblems(record:any,expected:ExpectedArtifact):string[]{
  const p:string[]=[];
  if(!record||typeof record!=='object'||Array.isArray(record)) return ['NOT_AN_OBJECT'];
  for(const f of ACCEPTANCE_FIELDS) if(record[f]===undefined||record[f]===null||record[f]==='') p.push(`MISSING_${f}`);
  if(record.schema!==undefined&&record.schema!==ACCEPTANCE_SCHEMA) p.push('SCHEMA_UNKNOWN');
  if(record.artifactSha256!==undefined&&record.artifactSha256!==expected.sha256) p.push('ARTIFACT_MISMATCH');
  if(record.contentVersion!==undefined&&record.contentVersion!==expected.contentVersion) p.push('CONTENT_VERSION_MISMATCH');
  if(record.basePath!==undefined&&record.basePath!==expected.basePath) p.push('BASE_PATH_MISMATCH');
  if(record.targetOrigin!==undefined){
    let url:URL|null=null; try{ url=new URL(String(record.targetOrigin)); }catch{ p.push('TARGET_ORIGIN_INVALID'); }
    if(url){
      if(url.protocol!=='https:') p.push('TARGET_NOT_HTTPS');
      if(LOCAL_HOST.test(url.hostname)) p.push('TARGET_LOCAL');
      if(url.origin!==String(record.targetOrigin).replace(/\/$/,'')) p.push('TARGET_NOT_AN_ORIGIN');
    }
  }
  if(record.acceptedAt!==undefined&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(record.acceptedAt))||Number.isNaN(Date.parse(record.acceptedAt)))) p.push('ACCEPTED_AT_INVALID');
  if(record.actorType!==undefined&&record.actorType!=='human') p.push('ACTOR_NOT_HUMAN');
  if(record.acceptedBy!==undefined&&AUTOMATION.test(String(record.acceptedBy))) p.push('ACTOR_IS_AUTOMATION');
  if(record.preflightResult!==undefined&&record.preflightResult!=='PASS') p.push('PREFLIGHT_NOT_PASS');
  if(record.smokeResult!==undefined&&record.smokeResult!=='PASS') p.push('SMOKE_NOT_PASS');
  if(record.decision!==undefined&&record.decision!=='ACCEPTED') p.push('DECISION_NOT_ACCEPTED');
  return p;
}

/** Read every record in docs/deploy/acceptance/; only problem-free ones for THIS artefact are valid. */
export function readAcceptance(root:string,expected:ExpectedArtifact|null){
  const dir=path.join(root,ACCEPTANCE_DIR);
  const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort():[];
  const records=files.map(file=>{
    let record:any=null; try{ record=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8')); }catch{ return {file,valid:false,problems:['NOT_JSON']}; }
    const problems=expected?acceptanceProblems(record,expected):['NO_CURRENT_ARTIFACT'];
    return {file,valid:problems.length===0,problems};
  });
  return {dir:ACCEPTANCE_DIR,records,valid:records.filter(r=>r.valid).length};
}
