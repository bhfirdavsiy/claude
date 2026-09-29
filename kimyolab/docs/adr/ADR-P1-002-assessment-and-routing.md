# ADR-P1-002 — Assessment integrity va canonical routing

- Holat: **Qabul qilingan** (P1.1)
- Asos: ADR-P1-001, `docs/reviews/p1.0-kill-critic.md`, baseline qarzlari C2, C3 va D8
- Tartib: **C3 → D8 → C2**. Assessment UI’ga answer model to‘g‘rilanmasdan ulanmadi. Aks holda mavjud latent leak foydalanuvchiga ko‘rinadigan leak’ka aylanardi.

## 1. AssessmentPrompt va AssessmentKey (C3)

Muallif yozgan bank (`content-src/assessment-items.json`) endi to‘g‘ridan-to‘g‘ri yetkazilmaydi. `content:pack` uni ikki qatlamga ajratadi:

| Qatlam | Fayl | Tarkibi | Kim o‘qiydi |
|---|---|---|---|
| `AssessmentPrompt` | `assessment/prompts.json` | `id`, `learningUnitId`, `stem`, `options`, `conceptIds`, `outcomeIds`, `version`, `review` | UI model (`toPromptView`: faqat `id`, `stem` va `options`) |
| `AssessmentKey` | `assessment/keys.json` | `itemId`, `correctOptionId`, `scoringRule`, `explanation` | faqat canonical evaluator, `AssessmentContentSource` port orqali |

- `validatePromptPack` prompt ichidagi har qanday ortiqcha maydonni rad etadi (`ASSESSMENT_PROMPT_LEAKS_FIELD`, fail-closed).
- Architecture guard (`ASSESSMENT_KEY_IN_PRESENTATION`) `src/features/**` va `bootstrap.ts` da key tiplari, evaluator va `correctOptionId` ishlatilishini taqiqlaydi.
- Key pack **faqat submission paytida** yuklanadi (`ContentClient.loadAssessmentForEvaluation`). Sahifa yuklanganda yuklanmaydi va hech qachon view model’ga tushmaydi.

## 2. Local-first cheklovi

KimyoLab static, local-first client. Ikki daraja aniq ajratiladi:

- **UI confidentiality — ta’minlangan.** Javob kaliti quyidagilarda tasodifan ko‘rinmaydi:
  - DOM;
  - UI model;
  - `window` global’lari;
  - sahifa yuklanishidagi network payload.

  Bu E2E testlar va guard bilan tekshiriladi.
- **Exam-grade secrecy — kafolatlanmaydi.** Static va standalone deployment’da `assessment/keys.json` baribir client yeta oladigan asset. Standalone HTML barcha pack fayllarini o‘z ichiga oladi. Texnik foydalanuvchi bundle yoki pack’ni tahlil qilib javobni topishi mumkin.

To‘g‘ri atama — **“answer-key exposure reduced / UI-separated”**, “answer leak fixed” emas.

High-stakes secure assessment server-side evaluation talab qiladi. Model bunga tayyor: key alohida fayl, evaluator esa `AssessmentContentSource` port orqali ishlaydi. Server deployment `keys.json` ni public asset sifatida bermasligi va evaluatsiyani serverda bajarishi mumkin. Bu hozir amalga oshirilmagan (P1.1 scope’idan tashqari).

## 3. Evaluator egasi

Canonical `evaluateAssessment` (`src/domain/assessment/evaluator.ts`) — pure domain funksiyasi: `AssessmentResponse + AssessmentKey → AssessmentEvaluation`.

- **UI.** UI faqat `{itemId, selectedOptionId}` yuboradi. U correct/incorrect hisoblamaydi va kalitni ko‘rmaydi. Javobda faqat item bo‘yicha to‘g‘ri/noto‘g‘ri va umumiy son qaytadi, to‘g‘ri variant oshkor qilinmaydi.
- **Fail-closed holatlar:** javob yo‘q, dublikat javob, noma’lum item, yaroqsiz variant, kalit yo‘q, konseptga bog‘lanmagan item, item yo‘q.

## 4. Assessment attempt va evidence egasi (C2)

Yangi parallel tarix modeli yaratilmadi: mavjud `Attempt` va `PersistedEvidence` qayta ishlatildi.

- `Attempt.attemptType: 'practice' | 'assessment'` (ixtiyoriy maydon; yo‘q bo‘lsa — practice, P1.1 dan oldingi yozuvlar).
- Assessment attempt:
  - `activityId = assessment.<lu>`;
  - `activityVersion` = bank versiyasi;
  - `startedAt` = assessment ochilgan vaqt (`BEGIN_ASSESSMENT`);
  - `completedAt` = submittedAt;
  - `contentVersion`, `scoringVersion`, `curriculumVersion`.
- Evidence: har item × concept uchun bitta `concept-assessment` answer. Provenance maydonlari:
  - `activityId` (assessmentId);
  - `questionId` (itemId);
  - `itemVersion`;
  - `response` (tanlangan variant);
  - `attemptId`;
  - `contentVersion`, `activityVersion`, `scoringVersion`;
  - `conceptId`;
  - `createdAt`.

  Yangi maydonlar faqat audit uchun zarur bo‘lganlari: `response` va `itemVersion`.
