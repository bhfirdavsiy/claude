# ADR-P1-009 — Human Review Workbench va boshqariladigan content promotion

- **Holat:** qabul qilindi (P1.8). Yangi chemistry engine yoki renderer yo‘q.
- **Maqsad:** “testdan o‘tdi” va “mutaxassis tasdiqladi” orasidagi yo‘lni to‘liq boshqarish:

```
machine-valid content → human review → hash-pinned decision → canonical register → derived APPROVED / REJECTED / PENDING → readiness / pilot
```

- **Asosiy qoida:** P1.8 AI’ga approval huquqini bermaydi. U inson qarorini xavfsiz, audit qilinadigan va qulay jarayonga aylantiradi. Inson review bo‘lmasa, kanonik approval’lar 0 bo‘lib qoladi — bu normal holat.

## 1. Mavjud infratuzilma (audit)

| Qism | Fayl | P1.8 da |
|---|---|---|
| Assessment packet + template | `scripts/assessment-review/lib.ts` (`buildPackets`) | qayta ishlatiladi |
| Assessment importer (yagona yozuvchi) | `validateRegister` / `importRegister` | qayta ishlatiladi; noma’lum maydon, ziddiyat va bitta shaxsning ikki roli rad etiladi |
| Chemistry KB packet | `scripts/chemistry-kb.ts` | nomzodlarga `candidateId` va hash qo‘shildi |
| Chemistry importer (yagona yozuvchi) | `scripts/chemistry-review/import.ts` | hash qayta hisoblanadi, maydon/ziddiyat tekshiriladi, nomzod triage’i qo‘shildi |
| Pilot sign-off register | `content-src/pilot-signoffs.json` | hech bir tool yozmaydi (ADR-P1-004) — o‘zgarmadi |
| Reviewer workspace | `review-packets/reviewer-workspace.html` | **kengaytirildi** — yagona workbench |
| Review hash | `assessmentItemHash`, `assertionHash`, `computeReviewHash`, `pilotBasis` | qayta ishlatiladi |
| Automation rad etish | `AUTOMATION_IDENTITY` | qayta ishlatiladi; AI yordamchi nomlari qo‘shildi |

Ikkinchi review tizimi qurilmadi. Yangi approval register ham yo‘q. Yangi register faqat bitta: `content-src/chemistry-candidate-reviews.json`. U **approval emas**, authoring triage uchun (§4). Unga ham faqat mavjud chemistry importer yozadi, guard buni nazorat qiladi.

## 2. Workbench arxitekturasi

- **Bitta sahifa:** `review-packets/reviewer-workspace.html`. Yangi tablar: Kimyo KB, Kimyo nomzodlari, Assessment, Pilot sign-off. Eski Global gates va Beta tablari saqlangan.
- **Model:** `scripts/lib/review-workbench.ts` (`buildWorkbenchModel`) — faqat o‘qiydi; sahifaga JSON sifatida joylanadi.
- **Sahifa:**
  - o‘qiydi, ko‘rsatadi, qaror yig‘adi va qaror faylini **yuklab beradi**;
  - hech narsa yozmaydi;
  - CSP: `connect-src 'none'`; tashqi resurs yo‘q; offline ishlaydi.
- **Registrga yozish:**
  - faqat `npm run review:import`, uni inson ishga tushiradi;
  - mavjud importerlar orqali (`importDecisions`, `importRegister`);
  - all-or-nothing: fayldagi bitta xato butun faylni rad etadi.

## 3. Qaror fayli (`kimyolab.review-decisions.v1`)

```
{schema, exportedAt, workspaceFingerprint, decisions:[
  {surface:'chemistry', assertionId, assertionHash, decision:approve|reject|change_required, reviewerId, reviewerRole:'chemistry', reviewedAt, comment?}
  {surface:'chemistry-candidate', candidateId, candidateHash, decision:accept_for_authoring|reject_candidate|needs_evidence, reviewerId, reviewerRole:'chemistry', reviewedAt, comment?}
  {surface:'assessment', itemId, role, decision:approved|rejected|changes_requested, reviewerId, reviewerRole, reviewedAt, itemHash, itemVersion, evidence:{packet,packetSha256}, outcomeDecision?, comment?}
  {surface:'pilot-signoff', learningUnitId, reviewerId, role:'pilot-owner', decision:signed_off|rejected, signedAt, basisHash, comment?}
]}
```

