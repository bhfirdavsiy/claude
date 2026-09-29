# Phase 11 → Phase 12 external sign-off protocol

Status: **READY FOR HUMAN / REAL-BROWSER EVIDENCE**

The technical RC is green. No external approval is auto-created or inferred.

## 1. Chemistry expert review — CHEM-033
1. Review `docs/approvals/CHEM-033-review-package.md` and the chemistry corpus.
2. Run `npm run signoff:targets`.
3. Copy the current CHEM-033 `version` and `hash` from `reports/stable-signoff-targets.json`.
4. After a real review, update `reports/chemistry-expert-approval.json` with reviewer ID, role, reviewed version/hash, timestamp and status.
5. Run `npm run chemistry:validate`.

Any chemistry content/hash change invalidates the approval automatically.

## 2. Didactic/content representation review — PROD-002
1. Review curriculum mappings, representation coverage and review notes.
2. Run `npm run signoff:targets`.
3. Copy the current PROD-002 `version` and `hash` from `reports/stable-signoff-targets.json`.
4. After real review, update `reports/product-didactic-approval.json`.

Any reviewed content change invalidates the approval automatically.

## 3. Beta approvals
Beta readiness is derived from the approval records embedded in practice activities. Stable requires:
- Beta1: 47/47 release-ready;
- Beta2: 53/53 release-ready;
- Beta3: 22/22 release-ready;
- pending approval count = 0.

Do not bulk-mark approvals without actual review.

## 4. Real-browser evidence
Update `reports/browser-gates.json` only from executed evidence for:
- Vite production build;
- E2E;
- visual regression;
- accessibility/WCAG/axe;
- Web Vitals / long-task verification.

## 5. Final command

```bash
npm run stable:preflight
```

Phase 12 may be declared only when it exits successfully and `reports/stable-preflight.json` reports `stableReady: true`.
