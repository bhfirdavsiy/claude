# KimyoLab v20 — Reviewer workspace runbook

## 1. Fresh handoff yaratish
Windows:

```bat
scripts\windows\Open_KimyoLab_Reviewer_Workspace.cmd
```

Yoki terminal:

```bash
npm run reviewer:handoff
```

Bu quyidagilarni fresh qiladi:
- CHEM-033 exact-hash target/template;
- PROD-002 exact-hash target/template;
- VISUAL-001 target (browser evidence bo‘lmasa disabled);
- Beta1/Beta2/Beta3 unique activity-role registerlari;
- `review-packets/reviewer-workspace.html`.

## 2. Reviewer workspace
`review-packets/reviewer-workspace.html` offline ochiladi.

Qoidalar:
- global gate qarori `approved` yoki `rejected` bo‘lishi kerak;
- reviewer ID va vaqt majburiy;
- Beta qarorlari activity-role kesimida individual;
- `Approve all` funksiyasi yo‘q;
- workspace repository source fayllarini o‘zgartirmaydi;
- VISUAL-001 unrestricted browser screenshots kelmaguncha disabled.

## 3. Eksport fayllari
Workspace quyidagi nomlarda JSON chiqaradi:
- `CHEM-033-approval.json`
- `PROD-002-approval.json`
- `VISUAL-001-approval.json`
- `beta1-approval-register.json`
- `beta2-approval-register.json`
- `beta3-approval-register.json`

Hammasini bitta return papkaga joylashtirish mumkin.

## 4. Return papkani import qilish
Windows:

```bat
scripts\windows\Import_KimyoLab_Review_Returns.cmd C:\path\to\review-return
```

Importer:
- exact reviewer role tekshiradi;
- version/hash stale bo‘lsa rad etadi;
- Beta activity review hash stale bo‘lsa rad etadi;
- approval override source-of-truth’ni yangilaydi;
- Beta readiness, stable targets/status va tracker’ni refresh qiladi.

## 5. Browser evidence
Browser evidence alohida fail-closed oqimda import qilinadi:

```bat
scripts\windows\Import_KimyoLab_Browser_Evidence.cmd C:\path\to\unpacked-browser-evidence
```

VISUAL-001 faqat shu evidence current production build hashiga mos bo‘lgandan keyin review uchun ochiladi.

## 6. Stable
Faqat barcha required gate PASS bo‘lsa:

```bash
npm run stable:preflight
npm run stable:finalize
```
