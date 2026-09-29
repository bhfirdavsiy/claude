import type { LabAction } from '../../engines/experiment/types.ts';

export interface ReferenceSliceInput {
  actions?: LabAction[];
  simulationActions?: Array<Record<string,unknown>>;
  trainerAnswers?: string[];
  calculationResponses?: Array<{stepId:string;value:number;unit:string}>;
  case?: {
    evidenceIds:string[];
    decision:string;
    justification:string;
    reflection?:string;
  };
}

export interface ReferenceSliceContext {
  inputs: Record<string, ReferenceSliceInput>;
}

export type ReferenceSliceConfig = Record<string, any> & {
  sliceId:string;
  type:'experiment'|'simulation'|'trainer'|'calculation'|'case';
  version:string;
  conceptId:string;
};

export type ReferenceSliceRegistry = Record<string,ReferenceSliceConfig>;

export function loadReferenceSliceRegistry(raw:unknown):ReferenceSliceRegistry {
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) throw new Error('REFERENCE_SLICE_CONFIG_INVALID');
  const out:ReferenceSliceRegistry={};
  for(const [activityId,value] of Object.entries(raw as Record<string,unknown>)){
    if(!value || typeof value!=='object' || Array.isArray(value)) throw new Error(`REFERENCE_SLICE_CONFIG_INVALID:${activityId}`);
    const v=value as Record<string,unknown>;
    if(typeof v.sliceId!=='string'||typeof v.type!=='string'||typeof v.version!=='string'||typeof v.conceptId!=='string') throw new Error(`REFERENCE_SLICE_CONFIG_INVALID:${activityId}`);
    out[activityId]=value as ReferenceSliceConfig;
  }
  return out;
}
