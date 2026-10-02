// P2.6 — writes reports/computed-model-interaction-audit.json and reports/computed-model-interaction-expansion.json
// (ADR-P2-007): the eligibility audit of computed-model interaction, from the real domain, and the facts of the
// conversions. Runs after learning-depth and renderer:reports (it reads the classification baseline and the per-activity
// condition-prediction report) and after the builds (bundle impact is measured on the committed build output).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildComputedModelAudit,buildComputedModelExpansion,CMI_AUDIT_REPORT,CMI_EXPANSION_REPORT} from './lib/computed-model-interaction.ts';

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const audit=buildComputedModelAudit(root);
  const expansion=buildComputedModelExpansion(root,audit);
  const write=(rel:string,body:unknown)=>fs.writeFileSync(path.join(root,rel),`${JSON.stringify(body,null,2)}\n`,'utf8');
  write(CMI_AUDIT_REPORT,audit); write(CMI_EXPANSION_REPORT,expansion);
  console.log(JSON.stringify({candidates:audit.totals.candidates,converted:audit.converted.length,blocked:audit.totals.blocked,notEligible:audit.totals.notEligible,modelBasedActivities:expansion.modelBasedActivities,modelBasedUnits:expansion.modelBasedUnits,newChemistryRecords:expansion.newChemistryRecords}));
  if(expansion.newChemistryRecords!==0||expansion.perActivityBlackSwan.some((b:any)=>!b.pass)){ console.error('COMPUTED_MODEL_INVARIANT_FAILED'); process.exitCode=1; }
}
