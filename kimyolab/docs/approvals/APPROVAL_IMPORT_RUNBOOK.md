# Approval / browser evidence return runbook

## Gate approvals
CHEM-033, PROD-002 yoki VISUAL-001 uchun reviewer exact generated template'dan foydalanadi.
Import:

```text
npm run approval:import -- CHEM-033 reviewer-file.json
npm run approval:import -- PROD-002 reviewer-file.json
npm run approval:import -- VISUAL-001 reviewer-file.json
```

Windows helper:

```text
scripts\windows\Import_KimyoLab_Gate_Approval.cmd CHEM-033 reviewer-file.json
```

Importer gate id, reviewer role, version, hash va reviewedAt'ni tekshiradi. Oldingi version/hash rad etiladi.

## Beta approvals
Reviewer `review-packets/beta1-approval-register.json`, `beta2-approval-register.json` yoki `beta3-approval-register.json`ni to'ldiradi.
Faqat review qilingan qatorlar `approved` yoki `rejected` qilinadi. `reviewedVersion` va `reviewedHash` o'zgartirilmaydi.

```text
npm run beta:approvals:import -- filled-register.json
```

Qarorlar `content-src/activity-approval-overrides.json`da source-of-truth sifatida saqlanadi. `content:migrate` ularni o'chirmaydi; activity content o'zgarsa effective approval stale/pending bo'ladi.

## Browser evidence
Unrestricted Windows workstation:

```text
scripts\windows\Run_KimyoLab_Browser_Gates.cmd
```

Qaytgan `browser-evidence` papkasini import:

```text
npm run browser:evidence:import -- browser-evidence
```

Importer production-build SHA-256, deploy-surface SHA-256, E2E/accessibility/Web Vitals status va screenshot SHA-256'larini tekshiradi. Visual screenshots import qilinadi, ammo VISUAL-001 avtomatik approved bo'lmaydi.

## Refresh va final release

```text
npm run approvals:refresh
npm run stable:preflight
npm run stable:finalize
```

`stable:finalize` faqat barcha gate PASS bo'lsa immutable Stable bundle yaratadi.
