# P1 — Canonical Learning Runtime: architecture baseline

Holat: **tahliliy hujjat, kod o‘zgarishi yo‘q.** Asos: P0 Integrity Release tag `kimyolab-p0-integrity-20.1.0`
(merge commit `57bbf83e7673c0998ae9a69b40a8fe478fbbfd3e`). Maqsad — `LearningRunner`, `BrowserProgressService` va UI’ga xos orkestratsiya
orasidagi real overlap va konfliktni kod darajasida xaritalash, P1.0 refactor chegarasini belgilash.

Hujjatdagi har bir da’vo quyidagi fayl/qatorlarga tayanadi (P0 freeze holati):

| Komponent | Fayl |
|---|---|
| LearningRunner | `src/runtime/learning-runner/runner.ts` |
| BrowserProgressService | `src/features/progress/service.ts` |
| ProgressReducer | `src/runtime/progress/reducer.ts`, `migrations.ts`, `types.ts` |
| PracticeRouter | `src/runtime/practice-router/router.ts` (+ `reference-slices/index.ts`, `beta1/router.ts`, `beta2/*`, `beta3/*`) |
| ConceptMastery | `src/domain/mastery/mastery.ts` |
| Assessment flow | `src/domain/assessment/scoring.ts`, `features/learning-hub/model.ts` (`reinforcementQuiz`), `features/learning-hub/render.ts` (`renderLearningQuiz`) |
| bootstrap | `src/app/bootstrap.ts` |
| learning page | `features/learning-hub/{model,render}.ts` |
| practice page | `features/practice/{model,session,render,ui-model}.ts` |
| progress page | `features/progress/{model,render}.ts` |

---

## 1. Ikki parallel runtime — asosiy topilma

KimyoLab’da **ikkita mustaqil learning runtime** bor va ular bir-birini chaqirmaydi:

```
A) LearningRunner (canonical, headless)                 B) Browser runtime (haqiqatda ishlaydigan)
   runner.run(luId, ctx)                                    bootstrap.renderCurrent()
    ├─ repository.getLearningUnit/Mapping/Theory/Practice    ├─ ContentClient.loadLearningHub / loadPractice
    ├─ progress OPEN → save                                   ├─ /learn/:id/guide  → markGuideComplete
    ├─ PracticeRouter.run(activity, ctx)  [type bo‘yicha]     ├─ /practice/:id     → ReferencePracticeSession.apply
    ├─ bindEvidenceToAttempt + recordAttempt                  │                      (configFamily bo‘yicha router)
    ├─ SAVE_ACTIVITY_STATE, PRACTICE_COMPLETE → save          │                     → recordPracticeResult(session)
    ├─ assessmentRunner(unit) → evidence → Attempt            ├─ /learn/:id/quiz   → recordReinforcement(payload)
    ├─ scoreAssessment → saveAssessment                       └─ /progress         → listProgress → view model
    ├─ ASSESSMENT_COMPLETE
    ├─ computeConceptMastery(unit.conceptIds) → saveMastery
    └─ MASTERY_UPDATED → status mastered|needs_review → save
```

- `LearningRunner` **faqat testlarda** ishlatiladi (8 ta test fayli: phase3/5/7/9/10 E2E). `src/` ichida uni hech kim
  chaqirmaydi. U “canonical” deb nomlangan, lekin o‘quvchi hech qachon undan o‘tmaydi.
- Brauzerdagi haqiqiy oqim `bootstrap.ts` dagi route `if`-zanjiri, `BrowserProgressService` metodlari va render
  callback’larida tarqalgan. Bitta state machine yo‘q.
- Natija: runner testlari “Theory → Practice → Evidence → Assessment → Mastery” zanjirini isbotlaydi, ammo
  bu zanjir productionda **mavjud emas** (quyida 4-bo‘lim).

## 2. Komponentlar bo‘yicha mas’uliyat matritsasi

