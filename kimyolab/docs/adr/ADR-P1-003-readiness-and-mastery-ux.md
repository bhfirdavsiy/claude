# ADR-P1-003 — Readiness va Mastery UX (pilot)

- Holat: **Qabul qilingan** (P1.2)
- Asos: ADR-P1-001, ADR-P1-002, `docs/reviews/p1.1-kill-critic.md`
- Pilot: `content-src/learning-pilot.json` — `lu.9.15`, `lu.7.11`, `lu.7.12`, `lu.7.07`

## 1. Readiness authority

Runtime readiness uchun yagona manba — **`LearningActivityReadiness`** (`src/domain/readiness/readiness.ts`). U build vaqtida (`content:pack`) `activity-readiness.json` ga kompilyatsiya qilinadi. Runtime uni faqat o‘qiydi.

Oldin mavjud bo‘lgan kirishlar birlashtirildi:
- `lifecycleStatus`;
- kompilyatsiya qilingan `ActivityExecutionPlan`;
- `effectiveApprovalState` (inson approval’lari, P0 governance).

Yangi parallel taksonomiya yaratilmadi.

| Status | Shart | Launch |
|---|---|---|
| `READY` | lifecycle `ready` + aniq 1 valid plan | ha |
| `PENDING` | valid plan, lekin reliz qilinmagan (`planned`) | strict: **yo‘q**; observe: ha (eski xulq) |
| `DISABLED` | plan yo‘q, reliz qilinmagan | **hech qachon** |
| `BLOCKED` | reliz qilingan, lekin route yo‘q yoki yaroqsiz (nomuvofiq kontent) | **hech qachon** |

**Reason’lar:**
- `ACTIVITY_NOT_RELEASED`
- `ROUTE_NONE`
- `ROUTE_INVALID`
- `ACTIVITY_REVIEW_PENDING`
- `CHEMISTRY_REVIEW_REQUIRED`
- `ASSESSMENT_REVIEW_PENDING`
- `ASSESSMENT_NOT_AVAILABLE`
- `OUTCOME_MAPPING_MISSING`
- `CONTENT_VERSION_INCOMPATIBLE`

UI hech qachon kodni ko‘rmaydi: `readinessMessage()` va `READINESS_MESSAGES` uni lokalizatsiya qilingan matnga aylantiradi.

**Activity review ≠ runtime launch.** Hozirgi katalogdagi 146 ta activity’ning barchasida inson review’i hali kutilmoqda (`activityReviewPending: 146`). Review release governance’ga tegishli: u `releaseReady` va reason sifatida ko‘rsatiladi, lekin launch’ni hal qilmaydi. Aks holda butun ilova bloklanardi.

## 2. Strict va pending

`launchDecision()` — fail-closed launch gate. U uch qatlamda qo‘llanadi:

1. `ContentClient.loadPractice` (`ACTIVITY_NOT_AVAILABLE`);
2. `ReferencePracticeSession`;
3. `PracticeRouter.run(…, readiness)`.

P1.0 dagi sintez qilingan `lifecycleStatus:'ready'` olib tashlandi. Endi session lifecycle’ni canonical readiness’dan oladi, router esa readiness’ning o‘zini tekshiradi. Student model governance maydonlarini (`lifecycleStatus`, `approvals`) olmaydi — P0 invarianti saqlandi.

## 3. Pilot enforcement (C4)

Impact analizi (`reports/readiness-enforcement-impact.json`) shuni ko‘rsatdi: global strict enforcement hozir launch qilinadigan **27 ta pending activity**’ni yopib qo‘yardi. Bular **33 ta unit**’dagi supporting practice’lar (37 ta unit “partially ready”). Shuning uchun:

- **Global enforcement yoqilmadi** (`globalStrictEnforcement.enabled=false`).
- Strict enforcement faqat pilot unit’larga bog‘langan activity’larga qo‘llanadi (4 ta, hammasi `READY`). Qolganlari `observe` rejimida: eski xulq saqlanadi va hisobotda ko‘rinadi.
- `DISABLED` va `BLOCKED` **hamma joyda** yopiq (observe’da ham).

