# ADR-P1-004 — Pilot sign-off va renderer boundary

- **Holat:** Qabul qilingan (P1.3). Renderer qismi (§5–§6) **contract taklifi**, implementatsiya emas.
- **Asos:**
  - ADR-P1-003 (+ P1.2 closeout addendum);
  - `docs/plans/p1.4-renderer-foundation-contract.md`;
  - `docs/reviews/p1.3-kill-critic.md`.
- **Buyruqlar:** `npm run pilot:status`, `npm run pending:triage`, `npm run renderer:readiness`. Uchalasi `content:validate` ichida, ya’ni `verify`da ishlaydi.

## 1. Runtime readiness ≠ content approval

| O‘lcham | Kim qaror qiladi | Nimani hal qiladi |
|---|---|---|
| `runtime` (READY/PENDING/DISABLED/BLOCKED) | build (lifecycle + execution plan) | launch |
| `content` (APPROVED/REVIEW_PENDING/REJECTED) | faqat odamlar (hash-pinned approval yozuvlari) | release governance; `REJECTED` → launch yo‘q |
| assessment item (DRAFT/REVIEW_PENDING/APPROVED/RETIRED) | faqat odamlar (ikki mustaqil reviewer, joriy hash) | objective test ko‘rsatiladimi |

- **Practice:** `runtime READY + content REVIEW_PENDING` bo‘lishi mumkin va launch bo‘ladi. Practice faqat practice evidence beradi. `MASTERED` esa approved objective assessment talab qiladi. Production’da approved item 0 ta, demak reachable `MASTERED` 0 ta (test bor).
- **Objective assessment:** `APPROVED`siz o‘quvchiga ko‘rsatilmaydi, attempt va evidence yaratmaydi, mastered’ga olib bormaydi. Reflection fallback ishlaydi.

## 2. Machine validation ≠ human sign-off

- **Pilot holati** — `src/domain/pilot/acceptance.ts` (sof funksiya):
  - `PILOT_BLOCKED` — kamida bitta check FAIL, yoki sign-off eski basis’ga berilgan / yaroqsiz;
  - `CONTENT_REVIEW_PENDING` — FAIL yo‘q, inson check’i kutmoqda (yoki pilot egasi rad etgan);
  - `SIGNOFF_PENDING` — barcha check PASS, lekin inson sign-off’i yo‘q;
  - `PILOT_READY` — barcha check PASS **va** joriy `basisHash`ga inson sign-off’i bor.
- **`technical`** (`TECHNICAL_PASS`/`TECHNICAL_FAIL`) faqat machine check’lardan alohida hisoblanadi. U hech qachon `PILOT_READY`ni bermaydi.
- **Machine check `PENDING` bo‘la olmaydi** (`PILOT_MACHINE_CHECK_PENDING`). Mashina tekshiradi yoki FAIL qiladi. Faqat inson check’i kutadi.
- **Sign-off** (`content-src/pilot-signoffs.json`, bo‘sh):
  - shaxs, `role: pilot-owner`, `signed_off`/`rejected` (rad etishda izoh majburiy), vaqt;
  - `basisHash` = check’lar ro‘yxatining sha256 xeshi. Biror check o‘zgarsa sign-off `STALE` bo‘ladi → `PILOT_BLOCKED`.
  - Avtomatlashtirish identity’lari rad etiladi.
  - Hech bir script bu faylga yozmaydi (guard `HUMAN_APPROVAL_WRITTEN_BY_TOOLING`). Sign-off faqat inson PR’i bilan qo‘shiladi.
- **Dual review:**
  - chemistry + didactic, ikkalasi **joriy** item hash’ida va **ikki xil shaxs**dan;
  - didactic yozuvda outcome mapping bo‘yicha qaror (`confirm`/`reject`/`change_required`), faqat `confirm` → `APPROVED`;
  - tasdiqdan boshqa har qanday qarorga izoh majburiy.

## 3. Pilot acceptance semantikasi

`pilot:status` natijasi `PASS` / `PENDING` / `FAIL`:
- **PENDING (exit 0):** inson review’i kutilmoqda. Bu CI failure emas.
- **FAIL (exit 1):** yaroqsiz route, buzilgan evidence (headless practice o‘quvchi UI buyruqlari bilan), eski approval, noto‘g‘ri outcome/concept mapping, eski sign-off, yetishmayotgan E2E.

Check’lar (4 pilot × ~15):
- **technical:** route, runtime readiness, headless practice (brauzer yo‘li), chemistry model muvofiqligi (javob konfiguratsiyadan emas, valentlik/formula/zarrachalardan mustaqil hisoblanadi), concept mapping, version compatibility;
- **content:** activity review, chemistry review;
- **assessment:** dual review, outcome review, item integrity, stale reviews;
- **mastery:** eligible, no-false-mastery;
- **ux:** accessibility profile, practice E2E, mastery E2E.

