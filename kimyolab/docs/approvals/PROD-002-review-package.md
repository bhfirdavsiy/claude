# PROD-002 Didactic Reviewer Package

**Status:** PENDING EXTERNAL DIDACTIC REVIEW  
**Review version:** `2026.09.1`  
**Review target SHA-256:** `b0bf3284366d72a8f3c33f821809087dcb5a190bbeb8e05e65b46a1034d199d6`  
**Review-surface schema:** `kimyolab.didactic-review-surface.v2`  
**Files covered by approval hash:** 21

## What this approval covers

PROD-002 covers the canonical learner-facing curriculum flow, theory/practice definitions, mappings, external-lab bindings and runtime activity configurations. Any semantic JSON change in this surface changes the target hash and invalidates an older didactic approval.

## Exact review surface

- `content-src/activity-configs/beta1.json`
- `content-src/activity-configs/beta2-advanced.json`
- `content-src/activity-configs/beta2-organic.json`
- `content-src/activity-configs/beta2-safe.json`
- `content-src/activity-configs/beta3-advanced.json`
- `content-src/activity-configs/beta3-safe.json`
- `content-src/activity-configs/guided-labs.json`
- `content-src/activity-configs/reference-slices.json`
- `content-src/activity-overrides.json`
- `content-src/assessment-items.json`
- `content-src/beta2-capability-matrix.json`
- `content-src/beta3-capability-matrix.json`
- `content-src/concepts.json`
- `content-src/external-lab-bindings.json`
- `content-src/learning-cycle.json`
- `content-src/learning-units.json`
- `content-src/mapping-links.json`
- `content-src/mapping-overrides.json`
- `content-src/practice-activities.json`
- `content-src/practice-additions.json`
- `content-src/theory-activities.json`

## Reviewer checks

1. Learning outcomes, theory, practice and assessment form a coherent learning sequence.
2. Activity type and difficulty are appropriate for the stated grade and concept.
3. External lab links are pedagogically supplemental and do not bypass local assessment/mastery.
4. Guided/engine activities provide meaningful evidence rather than completion-only signals.
5. Technical/internal metadata is not exposed as learner-facing instructional content.

## Approval procedure

1. Review the exact files listed above and representative end-to-end learner flows.
2. Use `review-packets/PROD-002-approval-template.json` generated from the same target.
3. Fill a real reviewer ID/date and set status to `approved` only after review.
4. Do not edit `reviewedVersion` or `reviewedHash`; they must match the generated target.

## Acceptance rule

PROD-002 closes only when the external approval record matches the current content version, reviewer role and didactic review target hash. Any later learner-flow/configuration change invalidates the old approval automatically.