## 4. Mastery bandlari (C1)

| Band | Label | Belgi |
|---|---|---|
| `NOT_STARTED` | Boshlanmagan | ○ |
| `DEVELOPING` | Rivojlanmoqda | ◐ |
| `MASTERED` | O‘zlashtirilgan | ● |
| `NEEDS_REVIEW` | Qayta ko‘rib chiqish kerak | △ |

- Band `MasteryViewModel` orqali ko‘rsatiladi (`src/domain/mastery/view.ts`). Uni orkestrator (`getMasteryView`) canonical `recomputeMastery` dan hosil qiladi. UI `computeConceptMastery` ni chaqirmaydi (guard: `MASTERY_COMPUTED_IN_PRESENTATION`).
- **`MASTERED` sharti:** har bir unit konseptida domain `mastered` bo‘lishi kerak. Bu ≥3 mustaqil manba + assessment evidence (+ talab qilinsa transfer) degani. Bundan tashqari unit’da **tasdiqlangan objective assessment mavjud** bo‘lishi shart. Assessment yo‘q yoki review’da bo‘lsa, band hech qachon `MASTERED` bo‘lmaydi va o‘quvchiga sababi aytiladi.
- **“Nega?”** — `<details>/<summary>` (klaviatura bilan ochiladi). Unda oddiy tilda sabablar yoziladi: urinishlar soni, assessment holati, mustaqil dalillar yetarliligi. Formula, ball, foiz va javob ko‘rsatilmaydi.
- Mastery faqat **pilot** unit’larda ko‘rsatiladi (`reports/mastery-ux-coverage.json`).

## 5. False precision yo‘q

View’da `confidence` yoki foiz yo‘q. Test ham tekshiradi: view JSON’ida kasr sonlar, `%` va `confidence` so‘zi uchramaydi.

## 6. Progress va mastery ajratilgan

- Progress kartasida ikki alohida indikator bor: **`Dars: …`** (lesson achievement, `displayStatus`) va **`O‘zlashtirish: …`** (MasteryViewModel).
- Lesson status hech qachon mastery’ni ko‘rsatmaydi. “Dars: Mustahkamlash bajarildi” va “O‘zlashtirish: Rivojlanmoqda” bir vaqtda turishi mumkin.

## 7. Versiya almashgandagi semantika

- Mastery doim **faol** context’da (`contentVersion`/`scoringVersion`/`curriculumVersion`) qayta hisoblanadi. Eski versiyadagi evidence ko‘rsatilmaydi.
- Evidence faqat eski, mos kelmaydigan versiyada bo‘lsa, `versionUpdated=true` bo‘ladi. Band `NEEDS_REVIEW`, matn: *“Ushbu mavzu yangilangan. Yangi versiya bo‘yicha qisqa tekshiruv kerak.”* “Bilimingiz yo‘qolgan” degan matn hech qachon chiqmaydi (test bor).

## 8. Assessment’ni faqat inson tasdiqlaydi

- **Lifecycle:** `DRAFT → REVIEW_PENDING → APPROVED → RETIRED`.
  - `DRAFT` va `RETIRED` muallif tomonidan yoziladi.
  - **`APPROVED` hech qachon yozilmaydi**, schema buni taqiqlaydi. U faqat `content-src/assessment-reviews.json` dagi yozuvlardan hosil qilinadi.
- **`APPROVED` uchun shartlar:**
  - chemistry **va** didactic yozuvi `approved`;
  - reviewer identity avtomatlashtirish emas (`AUTOMATION_IDENTITY`);
  - yozuv item’ning **joriy** hash’iga qarshi qilingan (kontent o‘zgarsa, approval bekor bo‘ladi);
  - evidence packet sha256 bilan qotirilgan;
  - konsept va outcome bog‘lanishi valid, kalit valid, izoh bor.
- **Tooling:**
  - `assessment:review:pack` — packet’lar va bo‘sh register shabloni. U hech narsani hal qilmaydi.
  - `assessment:review:validate`.
  - `assessment:review:import` — identity, qaror, vaqt yoki evidence bo‘lmasa, qator rad etiladi. Yozuvlar faqat qo‘shiladi.