**Joriy natija:** 4/4 `TECHNICAL_PASS`, 4/4 `CONTENT_REVIEW_PENDING`, gate `PENDING`.
- `lu.9.15` — golden assessment slice (5 item, hammasi `REVIEW_PENDING`).
- `lu.7.11`, `lu.7.12`, `lu.7.07` — assessment yo‘q (`NOT_APPLICABLE`). Ularga objective assessment sun’iy yaratilmadi.

## 4. Global readiness enforcement kechiktiriladi

- `globalStrictEnforcement.enabled=false` qoladi.
- `reports/pending-activity-triage.json`: 27 activity, 33 unit. Barchasi guided-lab tajribasi (`generic`/`guided-labs` route mavjud).
- Sabablar faqat faktlardan olingan: lifecycle `planned`, release qarori yo‘q, inson review’i yo‘q, accessibility profili yo‘q.
- Chemistry coverage target’lari 100% grounded. `ENGINE_CAPABILITY_MISSING`, `CONFIG_INCOMPLETE`, `INTENTIONALLY_DEFERRED` kuzatilmadi va da’vo qilinmadi.
- **Status avtomatik o‘zgartirilmaydi:** `pending → ready` faqat content egasining yozilgan release qarori bilan.

## 5. Renderer va model ajralishi

- **Qatlamlar:** Chemistry Model → `RendererModel` → Renderer → Intent → Domain.
- **Renderer quyidagilarni hisoblamaydi:** kimyoviy haqiqat, mastery, progress, persistence, readiness/approval.
- **Guard’lar:**
  - `MASTERY_COMPUTED_IN_PRESENTATION`;
  - `READINESS_DERIVED_IN_PRESENTATION` (P1.3);
  - `RENDERER_SELECTED_BY_ACTIVITY_ID` (P1.3, kelajak contract’i: hozir 0 violation, false positive yo‘q).
- Bir `RendererModel` DOM, accessible-text va kelajakdagi canvas/WebGL renderer’lari bilan ishlaydi.
- **Accessibility contract** (keyboard, non-color, screen-reader summary, reduced motion, non-visual alternative) capability ro‘yxatdan o‘tishining **sharti**, keyinga surilmaydi.

## 6. Renderer capability versioning

- Registry `capability id + version` bo‘yicha resolve qiladi, **hech qachon `activityId` bo‘yicha emas**.
- Content pack talab e’lon qiladi (`rendererRequirement: {capability, range}`).
- Build’da mos renderer yo‘q bo‘lsa → readiness `BLOCKED`. Runtime’da ham fail-closed.
- `RendererModel` sxemasi o‘zgarsa major versiya oshadi.
- **Implementatsiya P1.4 da, alohida qaror bilan.**

## 7. P1.3 da topilgan va tuzatilgan xatolar

| # | Xato | Qaror |
|---|---|---|
| 1 | beta2-advanced, beta2-organic va beta3-advanced adapterlari `finalState` qaytarmasdi. 18 ta launchable activity (golden slice lu.9.15 ham) hech qachon `PRACTICE_COMPLETED` bo‘lmasdi, attempt `in_progress`da qolardi, “Mustahkamlashga o‘tish” chiqmasdi. | **Tuzatildi:** adapterlar o‘z hukmidan (`correct`/`achieved`/`complete`) `finalState` qaytaradi. Test va E2E bor. |
| 2 | Mastery ko‘rsatiladigan unit’da dars qatori “Dars: O‘zlashtirilgan” / “Takrorlash kerak” deb mastery so‘zlarini ishlatishi mumkin edi. | **Tuzatildi:** u yerda dars qatori “Test topshirildi” deb yoziladi. |
| 3 | Gidroliz tajribasi (9.14) brauzerda yechilmaydi: UI tuz va muhitni yubormaydi. | **Hujjatlashtirildi, tuzatilmadi:** bu renderer/UI ishi (P1.4, yoki alohida bugfix). `renderer-foundation-readiness` → `CANNOT_SUCCEED`. |
| 4 | lu.7.11, lu.7.12 va lu.7.07 activity’larida chemistry review `not_applicable`, lekin config kimyoviy faktlarni saqlaydi (Al₂O₃, Mr(H₂SO₄)=98, C-14). | **Hujjatlashtirildi:** `content.chemistry-review` detail’ida. Qaror pilot egasiga. Machine check faktlarni mustaqil qayta hisoblaydi (PASS). |
