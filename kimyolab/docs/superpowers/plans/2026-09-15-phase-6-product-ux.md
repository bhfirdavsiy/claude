# Phase 6 Product UX / Learning Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the verified runtime into a student-facing KimyoLab shell and Learning Hub without exposing developer/mapping metadata.

**Architecture:** UI consumes the versioned runtime content pack through a content client and derives a student-safe Learning Hub view model. Route parsing, content selection and view-model generation stay pure/testable; DOM rendering is a thin browser layer. Source remains TypeScript and is Vite-ready; because Vite is not present in this execution environment, a local Node type-strip preview builder is allowed only as an execution-environment preview, not as the final production build contract.

**Tech Stack:** TypeScript, semantic HTML, CSS design tokens, existing Sinco assets, runtime content pack, future Vite production build.

**Spec:** `docs/specs/KimyoLab_v20_Master_TT_v2.1_FINAL_IMPLEMENTATION_SPEC.md`

## Global Constraints

- Student UI MUST NOT expose mapping/lifecycle/approval/legacy/schema debug metadata.
- Approved hero title: `Kimyoni tajribalar orqali o‘rganing va tushuning.`
- Canonical content pack is the runtime source.
- Main route must support `/learn/:learningUnitId` deep links.
- UI must provide loading, empty and error states.
- Keyboard and semantic structure are first-class requirements.

---

### Task 1: App routes and student-safe Learning Hub model
- Create route parser and canonical Learning Hub selector.
- Test that developer metadata never enters the student view model.

### Task 2: Runtime content client
- Load active manifest, versioned pack, grade chunks, theories, practices and mappings.
- Add structured content-load errors.

### Task 3: Semantic application shell and renderer
- Home hero, grade/topic navigation, Learning Hub sections, loading/error/empty states.
- Reuse Sinco identity through tokens rather than importing unused template pages/plugins.

### Task 4: Browser preview build
- Create a Vite-ready entry point and config.
- Create an environment-only preview build using Node type stripping while Vite dependency is unavailable.
- Run source/unit tests and static preview checks.

### Task 5: Phase 6A checkpoint
- Record Vite environment blocker explicitly.
- Do not close full Phase 6 until Vite build, browser E2E, visual regression and accessibility automation can run.
