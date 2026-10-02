// P2.5 — writes reports/model-interaction-expansion.json (ADR-P2-006): the eligibility audit of model-based reaction
// interaction, from the real domain. Facts only: which candidates are eligible, which were converted, and why every
// other one was not. Runs after learning-depth (it reads the classification baseline).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildModelInteractionExpansion} from './lib/model-interaction.ts';

export const MODEL_INTERACTION_REPORT='reports/model-interaction-expansion.json';
/** Activities whose route this repository changed to model-based reaction interaction in P2.5 (none: see the ADR). */
export const P25_CONVERTED:readonly string[]=Object.freeze([]);

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const r=buildModelInteractionExpansion(root,{converted:[...P25_CONVERTED]});
  fs.writeFileSync(path.join(root,MODEL_INTERACTION_REPORT),`${JSON.stringify(r,null,2)}\n`,'utf8');
  console.log(JSON.stringify({candidates:r.candidateActivities,eligible:r.eligible.length,converted:r.converted.length,modelBasedActivities:[r.modelBasedActivitiesBefore,r.modelBasedActivitiesAfter],modelBasedUnits:[r.modelBasedUnitsBefore,r.modelBasedUnitsAfter]}));
}
