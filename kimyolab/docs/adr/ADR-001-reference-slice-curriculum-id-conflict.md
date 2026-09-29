# ADR-001 — Reference slice curriculum ID conflict

**Status:** Open — must be resolved before Phase 5
**Detected:** 2026-09-14 during Phase 1 canonical migration

## Context

The frozen TT v2.1 names **SLICE-01 as “7.02 Aralashmani ajratish (Experiment)”**. The authoritative curriculum mapping says:

- `7.02` — **Modda va uning xossalari**, primary type **Simulyatsiya**.
- `7.03` — **Sof modda va aralashmalar**, primary type **Lab/Experiment**.
- Legacy practice `7.2` — **Aralashmalar tarkibidan sof moddani ajratish: ifloslangan osh tuzini tozalash**, linked to `7.03` and `7.21`.

Therefore the TT reference label and the curriculum source disagree.

## Proposed decision

Before Phase 5, patch the reference slice label to:

`SLICE-01 — 7.03 / practice 7.2: Aralashmani ajratish (Experiment)`

and keep `7.02` as the simulation requirement defined by canonical curriculum.

## Why no silent correction was made

The TT is frozen and requires ADR/version-bump for specification changes. Phase 1 preserves authoritative curriculum data and records this conflict rather than rewriting source data to fit the mistaken slice label.