- Qaror qiymatlari har sirtning mavjud kanonik qiymatlari.
- Approval bo‘lmagan har qaror uchun izoh majburiy.
- `review:validate` import oldidan ko‘rinish beradi va hech narsa yozmaydi. Natija toifalari: `valid`, `stale`, `invalidIdentity`, `unknown`, `missingComment`, `conflicting`, `tampering`, `invalid`.

## 4. Governance qoidalari

- **Hash:** importer joriy hash’ni content’dan **qayta hisoblaydi**. Fayldagi hash faqat solishtiriladi, unga ishonilmaydi.
- **Noma’lum maydonlar** (masalan `status: approved`, `lifecycle`) rad etiladi. Ular jimgina tashlab yuborilmaydi — bu envelope, chemistry, assessment, nomzod va pilot uchun bir xil.
- **Identity:**
  - `AUTOMATION_IDENTITY` endi Claude, ChatGPT, Codex, Copilot, Gemini, bot, CI, script … ni ham ushlaydi.
  - Bu faqat bitta qatlam. Import buyruqlari avtomatlashtirish muhitida (`CI`, `GITHUB_ACTIONS`, `AI_AGENT`, `CLAUDECODE` …) ishga tushmaydi.
  - Asosiy kafolat — importni inson ishga tushiradi va register diff PR’da review qilinadi.
- **Assessment dual review:** chemistry va didactic tasdig‘i ikki **xil** odamdan. Import endi bitta shaxsning ikki rol tasdig‘ini (fayl ichida yoki register bilan birga) rad etadi.
- **Nomzodlar:** `CANDIDATE — NOT PART OF CANONICAL KB`. Nomzod qarori faqat authoring triage. Reaksiya, mahsulot, tur yoki kuzatuv KBga qo‘shilmaydi.
- **CHANGE_REQUIRED / reject:** content o‘zgarmaydi; `reports/review-change-queue.json` keyingi authoring uchun kirish ma’lumoti.
- **Pilot sign-off:**
  - workbench ko‘rsatadi va eksport qiladi, `review:validate` joriy `basisHash` bilan tekshiradi;
  - `SIGNOFF_PENDING`dan oldin berilgan sign-off (`PILOT_SIGNOFF_PREMATURE`) va eski basis rad etiladi;
  - `review:import` sign-off yozmaydi — pilot owner uni PR orqali qo‘shadi.
- **Golden slice:** lu.9.15 `content.chemistry-review` tekshiruvi endi activity bilan birga elektroliz KB yozuvining review holatini ham talab qiladi (avval faqat matnda aytilgan edi).

## 5. Hisobotlar (deterministik, `content:validate` ichida)

- `reports/human-review-status.json`: chemistry, nomzod, assessment, activity va pilot holatlari; import qilingan inson qarorlari soni (hozir **0**).
- `reports/review-change-queue.json`: odam qaytargan elementlar (hozir bo‘sh).
- `reports/review-promotion-impact.json`: **faraziy**, xotirada hisoblanadi. Hamma pending review tasdiqlansa nima o‘zgaradi:
  - 146 activity `content APPROVED`, runtime o‘zgarmaydi;
  - 118 tasi release-ready bo‘ladi, 28 tasi yo‘q (`ACTIVITY_NOT_RELEASED` / disabled);
  - lu.9.15 assessment `AVAILABLE`, MASTERED erishiladigan bo‘ladi;
  - 4 pilot `SIGNOFF_PENDING` holatiga o‘tadi, sign-off baribir inson ishi;
  - 30 ta manbasiz nom assertion’i tasdiqlanmaydi (`APPROVED_WITHOUT_SOURCE`).
- `reports/chemistry-authoring-candidates.json`: 18 nomzod (3 reaksiya, 7 no-reaction, 7 klassifikatsiyasiz, 1 sharoitga bog‘liq), hammasi `canonical:false`.
- `reports/golden-slice-dependencies.json`: lu.9.15 uchun 8 bog‘liqlik, ulardan 6 tasi pending.

CI inson qarori yo‘qligi uchun FAIL qilmaydi, bu holat PENDING. CI tekshiradi: tooling strukturasi, hash determinizmi, register validligi, stale approval’lar, automation reviewer, workbench build.

## 6. Scope

- Qilinmadi (scope’dan tashqari): electrolysis renderer; review’siz yangi reaksiya yoki no-reaction; avtomatik chemistry yoki assessment approval; global strict readiness; D9; 3D/WebGL.
- Electrolysis uchun faqat `review-packets/electrolysis-expansion/` brief bor. U **PROPOSED / NEEDS REVIEW** deb belgilangan, kanonik ma’lumotga tushmagan.
