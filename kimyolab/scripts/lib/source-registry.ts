// P2.4 closeout (A1/A2) — the source registry as canonical authoring sees it. A HUMAN_ACCEPTED record counts only while
// it is pinned to the human-reviewed intake revision: content-src/source-intake/<id>.json must still exist, still be
// APPROVED, hash to the record's reviewedHash, and carry the decision of the person named in acceptedBy. Anything else
// (a hand-edited registry record, an intake edited after acceptance, a missing intake) is NOT human-accepted here.
// Nothing is reclassified on disk; this only decides what may support canonical structured theory.
import fs from 'node:fs';
import path from 'node:path';
import {parseSourceRegistry,sourceAcceptance,type SourceRegistry} from '../../src/domain/governance/source-policy.ts';
import {SOURCE_INTAKE_DIR,sourceEntryHash,sourceGovernance} from '../../src/authoring/source-intake.ts';

export type PinIssue='INTAKE_MISSING'|'INTAKE_NOT_APPROVED'|'INTAKE_HASH_MISMATCH'|'ACCEPTED_BY_MISMATCH';

export function loadGovernedSourceRegistry(root:string):{registry:SourceRegistry;pinIssues:Array<{id:string;issue:PinIssue}>}{
  const raw=JSON.parse(fs.readFileSync(path.join(root,'content-src/source-registry.json'),'utf8'));
  const {registry}=parseSourceRegistry(raw);
  const pinIssues:Array<{id:string;issue:PinIssue}>=[];
  for(const entry of registry.byId.values()){
    if(entry.classification!=='HUMAN_ACCEPTED') continue;
    const file=path.join(root,SOURCE_INTAKE_DIR,`${entry.id}.json`);
    let issue:PinIssue|null=null;
    if(!fs.existsSync(file)) issue='INTAKE_MISSING';
    else{
      const intake=JSON.parse(fs.readFileSync(file,'utf8'));
      const g=sourceGovernance(intake);
      if(sourceEntryHash(intake)!==entry.reviewedHash) issue='INTAKE_HASH_MISMATCH';
      else if(g.state!=='APPROVED') issue='INTAKE_NOT_APPROVED';
      else if(g.decision?.reviewerId!==entry.acceptedBy) issue='ACCEPTED_BY_MISMATCH';
    }
    if(issue){ pinIssues.push({id:entry.id,issue}); registry.byId.set(entry.id,{...entry,reviewedHash:null}); }   // unpinned → not human-accepted
  }
  return {registry,pinIssues};
}

/** Registry facts for reports: registered / category-compatible / human-accepted / canonical-theory-eligible. */
export function sourceReadiness(registry:SourceRegistry){
  const xs=[...registry.byId.values()].map(e=>({id:e.id,...sourceAcceptance(e)}));
  return {registeredSources:xs.length,categoryCompatibleSources:xs.filter(x=>x.categoryCompatible).length,
    humanAcceptedSources:xs.filter(x=>x.humanAccepted).length,canonicalTheoryEligibleSources:xs.filter(x=>x.canonicalAuthoringEligible).length,
    eligibleSourceIds:xs.filter(x=>x.canonicalAuthoringEligible).map(x=>x.id).sort()};
}
