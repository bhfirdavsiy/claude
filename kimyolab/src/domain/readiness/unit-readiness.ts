// Unit-level readiness facts shipped in the readiness pack (P1.2). Assessment availability is a unit fact:
// objective items exist for the unit and are human-approved, pending review, or absent.
import type {ReadinessReason} from './readiness.ts';

export type AssessmentAvailability='AVAILABLE'|'PENDING'|'NONE';

export interface UnitReadiness {
  learningUnitId:string;
  pilot:boolean;
  assessment:{status:AssessmentAvailability;reasons:ReadinessReason[]};
}