| Komponent | State yaratadi | State o‘zgartiradi | Persistence | Evidence yaratadi | Mastery hisoblaydi |
|---|---|---|---|---|---|
| **LearningRunner** | `createProgress` (yo‘q bo‘lsa) | `reduceProgress`: OPEN, SAVE_ACTIVITY_STATE, PRACTICE_COMPLETE, ASSESSMENT_COMPLETE, MASTERY_UPDATED | `store.saveProgress` ×3/run, `recordAttempt` ×2, `saveAssessment`, `saveMastery` | yo‘q (engine draft’larini `bindEvidenceToAttempt` bilan bog‘laydi) | ha — `unit.conceptIds` bo‘yicha, context = runner versiyalari |
| **BrowserProgressService** | `createProgress` (3 joyda takrorlangan) | `reduceProgress`: OPEN, SAVE_ACTIVITY_STATE, PRACTICE_COMPLETE, ASSESSMENT_COMPLETE (MASTERY_UPDATED **hech qachon**) | `saveProgress`, `recordAttempt`/`appendAttemptEvidence`, `saveMastery` | yo‘q (bog‘laydi, session bo‘yicha dedupe) | ha — faqat *yangi dalil* konseptlari bo‘yicha, context = page versiyalari |
| **ProgressReducer** | `createProgress` | sof funksiya | yo‘q | yo‘q | yo‘q (faqat `MASTERY_UPDATED` statusni xaritalaydi) |
| **PracticeRouter** | yo‘q | yo‘q | yo‘q | adapter orqali (engine) | yo‘q; `lifecycleStatus!=='ready'` → `ACTIVITY_NOT_READY` |
| **ReferencePracticeSession** | o‘z ichki `context.inputs` | har buyruqda input to‘playdi, routerni **butun inputda qayta** ishlatadi | yo‘q | ha (router orqali, kumulyativ) | yo‘q |
| **ConceptMastery** | — | — | — | — | `computeConceptMastery` (runner, service, `concept-migration.ts`) |
| **Assessment flow** | runner: `scoreAssessment`; brauzer: quiz UI ichida `correct++` | brauzer: `recordReinforcement` → ASSESSMENT_COMPLETE | runner: `assessmentAttempts`; brauzer: faqat `activityStates['cycle.reinforcement']` JSON | runner: ha; **brauzer: yo‘q** | runner: ha; **brauzer: yo‘q** |
| **bootstrap** | `ContentClient`, `BrowserProgressService`, `attemptSession` | route bo‘yicha servis metodlarini chaqiradi | servis orqali | yo‘q | yo‘q (bilvosita, servis orqali) |
| **learning page** | `CycleSnapshot` (servisdan) | `onComplete` / `onSubmit` callback | servis orqali | yo‘q | yo‘q |
| **practice page** | `buildPracticeUiModel` | `session.apply` | `onResult` → servis | engine | yo‘q |
| **progress page** | `buildProgressViewModel` | yo‘q | yo‘q | yo‘q | yo‘q (statusni `activityStates` dan qayta chiqaradi) |

## 3. Takrorlangan eventlar va parallel invariantlar

| # | Takrorlanish | Joylar | Xavf |
|---|---|---|---|
| D1 | “Practice tugadimi?” predikati | `service.ts:isComplete`, `practice/render.ts:isResultComplete` | Ikki nusxa ajralib ketsa UI “tugadi” deydi, progress esa yo‘q (yoki aksincha) |
| D2 | `truthyState` (activityStates JSON’ni o‘qish) | `service.ts`, `progress/model.ts` | Bir xil format ikki joyda parse qilinadi |
| D3 | “qaysi statuslar practice/reinforcement tugagan” to‘plamlari | `service.ts:getCycleSnapshot`, `progress/model.ts` (resumeHref) | Status qo‘shilsa ikki joyda yangilash kerak |
| D4 | `createProgress → OPEN → …` boshlang‘ich ketma-ketligi | runner (1), service (3 metod) | 4 ta nusxa |
| D5 | Attempt chegarasi | runner: “bitta run = practice attempt + assessment attempt”; brauzer: “bitta sahifa = bitta attempt” | Ikki xil semantika bitta store’ga yoziladi |
| D6 | Mastery qayta hisoblash doirasi | runner: `unit.conceptIds`; service: faqat yangi dalil konseptlari | Bir xil evidence’dan turli mastery keshlari |
| D7 | Versiya konteksti manbai | runner: konstruktor opsiyalari; service: `page.contentVersion/scoringVersion/curriculumVersion` + `setVersionPolicy` | Ikki manba; runner’da `versionPolicy` pack manifestdan olinmaydi |
| D8 | Practice dispatch kaliti | `PracticeRouter`: `activity.type`; `ReferencePracticeSession`: `configFamily` (8 oila, 8 ta if-shox) | Yangi engine/renderer qo‘shish ikki joyni o‘zgartiradi |
| D9 | Learning cycle bosqichlari | `content-src/learning-cycle.json` (stages, policies) — runtime **o‘qimaydi**; `routes.ts` va `learning-hub/render.ts` da hardcode | Kontent kontrakti va runtime ajralgan (TT P1.2 flexible flow’ga to‘siq) |

