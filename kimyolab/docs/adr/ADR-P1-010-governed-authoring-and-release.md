# ADR-P1-010 — Governed authoring va release qarorlari

- **Holat:** qabul qilindi (P1.9). Yangi engine yoki renderer yo‘q. Approval, release yoki sign-off yaratilmadi.
- **Maqsad:** quyidagi oqimni qurish:

```
human decision → governed authoring task → draft content change → re-validation → re-review → explicit release decision
```

Uch holat **mustaqil**:

| Holat | Kim | Qayerda |
|---|---|---|
| REVIEW DECISION | inson (chemistry, didactic) | `content-src/*-reviews.json`, hash bilan bog‘langan |
| AUTHORING STATE | hosila (`deriveAuthoringTasks`) | `reports/authoring-status.json` |
| RELEASE DECISION | inson (`content-owner`) | `content-src/release-decisions.json`, basis hash bilan bog‘langan |

`APPROVED review ≠ avtomatik content o‘zgarishi ≠ avtomatik release`.

## 1. AuthoringTask (`src/domain/governance/authoring-task.ts`)

- **Maydonlar:** `id`, `sourceDecisionId`, `surface` (chemistry, assessment, candidate, activity), `targetId`, `action` (correct, expand, add-source, map-concept, map-outcome, author-candidate, prepare-release), `status`, `basisHash`, `currentHash`, `affectedFiles`, `affectedActivities`, `reviewerDecision`, `reviewerComment`, `priority`, `context`.
- **Id:** `sha256(surface, target, action, basisHash)`. Shu sababli bir xil uchlik uchun ikkinchi task bo‘lmaydi. Hash o‘zgarsa — bu yangi task.
- **Status hech qayerda saqlanmaydi**, faktlardan hosil bo‘ladi:
  - `SUPERSEDED` — shu basis’ga keyinroq boshqa qaror berilgan;
  - `CLOSED` — kontent o‘zgarganidan keyin yangi hash’ga approve/confirm berilgan, yoki reviewer uni o‘zgarishsiz hal qilgan;
  - `SUPERSEDED` — yangi hash’ga yana o‘zgartirish so‘ralgan (yangi task ochiladi);
  - `READY_FOR_REVIEW` — kontent o‘zgargan, lekin yangi hash’ga hali qaror yo‘q;
  - `IN_PROGRESS` — draft mavjud;
  - `OPEN` — qolgan holatlar.
- **Task manbalari:**
  - chemistry `reject`/`change_required` → `correct`;
  - assessment `rejected`/`changes_requested` → `correct`;
  - outcome `reject`/`change_required` → `map-outcome`;
  - `MAPPING_REVIEW_REQUIRED` flag → `map-concept` (reviewer qarori `null`, tavsiya maydoni PLACEHOLDER);
  - nomzodga `accept_for_authoring` → `author-candidate`;
  - maqbul manba yo‘q → `add-source`;
  - release `CHANGE_REQUIRED` → `prepare-release`.

## 2. Draft → preview → apply (`scripts/lib/authoring.ts`, `scripts/authoring.ts`)

- **`authoring:draft`** skeleton yozadi: joriy qiymatlar va har maydon uchun `null`. Tooling kimyo, mapping yoki release qiymatini tanlamaydi.
- **`authoring:preview`** draftni joriy kontentga nisbatan tekshiradi va patch’ni `authoring-output/`ga yozadi. Kontent o‘zgarmaydi.
- **`authoring:apply`**:
  - faqat inson ishga tushiradi; CI/agent muhitida rad etiladi, `author` identity tekshiriladi;
  - bitta ruxsat berilgan fayldagi bitta yozuvni o‘zgartiradi;
  - draft boshqa faylga yoki boshqa yozuvga yo‘naltira olmaydi;
  - taqiqlangan maydonlar: `review`, `reviewStatus`, `approvals`, `lifecycle*`, `id` va boshqalar.