- **Gate:** `learning:readiness`. Bankdagi `approved` holati inson yozuvisiz bo‘lsa — FATAL.
- **Cheklov:** tooling reviewer’ning inson ekanini kriptografik isbotlay olmaydi. Himoya — avtomatlashtirish identity’larini rad etish, packet hash va PR review jarayoni.
- **Pilot item’lar:** 5 ta, hammasi `REVIEW_PENDING`. Agent birortasini ham approve qilmadi, register bo‘sh (test bor).

## Outcome modeli

Parallel taksonomiya yaratilmadi. Outcome — `LearningUnit.learningOutcomes[n-1]`, id: `<luId>#o<n>`. Build validator tekshiradi:
- outcome mavjud va unit’ga tegishli;
- konsept unit’ga tegishli yoki bog‘langan;
- dublikat yo‘q.

`APPROVED` uchun outcome majburiy; pending item uchun faqat warning. 5 ta pilot item `lu.9.15#o1` ga bog‘landi (unit’ning yagona outcome’i). Packet’da bu “taklif qilingan”, reviewer tasdiqlaydi.

## Rad etilgan alternativalar

| Alternativa | Nega rad etildi |
|---|---|
| Global strict enforcement | Impact: 27 ta ishlayotgan activity va 33 ta unit ta’sirlanadi. |
| Activity approval’ni launch shartiga aylantirish | 146/146 bloklanardi. |
| Foizli mastery ko‘rsatkichi | False precision, TT §24. |
| Assessment’siz 75% → mastered | Minimum evidence qoidasini buzadi. |
| Bank’da `status:"approved"` maydoni | Agent yoki skript uni yozib qo‘yishi mumkin. Approval yozuvdan hosil qilinishi kerak. |

## Qolgan cheklovlar

- D9 (configurable learning-cycle), server-side evaluation, reviewer’ning insonligini kriptografik tasdiqlash.
- Pilot’dan tashqari unit’larda mastery UX yo‘q.
- 5 ta item inson review’ini kutmoqda.

## Addendum — P1.2 closeout: ikki readiness o‘lchami

`LearningActivityReadiness` endi ikki mustaqil o‘lchamga ega. Yagona `status` so‘zi yo‘q.

| O‘lcham | Qiymatlar | Manba | Nimani hal qiladi |
|---|---|---|---|
| `runtime` | `READY`/`PENDING`/`DISABLED`/`BLOCKED` | lifecycle + execution plan | launch (strict/observe) |
| `content` | `APPROVED`/`REVIEW_PENDING`/`REJECTED` | hash-pinned inson approval’lari (`effectiveApprovalState`) | release governance; `REJECTED` → launch yo‘q |

- **Nega `REVIEW_PENDING` practice launch’ni bloklamaydi.**
  - Katalogdagi 146 activity’ning hammasi review kutmoqda. Bloklash butun ilovani yopardi.
  - Practice faqat practice evidence yaratadi. `MASTERED` esa **APPROVED objective assessment**ni talab qiladi.
  - Shu sabab review’dan o‘tmagan practice o‘quvchiga “o‘zlashtirilgan” holatini bera olmaydi.
- **Objective assessment uchun** inson `APPROVED` qarori majburiy. Pending item:
  - ko‘rsatilmaydi;
  - attempt ham, evidence ham yaratmaydi;
  - reflection fallback ishlaydi.
- **`isReleaseReady(r)`** = `runtime READY ∧ content APPROVED`. Faqat hisobot uchun, launch gate emas.
- **Assessment governance (qo‘shimcha).**
  - Chemistry va didactic approval’ni **ikki xil shaxs** beradi. Bir odam ikkala rolda ko‘rib chiqishi mumkin, lekin bitta item uchun ikkalasini tasdiqlay olmaydi.
  - Didactic reviewer outcome mapping bo‘yicha `confirm`/`reject`/`change_required` qarorini beradi.
  - Tasdiqdan boshqa har qanday qaror izoh talab qiladi.
