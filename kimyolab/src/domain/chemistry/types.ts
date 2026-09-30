import type { Quantity } from './quantity.ts';
export type Phase='s'|'l'|'g'|'aq'|'unknown';
export type HazardCode=string;
export interface SourceRef { id:string; type:'textbook'|'curriculum'|'standard'|'reference'|'expert-review'|'internal'; title:string; edition?:string; page?:string; url?:string; publisher?:string; year?:number; license?:string }
export interface Species { id:string; formula:string; nameKey:string; structuralVariant?:string; allotrope?:string; phase:Phase; charge:number; color?:string; solubilityClass?:string; acidBaseClass?:string; electrolyteStrength?:'strong'|'weak'|'none'; oxidationStates:number[]; hazards:HazardCode[]; properties:Record<string,string|number|boolean>; sourceRefs:SourceRef[] }
export type Observation =
 | {type:'color-change';from?:string;to:string}
 | {type:'precipitate';speciesId?:string;color?:string}
 | {type:'gas';speciesId?:string;descriptionKey?:string}
 | {type:'temperature-change';delta?:number;direction:'up'|'down'}
 | {type:'odor';descriptionKey:string}
 | {type:'light';descriptionKey:string}
 | {type:'state-change';from:string;to:string}
 | {type:'no-visible-change'};
export interface QuantityRange {min?:Quantity;max?:Quantity}
export interface ConcentrationRule {speciesId:string;min?:Quantity;max?:Quantity}
export interface ReactionConditions {temperatureRange?:{min?:number;max?:number;unit:'C'|'K'};solvent?:string;medium?:'acidic'|'basic'|'neutral';catalystIds?:string[];pressureRange?:QuantityRange;concentrationRules?:ConcentrationRule[];lightRequired?:boolean;electricalCurrent?:boolean;tags?:string[];
  /** P1.7: structured ACTUAL conditions of a situation (condition-vocabulary dimensions); never set on KB records */
  dimensions?:Record<string,string>}
export interface ReactionSpeciesRef {formula:string;phase?:Phase;coefficient?:number}
export interface ApprovalRecord {status:'pending'|'approved'|'rejected';reviewerId:string;reviewerRole:string;reviewedVersion:string;reviewedHash:string;reviewedAt:string;notes?:string}
export interface ReactionRecord {id:string;reactants:ReactionSpeciesRef[];products:ReactionSpeciesRef[];conditions:ReactionConditions;direction:'forward'|'reversible';reactionType:string;molecularEquation:string;observations:Observation[];safety:string[];curriculumRefs:string[];sourceRefs:SourceRef[];version:string}