## 4. Aniqlangan konfliktlar (xulq-atvor farqi)

| # | Konflikt | Dalil | Oqibat |
|---|---|---|---|
| C1 | **Brauzerda mastery hech qachon progress statusiga ta’sir qilmaydi.** Runner `MASTERY_UPDATED` yuboradi; servis yubormaydi. | `runner.ts` vs `service.ts` | `mastered` / `needs_review` statuslari brauzerda erishib bo‘lmaydi; progress sahifasidagi LABELS’ning 2 tasi o‘lik |
| C2 | **Brauzer assessment’i evidence emas.** Objective quiz UI ichida baholanadi, natija faqat `activityStates['cycle.reinforcement']` JSON’ida; `scoreAssessment`, `assessmentAttempts`, mastery ishlatilmaydi. | `learning-hub/render.ts:renderLearningQuiz`, `service.recordReinforcement` | Assessment mastery’ga kirmaydi; `learning-cycle.json → masteryRequiresValidatedEvidence:true` siyosati amalda bajarilmaydi |
| C3 | **Assessment javobi brauzerga oqadi.** `reinforcementQuiz.items[].correctOptionId` student modelga uzatiladi va klientda solishtiriladi. | `learning-hub/model.ts:95` | TT §13 “assessment javobi leak” lint holati; hozir barcha 5 item `pending` bo‘lgani uchun UI’da ko‘rinmaydi (latent) |
| C4 | **Readiness gate brauzerda chetlab o‘tiladi.** `ReferencePracticeSession` `PracticeActivity` ni sintez qiladi: `lifecycleStatus:'ready'`, `approvals:{}`, `range:'*'`, `conceptIds=[config.conceptId]`. | `practice/session.ts:91-95` | `PracticeRouter` ning `ACTIVITY_NOT_READY` himoyasi brauzerda ishlamaydi; evidence konsepti content’dagi `conceptIds` emas, config’dagi bitta konsept |
| C5 | **Assessment ↔ reinforcement statusi.** Brauzer `recordReinforcement` reflection’da ham `ASSESSMENT_COMPLETE` beradi. | `service.ts` | “assessment_complete” statusi haqiqiy baholashni anglatmaydi |
| C6 | **Attempt semantikasi ikki xil** (D5). | runner vs `beginPracticeSession` | P1 Mastery UI “nechta urinish” ko‘rsatsa, manbaga qarab ma’no o‘zgaradi |
| C7 | `concept-migration.ts` mastery’ni kontekstsiz hisoblaydi (faqat scoring bo‘yicha filtr). | `progress/concept-migration.ts` | Konsept split/merge’da versiya aralashishi mumkin (hozir faqat testlarda ishlatiladi) |
| C8 | Progress yozuvida read-modify-write poygasi: bir vaqtda ikki callback (masalan, tez-tez practice buyruqlari) `loadProgress → reduce → saveProgress` ni parallel bajarsa, oxirgisi g‘olib. | `service.ts` | `activityStates` yo‘qolishi mumkin (evidence emas — u append-only) |

## 5. Canonical / adapter / olib tashlash xaritasi

