# KimyoLab current implementation status

Current phase: **Phase 12 — Stable Product finalization**

Current substage: **12.10 — Validated mustahkamlash savollar banki**

Brand palette: **#004EB8 → #023480 → #021236**

Technical repository state: **GREEN**  
Stable release state: **PENDING — finalization + human/browser gates**

## Fresh verification
- Curriculum: **122/122 technical-ready**
- Native experiments: **57/57 launchable** — 30 engine-backed + 27 guided
- Guided hardening baseline: **47/47 chemistry-evidence target steps (100%) / 19/19 chemistry-relevant labs / 0 baseline missing**
- External labs: **11 bindings / 44 placements / 27 LearningUnits**
- RC tests: **26/26 PASS**
- Full regression: **330/330 PASS**
- Phase 12 tests: **66/66 PASS**
- HTTP smoke: **17/17 PASS**
- Standalone Chromium: **PASS**, native experiment step executed, 0 runtime exceptions
- RC deploy bundle: **145 files**, integrity/licensing GREEN
- Production pack: **146 files / 145 deploy files**

## Oldinda turgan bosqichlar
1. **Blue brand palette migration — DONE**: Canonical UI tokens migrated to #004EB8 → #023480 → #021236 while preserving the Sinco layout.
2. **Front visual QA & approval — TECHNICAL_DONE**: Desktop/mobile regression, approved home hero copy, supplied 3D card icons, contrast and human visual review of the current blue UI.
3. **Native lab chemistry hardening — DONE**: 47/47 curated chemistry-evidence target steps grounded across 19/19 chemistry-relevant guided labs; expert approval remains a separate gate.
4. **External provider production hookup — TECHNICAL_DONE**: 8/8 reference/deep-link binding READY; NOBOOK 3 binding PARTNER_CONFIGURATION_REQUIRED. Same-origin pinned SDK + server-only credentials enforced.
5. **Unrestricted browser evidence — HANDOFF_READY**: Windows runner/importer tayyor; production E2E, accessibility tree, Web Vitals va screenshots exact build hashga bog‘lanadi. External unrestricted workstation execution talab qilinadi.
6. **Nazariya → Amaliyot → Mustahkamlash learning cycle — TECHNICAL_DONE**: 122 LearningUnit uchun uch bosqichli route/navigation va progress bog‘landi; standalone Chromium flow PASS; mustahkamlash completion avtomatik mastery bermaydi.
7. **Validated mustahkamlash savollar banki — CURRENT**: Assessment bank/schema faol: 5 pilot savol / 1/122 LearningUnit / 0 approved. Pending itemlar student UI’da yashirin; yozma self-check fallback qoladi.
8. **Expert / Beta / visual approvals — WAITING**: Offline reviewer workspace READY: 384 individual Beta activity-role row + CHEM-033/PROD-002 exact-hash forms. VISUAL-001 browser screenshots kelgach ochiladi.
9. **Stable preflight — FUTURE**: Refresh approvals and require every fail-closed gate to be GREEN.
10. **Stable finalize — FINAL**: Create immutable Stable bundle, verify rollback and publish the final release manifest.

## Remaining finalization workstreams
- **Core data & curriculum — DONE**: 122/122 LearningUnit technical-ready; canonical pack deterministic. Next: Human approvals can review exact frozen versions.
- **Front fidelity & navigation — TECHNICAL_DONE**: Sinco layout preserved; approved blue gradient #004EB8 → #023480 → #021236 applied as canonical brand tokens; approved hero copy integrated; Mavzu studiyasi / Virtual laboratoriya / Natijalarim use the supplied transparent 3D PNG icons; self-contained styled index; desktop standalone PASS; mobile 390x844 smoke PASS with no page overflow. Next: Human visual approval remains in the approval gate; automated front fidelity work is complete.
- **Native virtual laboratories — DONE**: 57/57 launchable: 30 engine-backed + 27 guided. Chemistry-relevant guided baseline: 47/47 target steps (100%) across 19/19 labs; 0 baseline missing. Reaction/model records remain pending CHEM-033 expert review. Next: No automated native-lab baseline blocker remains; complete CHEM-033 human review on the exact frozen chemistry surface.
- **External lab providers — BLOCKED_EXTERNAL**: 11 provider bindings → 44 curriculum placements → 27 LearningUnits. 8/8 reference/deep-link bindings READY; NOBOOK partnerConfigured=false, sdkReady=false, experimentUrlValid=false. Next: Connect real NOBOOK partner credentials, approved HTTPS experiment URL and pinned SDK artifact; no secret is shipped to the browser.
- **Learning cycle, evidence & mastery — IN_PROGRESS**: 122 LearningUnit uchun Nazariya → Amaliyot → Mustahkamlash route/navigation contracti TECHNICAL_DONE. Assessment bank: 5 pilot item / 1 unit / 0 approved; pending itemlar release UI’da ko‘rinmaydi. Next: Scale the validated objective reinforcement bank from the electrolysis pilot to the remaining LearningUnits under chemistry+didactic review.
- **Real-browser E2E & visual QA — BLOCKED_EXTERNAL**: Standalone Chromium smoke PASS with native lab step execution and 0 exceptions; managed policy blocks normal local URL browser gate. Evidence importer is fail-closed and bound to the exact production build hash. Next: On unrestricted Windows run scripts/windows/Run_KimyoLab_Browser_Gates.cmd, then import evidence; VISUAL-001 remains human-reviewed.
- **Accessibility & performance — PARTIAL**: HTTP 17/17 PASS; static accessibility PASS; standalone mobile layout PASS. Next: Real-browser accessibility tree, Web Vitals and visual regression evidence.
- **Expert / Beta approvals — PENDING**: CHEM-033 1.0.0-rc.1: 23 files / d6d0f5bb34893cc8…; PROD-002: 21 files / b0bf3284366d72a8…; 397 per-LearningUnit role approvals pending. Reviewer handoff has 384 unique activity-role decision rows and fail-closed importers. Next: Reviewers fill exact-hash templates/registers, import decisions, then run approvals:refresh.
- **Stable release & rollback — PENDING**: RC integrity/licensing/rollback GREEN; Stable preflight still has 9 pending gates. Next: When every required gate is GREEN, run stable:preflight then stable:finalize.

## Stable pending gates
- CHEM-033
- PROD-002
- BETA1-APPROVALS
- BETA2-APPROVALS
- BETA3-APPROVALS
- BROWSER-E2E
- BROWSER-ACCESSIBILITY
- BROWSER-WEBVITALS
- BROWSER-VISUAL

## Execution order
1. Run unrestricted Windows browser gates and import evidence bound to the current production build (external workstation).
2. Use review-packets/reviewer-workspace.html for CHEM-033, PROD-002 and Beta1/2/3 human decisions; import exported JSON files.
3. Connect NOBOOK production access when official partner credentials, HTTPS experiment URL and checksum-pinned SDK artifact are available.
4. Complete CHEM-033 and PROD-002 exact-hash reviews; import reviewer decisions.
5. Complete Beta1/Beta2/Beta3 activity-role review registers and VISUAL-001 review.
6. Run approvals:refresh, fail-closed stable:preflight, then stable:finalize.