- **Ruxsat berilgan fayllar** (`ALLOWED_FILES`): `content-src/chemistry/*` (5 fayl), `assessment-items.json`, locale nomlari va name provenance.
- **Hech qachon yozilmaydi:** registrlar, `source-registry.json`, `package.json`, `.github/`, `scripts/`, `src/`.
- **Path himoyasi:** absolyut yo‘l, `..`, `\`, `.`, symlink va allowlist’dan tashqari yo‘l rad etiladi.
- Candidate draft faqat preview qilinadi: yangi reaksiya qo‘lda, review qilinadigan PR’da yoziladi.
- Apply’dan keyin hash o‘zgaradi: eski review’lar **STALE** bo‘ladi va yangi review talab qilinadi. Qaysi maydon qaysi hash’ga kirishi `docs/governance/HASH_NORMALIZATION.md`da.

## 3. Manba siyosati (`docs/governance/SOURCE_POLICY.md`)

- **Registry:** `content-src/source-registry.json`. Toifalar: CURRICULUM, TEXTBOOK, OFFICIAL_STANDARD, AUTHORITATIVE_REFERENCE, LOCALIZATION_GLOSSARY, INTERNAL_PROPOSAL.
- **Kimyo haqiqati** va **display tarjima** (nomlar) uchun maqbul toifalar alohida. INTERNAL_PROPOSAL hech qachon yetarli emas.
- **Gate:**
  - `APPROVED_WITHOUT_SOURCE` — FAIL, o‘zgarmagan;
  - yangi FAIL’lar: `APPROVED_WITHOUT_ACCEPTABLE_SOURCE`, `SOURCE_UNREGISTERED`, `NAME_PROVENANCE_MISMATCH`;
  - `SOURCE_NOT_ACCEPTABLE` — PENDING.
- **Nomlar:** `name-provenance.json` (30 yozuv, `sourceRef: null`).
- **Hozir:** faqat `src.curriculum.9.06` maqbul. 127 assertion uchun `add-source` task ochiq.

## 4. Release qarorlari (`src/domain/governance/release-decision.ts`, `scripts/lib/release.ts`)

- **Model:** `ActivityReleaseDecision` — `activityId`, `basisHash`, `decision` (RELEASE, KEEP_PENDING, DISABLE, CHANGE_REQUIRED), `reviewerId`, `role: 'content-owner'`, `decidedAt`, `comment`.
- **`basisHash`** = activity (approvals’siz) + versiya + practice config.
- **Eligibility** — faqat ELIGIBLE yoki NOT_ELIGIBLE. U qaror emas. Shartlar:
  - runtime READY, yoki faqat “release qilinmagan” sababli PENDING;
  - route va renderer mavjud;
  - content APPROVED;
  - accessibility review tugagan;
  - bog‘liq kimyo assertion’lari stale emas.
- **Rad etiladi:** NOT_ELIGIBLE activity’ga RELEASE, eski basis’ga qaror, automation identity, `content-owner`dan boshqa rol, qo‘shimcha maydonlar.
- **Yagona yozuvchi:** `scripts/lib/release.ts` (`review:import` orqali; guard nazorat qiladi).
- **Qaror qayd qilinadi, lekin P1.9 da lifecycle yoki runtime’ni o‘zi o‘zgartirmaydi.** Lifecycle’ni qo‘llash — keyingi bosqich (P2.0).
- Release qarori pilot owner sign-off’ining o‘rnini **bosmaydi**. DAG’da `release-decision` `pilot-ready`ning upstream’ida emas.
- Workbench’ga “Release decisions” tabi qo‘shildi: `content-owner` roli, NOT_ELIGIBLE bo‘lsa RELEASE o‘chiq.
- Packet: `review-packets/release-decisions/` — 27 ta pending activity.

## 5. Hisobotlar (deterministik, `content:validate` ichida)

- `reports/authoring-status.json`: status, sirt, prioritet va activity bo‘yicha.
- `reports/release-decision-status.json`: eligible, not eligible, released, keep pending, disabled, decision missing, stale; pilot ko‘rinishi alohida.
- `reports/human-action-queue.json`: har element uchun rol, `blockedBy` (yashirilmaydi) va bitta `nextHumanAction`.
- `reports/golden-slice-dependency-graph.json`: lu.9.15 uchun DAG, `pendingHuman`, `nextUnblocked`.

## 6. Scope

- Qilinmadi: electrolysis renderer, avtomatik approval yoki release, review’siz kimyo haqiqati, global strict, D9, 3D/WebGL.
- Electrolysis uchun faqat `record.template.json` (kanonik emas) tayyorlandi. `electrolysis.json` o‘zgarmadi.
