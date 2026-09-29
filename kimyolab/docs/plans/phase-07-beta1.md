# Phase 7 — Beta1 7–8 Implementation Plan

**Goal:** 47 ta 7–8-sinf LearningUnit uchun primary practice’larni reusable engine/config orqali technical-ready holatga olib chiqish va approval readiness’ni alohida kuzatish.

**Architecture:** 43 unique primary practice 5 engine family orqali ishlaydi. Existing 6 reference slice config saqlanadi; qolgan primary practice’lar `content-src/activity-configs/beta1.json` orqali configlanadi. Experimentlar unknown chemistry taxmin qilmaydi: legacy step’lar procedural virtual scenario sifatida ishlaydi, reactive output faqat curated Reaction KB mavjud bo‘lsa chiqariladi.

**Spec:** `KimyoLab_v20_Master_TT_v2.1_FINAL_IMPLEMENTATION_SPEC.md`

## Global constraints
- Grade 7–8 scope = 47 LearningUnit.
- Required primary mappings = 47.
- Reusable engine families = experiment/simulation/trainer/calculation/case.
- Unknown chemistry must return modeled error, never guessed product.
- Approvals are never auto-approved by code.
- Student UI may not expose technical readiness metadata.

### Task 1 — Beta1 readiness validator
- Add readiness report separating technical readiness from external approvals.
- Technical-ready requires full mapping, ready lifecycle, config present, accessibility profile, engine compatibility.
- Release-ready additionally requires technical/didactic/accessibility approvals and chemistry approved/not_applicable.

### Task 2 — Beta1 config contract and router
- Add generalized config loader and adapters for all five engine types.
- Preserve existing reference slices as valid configs.

### Task 3 — Author 43 primary practice configs
- Reuse existing 6 configs.
- Add remaining configs without guessing chemical reaction outcomes.
- Experiment configs derive procedure from source-backed legacy steps when available.

### Task 4 — Migration readiness overrides
- Apply activity lifecycle/accessibility overrides after config materialization.
- Apply mapping coverage overrides from a dedicated mapping override file.

### Task 5 — Technical E2E matrix
- Execute one successful representative path for every unique primary practice.
- Verify all 47 LearningUnits resolve to runnable practice.

### Task 6 — Beta1 gate report
- Report technical-ready count and approval-ready count separately.
- Do not claim Phase 7 full release closure while external approvals remain pending.
