# KimyoLab v20 — reviewer handoff va import tartibi

Bu papkadagi fayllar approval'ni avtomatik bermaydi. Reviewer qarorini aniq version va SHA-256 review hash bilan bog'laydi.

## 0. Human Review Workbench (P1.8)
`reviewer-workspace.html` — yagona offline workbench. Tablari: Kimyo KB, Kimyo nomzodlari, Assessment, Pilot sign-off, Global gates, Beta.
1. Reviewer ID va rolni kiriting (`chemistry`, `didactic` yoki `pilot-owner`). Automation identity qabul qilinmaydi.
2. Qaror bering. Rad etish yoki o‘zgartirish so‘rash uchun izoh majburiy.
3. “Qarorlarni eksport qilish” bosing va faylni `review-output/`ga qo‘ying.
4. `npm run review:validate -- review-output/<fayl>.json`: import oldidan ko‘rinish, hech narsa yozmaydi.
5. `npm run review:import -- review-output/<fayl>.json`: faqat inson ishga tushiradi, CI yoki agent muhitida rad etiladi.
6. `npm run review:build`.

Pilot sign-off import qilinmaydi: pilot owner uni `content-src/pilot-signoffs.json`ga PR orqali qo‘shadi. Nomzodlar (`CANDIDATE — NOT PART OF CANONICAL KB`) bo‘yicha qaror bilimlar bazasiga hech narsa qo‘shmaydi. Electrolysis kengaytirish brief’i: `electrolysis-expansion/` (PROPOSED / NEEDS REVIEW).

## 0.1 Authoring va release (P1.9)
- **Authoring tabi** (faqat o‘qish uchun). Vazifalar inson qarorlaridan hosil bo‘ladi: `correct`, `map-concept`, `add-source`, `author-candidate` va boshqalar.
  - Draft: `npm run authoring:draft -- <taskId>`.
  - Tekshiruv: `npm run authoring:preview -- <draft>`.
  - Qo‘llash: `npm run authoring:apply -- <draft>` — faqat inson; CI yoki agent muhitida rad etiladi.
  - Qo‘llangandan keyin eski review’lar STALE bo‘ladi va yangi review kerak.
- **Release decisions tabi** (rol: `content-owner`). Machine eligibility — qaror emas. NOT_ELIGIBLE activity uchun RELEASE o‘chiq. Packet: `release-decisions/`.
- **Manba siyosati:** `docs/governance/SOURCE_POLICY.md`. Maqbul manba bo‘lmasa, approval hisobga olinmaydi.

## 1. Chemistry reviewer — CHEM-033
1. `CHEM-033-review-package.md`ni ko'rib chiqing.
2. `CHEM-033-approval-template.json`ni nusxalang.
3. `status`ni `approved` yoki `rejected` qiling.
4. `reviewerId`, `reviewedAt`, `notes`ni to'ldiring. `reviewerRole`, `reviewedVersion`, `reviewedHash`ni o'zgartirmang.
5. Qaytgan faylni import qiling:
   `npm run approval:import -- CHEM-033 <fayl.json>`

## 2. Didactic reviewer — PROD-002
Xuddi shu tartib `PROD-002-review-package.md` va `PROD-002-approval-template.json` uchun:
`npm run approval:import -- PROD-002 <fayl.json>`

## 3. Beta approval registerlari
`beta1-approval-register.json`, `beta2-approval-register.json`, `beta3-approval-register.json` ichida har bir unique PracticeActivity uchun approval role qatori bor.
Reviewer faqat o'zi ko'rib chiqqan qatorlarda:
- `status`: `approved` yoki `rejected`;
- `reviewerId`;
- `reviewedAt` (ISO vaqt);
- `notes`ni to'ldiradi.

`reviewedVersion` va `reviewedHash` o'zgartirilmaydi. Import:
`npm run beta:approvals:import -- <filled-register.json>`

Import qarorni `content-src/activity-approval-overrides.json`da saqlaydi. Shuning uchun keyingi `content:migrate` approval'ni o'chirmaydi. Activity o'zgarsa hash mos kelmaydi va approval avtomatik stale/pending bo'ladi.

## 4. Browser evidence
Unrestricted Windows kompyuterida:
`scripts\windows\Run_KimyoLab_Browser_Gates.cmd`

Natija `browser-evidence/` va `KimyoLab_v20_Browser_Evidence.zip` bo'ladi. Evidence qaytgach ZIP'ni oching va:
`npm run browser:evidence:import -- <browser-evidence-folder>`

Importer current production build SHA-256, deploy-surface hash, E2E/accessibility/Web Vitals status va screenshot SHA-256 larini tekshiradi. Boshqa build evidence'i rad etiladi.

Browser evidence import qilingandan keyin `VISUAL-001-approval-template.json` qayta generatsiya qilinadi. Visual reviewer screenshotlarni ko'rib chiqib qaror beradi; import:
`npm run approval:import -- VISUAL-001 <visual-approval.json>`

## 5. Har importdan keyin
`npm run approvals:refresh`

Bu Beta readiness, sign-off targetlar, Stable status va tracker'ni qayta hisoblaydi.

## 6. Yakuniy release
Faqat barcha gate GREEN bo'lgach:
`npm run stable:preflight`
`npm run stable:finalize`

Human yoki browser gate'ni qo'lda PASS qilib yozish taqiqlanadi.