| Kod | P1’dagi roli |
|---|---|
| `ProgressReducer` (`reduceProgress`, `createProgress`, migrations) | **Canonical** — orkestratorning yagona state o‘tish funksiyasi bo‘lib qoladi; eventlar ro‘yxati TT P1.1 state machine’iga kengaytiriladi |
| `evidence/types.ts` (Attempt, bind*, draftSignature), `IndexedDbProgressStore` | **Canonical persistence** — o‘zgarmaydi (P0 freeze) |
| `computeConceptMastery` + `MasteryContext` | **Canonical** — yagona chaqiruv joyi orkestrator bo‘ladi |
| `PracticeRouter` + adapterlar (`reference-slices`, `beta1/2/3`) | **Canonical dispatch** — lekin kalit `type` + capability (configFamily ichkariga yashiriladi) |
| `LearningRunner` | **Orkestratorga aylanadi** (`LearningOrchestrator`): headless yadro; `run()` monoliti bosqichlarga (`openUnit`, `completeTheory`, `applyPracticeCommand`, `submitAssessment`, `updateMastery`) bo‘linadi |
| `BrowserProgressService` | **Storage/adapter** (TT P1.1: “storage adapter roliga tushiriladi”) — `recordPracticeResult`, `markGuideComplete`, `recordReinforcement` orkestrator komandalariga delegatsiya qiladi; o‘zi `reduceProgress` chaqirmaydi |
| `ReferencePracticeSession` | **Adapter** — engine session; `PracticeActivity` sintezi olib tashlanadi, content’dagi haqiqiy activity (readiness bilan) ishlatiladi |
| `bootstrap.ts` route shoxlari | **UI adapter** — faqat route → orkestrator komandasi → render |
| `isResultComplete` (render), `truthyState` ×2, status to‘plamlari ×2 | **Olib tashlanadi** → orkestratorning bitta `selectors` moduli |
| Klientdagi quiz baholash (`correct++`) | **Olib tashlanadi** → assessment evidence + `scoreAssessment` (javob kaliti studentga yuborilmaydi) |
| `learning-cycle.json` | **Canonical config** — hardcode qilingan bosqichlar o‘rniga o‘qiladi (P1.2 uchun asos) |

## 6. P1.0 — tavsiya etilgan minimal refactor scope

Maqsad: **bitta orkestrator, xulq-atvor o‘zgarmasdan** (renderer, simulation, UI redesign yo‘q).

1. `src/runtime/learning-orchestrator/` — `LearningRunner` dan ajratib olingan headless state machine:
   `openUnit`, `completeTheory`, `applyPracticeResult(session)`, `submitReinforcement`, `recomputeMastery`.
   Faqat `reduceProgress` + store + `computeConceptMastery` ni chaqiradi. Evidence semantikasi — P0’dagi
   `beginPracticeSession` modeli (bitta sahifa = bitta attempt).
2. `LearningRunner.run()` orkestrator bosqichlari ustidagi yupqa kompozitsiyaga aylanadi (mavjud 8 E2E test o‘zgarmay o‘tishi kerak).
3. `BrowserProgressService` orkestratorga delegatsiya qiladi; public API saqlanadi (bootstrap o‘zgarishi minimal).
4. Selektorlar bitta modulda: `isPracticeComplete`, `readCycleState`, `STATUS_GROUPS` (D1–D3 yopiladi).
5. Paritet testi: bir xil kirish ketma-ketligi runner va brauzer servisi orqali bir xil progress/attempt/mastery beradi.

P1.0 ga **kirmaydi** (keyingi bosqichlar, alohida qaror kerak): C1 (brauzerda MASTERY_UPDATED yoqish — o‘quvchiga
ko‘rinadigan xulq o‘zgarishi), C2/C3 (assessment’ni evidence’ga aylantirish — P1.11), C4 (readiness gate —
hozir brauzerda ishlayotgan activity’lar `planned` bo‘lishi mumkin, yoqish ularni yopadi), D8/D9 (dispatch va
flexible learning flow — P1.2/P1.3).

## 7. Ochiq savollar

- C1 va C4 ni yoqish o‘quvchi uchun ko‘rinadigan o‘zgarish: qaysi activity’lar `lifecycleStatus!=='ready'`
  bo‘la turib brauzerda ochilmoqda — sanab chiqish kerak (P1.0 dan oldin readiness hisoboti).
- Reflection rejimidagi mustahkamlash “assessment” hisoblanadimi yoki alohida `reflection` evidence klassi kerakmi.
- Runner’dagi “practice + assessment bir run’da” modeli pedagogik jihatdan kerakmi yoki faqat test qulayligi.
