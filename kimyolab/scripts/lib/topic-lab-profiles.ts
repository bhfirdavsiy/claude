// P2.10 — compile the topic lab profiles (content-src/topic-lab-profiles.json overlays + repository facts).
// Used by the content pack build (ships topic-lab-profiles.json) and by `npm run lab:inventory`.
import fs from 'node:fs';
import path from 'node:path';
import {compileTopicLabProfile,TOPIC_LAB_PROFILE_PACK_SCHEMA,type TopicLabProfile,type TopicLabProfileOverlay} from '../../src/domain/lab/topic-lab-profile.ts';
import {CONFIG_SOURCE_NAMES} from '../../src/runtime/practice-router/execution-plan.ts';
import {SpeciesRegistry} from '../../src/domain/chemistry/species-registry.ts';

export const TOPIC_LAB_OVERLAY_SCHEMA='kimyolab.topic-lab-profile-overlays.v1';
const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));

export function loadConfigs(root:string):Record<string,Record<string,any>>{
  return Object.fromEntries(CONFIG_SOURCE_NAMES.map(n=>[n,readJson(root,`content-src/activity-configs/${n}.json`)]));
}

/** P2.9 order-decision packets that are still open (activityId → packet path). */
export function openOrderPackets(root:string):Record<string,string>{
  const file=path.join(root,'reports/learner-feedback-semantics.json');
  if(!fs.existsSync(file)) return {};
  const report=JSON.parse(fs.readFileSync(file,'utf8'));
  return Object.fromEntries((report.activities??[]).filter((r:any)=>r.activityType==='experiment'&&r.state==='HUMAN_DECISION_REQUIRED'&&r.reviewPacket).map((r:any)=>[r.activityId,r.reviewPacket]));
}

export function compileTopicLabProfiles(root:string):{schema:typeof TOPIC_LAB_PROFILE_PACK_SCHEMA;profiles:TopicLabProfile[]}{
  const raw=readJson(root,'content-src/topic-lab-profiles.json');
  if(raw.schema!==TOPIC_LAB_OVERLAY_SCHEMA||!Array.isArray(raw.overlays)) throw new Error('TOPIC_LAB_OVERLAYS_INVALID');
  const activities=readJson(root,'content-src/practice-activities.json') as any[];
  const mappings=readJson(root,'content-src/mapping-links.json') as any[];
  const configs=loadConfigs(root);
  const speciesRaw=readJson(root,'content-src/chemistry/species.json');
  const species=SpeciesRegistry.from(Array.isArray(speciesRaw)?speciesRaw:speciesRaw.species);
  const packets=openOrderPackets(root);
  const seen=new Set<string>();
  const profiles=(raw.overlays as TopicLabProfileOverlay[]).map(overlay=>{
    if(seen.has(overlay.activityId)) throw new Error(`TOPIC_LAB_PROFILE_DUPLICATE:${overlay.activityId}`);
    seen.add(overlay.activityId);
    const activity=activities.find(a=>a.id===overlay.activityId);
    if(!activity) throw new Error(`TOPIC_LAB_PROFILE_ACTIVITY_UNKNOWN:${overlay.activityId}`);
    const sources=CONFIG_SOURCE_NAMES.filter(n=>Object.prototype.hasOwnProperty.call(configs[n]!,overlay.activityId));
    if(sources.length!==1) throw new Error(`TOPIC_LAB_PROFILE_CONFIG_ROUTE:${overlay.activityId}`);
    const learningUnitIds=[...new Set(mappings.filter(m=>m.practiceActivityId===overlay.activityId).map(m=>m.learningUnitId as string))].sort();
    return compileTopicLabProfile(overlay,{activity,config:configs[sources[0]!]![overlay.activityId],configSource:sources[0]!,learningUnitIds,orderDecisionPackets:packets,species});
  });
  return {schema:TOPIC_LAB_PROFILE_PACK_SCHEMA,profiles};
}
