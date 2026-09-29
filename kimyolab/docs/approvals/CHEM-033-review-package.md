# CHEM-033 Chemistry Reviewer Package

**Status:** PENDING EXTERNAL CHEMISTRY REVIEW  
**Review version:** `1.0.0-rc.1`  
**Review target SHA-256:** `d6d0f5bb34893cc81c1ef84c644caf5640e92c606361b57b20701b315a592195`  
**Review-surface schema:** `kimyolab.chemistry-review-surface.v2`  
**Files covered by approval hash:** 23

## What this approval covers

CHEM-033 is fail-closed. The approval hash covers both canonical chemistry knowledge and the runtime activity configurations that can change how that chemistry is presented or executed. Any byte-level semantic JSON change to this review surface produces a new target hash; an older approval then becomes `APPROVAL_HASH_STALE`.

### Canonical chemistry knowledge

- `content-src/chemistry/constants.json`
- `content-src/chemistry/electrolysis.json`
- `content-src/chemistry/equilibrium.json`
- `content-src/chemistry/guided-step-coverage-targets.json`
- `content-src/chemistry/guided-step-model-map.json`
- `content-src/chemistry/guided-step-reaction-map.json`
- `content-src/chemistry/hydrolysis.json`
- `content-src/chemistry/kinetics.json`
- `content-src/chemistry/manganese-redox.json`
- `content-src/chemistry/organic.json`
- `content-src/chemistry/qualitative-tests.json`
- `content-src/chemistry/reactions.json`
- `content-src/chemistry/school-lab-models.json`
- `content-src/chemistry/solubility.json`
- `content-src/chemistry/species.json`

### Chemistry-relevant runtime activity configurations

- `content-src/activity-configs/beta1.json`
- `content-src/activity-configs/beta2-advanced.json`
- `content-src/activity-configs/beta2-organic.json`
- `content-src/activity-configs/beta2-safe.json`
- `content-src/activity-configs/beta3-advanced.json`
- `content-src/activity-configs/beta3-safe.json`
- `content-src/activity-configs/guided-labs.json`
- `content-src/activity-configs/reference-slices.json`

## School-equation corpus

- Corpus: `tests/chemistry-corpus/school-review-candidates.json`
- Review sheet: `reports/CHEM-033-school-equations-review.csv`
- Technical balance is not chemical validity; the reviewer must validate chemistry, conditions, observations, safety and grade appropriateness.

## Approval procedure

1. Review the exact files listed above plus the school-equation corpus.
2. Resolve any `reject`/`revise` decisions before approval.
3. Use `review-packets/CHEM-033-approval-template.json` generated from the same target.
4. Fill a real reviewer ID, keep role `Chemistry Reviewer`, set `reviewedAt`, and change status to `approved` only after review.
5. Do not edit `reviewedVersion` or `reviewedHash`; they must match the generated target exactly.

## Acceptance rule

CHEM-033 closes only when the external approval record matches the current version, reviewer role and review target hash. Any later chemistry/relevant-runtime change invalidates the old approval automatically.
