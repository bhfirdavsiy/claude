# Phase 10 — Beta3 Grade 11 Implementation Plan

> REQUIRED: TDD, bounded chemistry, unknown state/result must never be inferred.

**Goal:** Bring all 22 Grade 11 LearningUnits to technical-ready using reusable advanced chemistry capabilities.

**Architecture:** Keep canonical MappingLink as relation authority. Use one Beta3 config registry plus bounded domain models. Reuse existing IonicEngine, HydrolysisModel, ElectrolysisModel and RedoxBalancer where valid; add focused models for missing domains.

## Tasks
1. Capability matrix + readiness validator for 22 Grade 11 units.
2. Authoring overrides: full mapping, ready lifecycle, accessibility profiles.
3. Atomic/periodic/bonding knowledge models.
4. Nuclear equation validator.
5. Stoichiometry/concentration calculations.
6. Gas-law model.
7. Electrolyte/solubility model.
8. Kinetics model.
9. Equilibrium/Le Chatelier model.
10. Redox half-reaction / medium router using existing bounded balancer/model.
11. Electrolysis reuse + Faraday model.
12. Beta3 router and 22 configs.
13. Canonical LearningRunner 22/22 E2E.
14. Browser ContentClient/Practice UI integration.
15. Beta3 validator + release gate blocker + full regression.