- **Noto‘g‘ri javob ham evidence.**
- Oqim: `UI response → LearningOrchestrator.submitAssessment → evaluateAssessment → evidence drafts → recordAttempt (immutable) → ASSESSMENT_SUBMITTED → scoreAssessment → ASSESSMENT_EVALUATED → recomputeMastery → MASTERY_UPDATED`.
- **Retry.** Retry doim yangi attempt. Topshirilgan attempt o‘zgarmaydi. Bir sessiyani qayta topshirish `ASSESSMENT_ALREADY_SUBMITTED` bilan rad etiladi.
- **Topshirilmagan assessment.** Attempt ham, evidence ham qoldirmaydi (P1.0 dagi Variant B bilan izchil).
- **Headless adapter.** `LearningRunner` engine baholagan draft’larni `submitAssessmentEvidence` orqali topshiradi. Ikkala yo‘l ham bitta xususiy `recordEvaluatedAssessment` ga keladi.
- **Reflection ≠ objective assessment.** Reflection faqat `REINFORCEMENT_COMPLETED` beradi: 0 evidence, 0 attempt. Sikl uchun 3-bosqichni reflection **yoki** baholangan objective assessment yopadi (`isConsolidationStageComplete`), lekin bu ikki fakt alohida qoladi.
- **C1 o‘chiq.** Mastery qayta hisoblanadi, lekin `displayStatus` `mastered` va `needs_review` ni ko‘rsatmaydi (`USER_VISIBLE_MASTERY=false`). Progress sahifasida “Test topshirildi” chiqadi.

## 5. Routing canonicalization (D8)

**Oldin:** activity ikkita mustaqil kalit orqali yuborilardi:
- `activity.type` (engine);
- `configFamily` — runtime’da qaysi config faylida birinchi topilgan bo‘lsa, o‘sha (first-match).

Bu ikki kalit bir-biriga zid bo‘lishi mumkin edi, dublikat esa jim yutilardi.

**Keyin:**

```ts
interface ActivityExecutionPlan {
  activityId: string;
  engine: 'experiment'|'simulation'|'trainer'|'calculation'|'case';
  runtime: 'reference-slice'|'generic'|'beta2-advanced'|'beta2-organic'|'beta3-advanced';
  capability: string;      // slice id | capability | task — runtime e’lon qilgan to‘plamdan
  configSource: ConfigSource; // yagona config manbai
  configVersion: string;
}
```

Oqim: `content → compileExecutionPlans() (content:pack) → execution-plans.json → resolveExecutionPlan() → ReferencePracticeSession (runtime) → PracticeRouter (engine)`.

- **Build-time xatolar:**
  - `ROUTE_CONFLICT` — ikki manba;
  - `CONFIG_ENGINE_MISMATCH` — `type` va config zid;
  - `ENGINE_UNKNOWN`;
  - `CAPABILITY_UNKNOWN` — runtime e’lon qilgan to‘plamda yo‘q;
  - `CONFIG_INVALID`;
  - release qilingan activity uchun `ROUTE_NONE`.
- **Runtime:** plan faqat o‘qiladi, taxmin qilinmaydi. Noma’lum runtime (`EXECUTION_RUNTIME_UNKNOWN`), plan va activity nomuvofiqligi, yo‘q yoki dublikat plan — barchasi fail-closed. `PracticeRouter` plan tasvirlamagan activity’ni rad etadi (`EXECUTION_PLAN_MISMATCH`). U progress, attempt, persistence yoki mastery’ni boshqarmaydi.
- **Assessment `PracticeRouter` ga kirmaydi.** Assessment practice engine emas, u orkestratorning alohida domain imkoniyati.

## 6. Legacy routing migratsiyasi

- Manba format buzilmadi: `practice-activities.json` (`type`) va `activity-configs/*.json` o‘z joyida qoldi.
- `deriveActivityExecutionPlan()` — legacy adapter. U faqat build vaqtida ishlaydi va aniq bitta plan chiqaradi.
- Canonical runtime ichida ikkinchi routing tizimi qolmadi: `configFamily` page model, session va UI model’dan olib tashlandi. Guard `LEGACY_ROUTING_KEY` uning qaytishini taqiqlaydi.
- Legacy manba nomlari faqat `plan.configSource` sifatida audit/provenance uchun saqlanadi.

## Rad etilgan alternativalar

| Alternativa | Nega rad etildi |
|---|---|
| Kalitni prompt JSON’da qoldirib, faqat UI’da yashirish | Kalit view model va network payload’ga tushadi. Guard buni kafolatlay olmaydi. |
| Javobni hash qilish (`sha256(optionId)`) | 4 variant uchun darhol brute-force qilinadi — soxta xavfsizlik. |
| Assessment’ni `PracticeRouter` engine sifatida qo‘shish | Assessment attempt/evidence semantikasi practice’dan farq qiladi. Engine interfeysi response/key ajratilishini ifodalamaydi. |
| `configFamily` ni saqlab, qo‘shimcha plan qo‘shish | Ikki routing tizimi qoladi. TT buni aniq taqiqlaydi. |
| Assessment uchun alohida attempt store | Mavjud Attempt/Evidence yetarli. Yangi tarix modeli migratsiya va parity xarajatini keltiradi. |

## Oqibatlar va cheklovlar

- **Bugungi kontent:** bankdagi barcha 5 ta pilot item `pending`. Shuning uchun production’da 3-bosqich reflection bo‘lib qoladi. Objective oqim approve qilingan item’lar bilan yoqiladi. Unit/integration testlar va qayta muhrlangan pack’li E2E test bilan isbotlangan.
- **Readiness baseline:** `reports/assessment-runtime-readiness.json` va `reports/activity-routing.json` P1.2 uchun asos. Hech narsa enforce qilinmaydi (C4 deferred).
- **Kechiktirilganlar:** C1 (ko‘rinadigan mastery), C4 (readiness enforcement), D9 (configurable learning-cycle), server-side evaluation.
