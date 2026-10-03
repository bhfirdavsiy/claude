// P2.12 — the Content Studio's build-time data (kimyolab.content-studio-data.v1). Everything here is COPIED from the
// canonical sources at build time (scripts/build-content-studio.ts); the Studio never keeps its own content. The lab
// preview additionally loads the integrity-checked learner content pack through the learner's own ContentClient.
import type {RegistryData} from '../domain/lab/capability-registry.ts';

export const STUDIO_DATA_SCHEMA='kimyolab.content-studio-data.v1';

export interface StudioData {
  schema:typeof STUDIO_DATA_SCHEMA;
  /** learning units, shown to the author by class and topic name only */
  units:Array<{id:string;grade:number;title:string;chapter:string}>;
  /** topics whose lab instruction exists in the canonical content, with the activity it lives in */
  labSources:Array<{learningUnitId:string;practiceActivityId:string;goal:string;legacy:{equipment:string;materials:string;safety:string;steps:string[]};profiled:boolean}>;
  /** the engine data the capability registry is derived from (the same files the learner pack ships) */
  registryData:RegistryData;
  /** content-src/studio/content-studio.uz-latn.json */
  studioLabels:Record<string,string>;
  /** content-src/locales/uz-latn/learner-interaction.json (the learner catalog, for the excerpt preview) */
  learnerLabels:Record<string,string>;
}
