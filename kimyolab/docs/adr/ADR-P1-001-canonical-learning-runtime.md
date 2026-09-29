# ADR-P1-001 — Canonical Learning Runtime

- Holat: **Qabul qilingan** (P1.0)
- Asos: `docs/plans/p1-canonical-learning-runtime-baseline.md`, tag `kimyolab-p0-integrity-20.1.0`
- Kod: `src/runtime/learning-orchestrator/`

## Kontekst

P0 oxirida learning-state boshqaruvi to‘rt joyga tarqalgan edi:

- `LearningRunner` — headless “canonical”, lekin faqat testlarda ishlatilardi.
- `BrowserProgressService` — brauzerdagi haqiqiy oqim.
- `ReferencePracticeSession` — engine sessiyasi.
- `bootstrap.ts` va render callback’lari.

Baseline hisobot (D1–D9, C1–C8) quyidagi xatarlarni aniqladi:

- ikki xil attempt semantikasi;
- ikki xil mastery doirasi;
- takroriy predikatlar;
- read-modify-write poygasi;
- reflection’ni `ASSESSMENT_COMPLETE` deb yozish;
- kontekstsiz mastery hisoblash.

## Qarorlar

| # | Qaror | Amalga oshirilishi |
|---|---|---|
| 1 | **LearningOrchestrator = workflow authority** | `LearningOrchestrator` unit lifecycle, progress transition, attempt lifecycle, evidence qabul qilish, persistence so‘rovi, mastery recompute va snapshot’ning yagona egasi. U DOM, fetch, ContentClient, kimyo hisobi yoki IndexedDB API’siga tegmaydi. |
| 2 | **ProgressStore = persistence authority** | Orkestrator faqat `LearningStorePort` orqali yozadi (`IndexedDbProgressStore`). Progress har doim `updateProgress(id, updater)` orqali o‘zgaradi: bitta `readwrite` tranzaksiyada read → migrate/validate → update → save (C8). |
| 3 | **Evidence = immutable source of truth** | Faqat `applyPracticeResult`/`submitAssessment` evidence’ni attempt’ga bog‘laydi va saqlaydi (`add`, overwrite yo‘q). Bitta attempt ichida semantik identifikator — `sourceEvidenceId` + mazmun (vaqt tamg‘asisiz). Takroriy yoki kumulyativ qayta chiqarilgan dalil qayta saqlanmaydi. |
| 4 | **Mastery = derived** | Mastery faqat `LearningOrchestrator.recomputeMastery` orqali, har doim aniq `MasteryContext {contentVersion, scoringVersion, curriculumVersion}` bilan hisoblanadi. DB’dagi `mastery` — kesh; evidence’dan qayta quriladi (test bilan isbotlangan). `concept-migration` ham endi kontekstni talab qiladi (C7). |
| 5 | **UI = intents + render only** | UI state’ni o‘zgartirmaydi. Practice sahifasi buyruqni `applyPracticeCommand(session, command)` ga yuboradi: orkestrator engine’ni chaqiradi, dalilni saqlaydi va progress’ni o‘zgartiradi. Render persistence modullarini import qilmaydi (AST guard). |
| 6 | **1 practice page session = 1 attempt** | `BEGIN_PRACTICE` attempt identifikatori, `startedAt` va versiyalarni bir marta belgilaydi. `APPLY_PRACTICE_COMMAND` yangi attempt yaratmaydi. `COMPLETE_PRACTICE` `completedAt` qo‘yadi. `ABANDON_PRACTICE` tugallanmagan attempt’ni `abandoned` qiladi. `RETRY_PRACTICE` har doim yangi attempt ochadi va oldingisini o‘zgartirmaydi. |
| 7 | **attempt state ≠ unit achievement state** | `LearningUnitProgress.status` — **monotonic achievement**, reducer’dagi `ACHIEVEMENT_RANK` bo‘yicha. Joriy urinish holati `attempts` store’da yuritiladi (`in_progress`/`completed`/`abandoned`). `mastered` bo‘lgan unit retry yoki muvaffaqiyatsiz urinish sabab pasaymaydi. |
| 8 | **Reinforcement ≠ assessment** (C5) | Yangi canonical event `REINFORCEMENT_COMPLETE` completion’ni yozadi, lekin `assessment_complete` achievement’ini bermaydi. O‘quvchiga ko‘rinadigan matn o‘zgarmaydi: bajarilgan reflection `displayStatus` selector orqali avvalgidek “Mustahkamlash bajarildi” deb ko‘rsatiladi. |
| 9 | **Intent ≠ event** | `LearningIntent` — UI yoki adapter nimani so‘rayotgani. `ProgressEvent` — nima sodir bo‘lgani. Eventlarni faqat orkestrator chiqaradi, pure reducer esa ularni qo‘llaydi. |
| 10 | **Adapterlar** | `LearningRunner` — compatibility facade: content’ni repository’dan oladi va router’ni ishga tushiradi, qolgan hammasi delegatsiya. `BrowserProgressService` — brauzer facade’i, public API saqlangan. Ularning pariteti `tests/p1-orchestrator-contract.test.mjs` da isbotlangan. |

### Attempt lifecycle tafsilotlari

- **Attempt yozuvi lazy saqlanadi.** U birinchi dalil bilan (`in_progress`) yoki `COMPLETE_PRACTICE` da (dalilsiz ham) yoziladi. Faqat ochilib, hech narsa qilinmagan sahifa attempt qoldirmaydi.
- **Terminal holat bir marta.** `finishAttempt` `in_progress → completed|abandoned` o‘tishini faqat bir marta bajaradi. `abandoned` attempt’ga dalil qo‘shib bo‘lmaydi.
- **Completed sessiya ichida.** Dalil hali ham shu attempt’ga qo‘shiladi, masalan to‘g‘ri javobdan keyin yana javob berilsa. Sessiya yopilgach (sahifadan chiqish) attempt o‘zgarmaydi.
- **Abandoned attempt dalillari** tarixda qoladi va mastery’da hisoblanadi: dalil o‘quvchi haqiqatan qilgan ishni ifodalaydi. Attempt esa muvaffaqiyat sifatida belgilanmaydi.
- **Single-call yo‘li.** `recordPracticeResult(page, result)` sessiyasiz chaqirilsa, bitta chaqiruv = bitta yopiq attempt. Bu P0 kontraktidan meros; unit achievement faqat natija `complete` bo‘lsa ko‘tariladi.

### Mastery doirasi (D6)

Canonical doira: LearningUnit `conceptIds` ∪ yangi dalil tegadigan konseptlar.

- Practice qadamidan keyin faqat **tegilgan** konseptlar qayta hisoblanadi. Natija to‘liq unit hisobiga ekvivalent, chunki tegilmagan konseptlarda yangi dalil yo‘q; bu test bilan isbotlangan.
- `submitAssessment` unit doirasini to‘liq qayta hisoblaydi.
- Bitta buyruq faqat tegilgan konseptlar uchun evidence o‘qiydi (performance guard testi). Aynan takror bo‘lgan buyruq evidence ham, mastery ham ishini bajarmaydi.

## Ko‘rib chiqilgan va rad etilgan alternativalar

| Alternativa | Nega rad etildi |
|---|---|
| XState / boshqa state-machine framework | TT native TypeScript talab qiladi. Holat soni kichik va reducer allaqachon pure/deterministik. Yangi dependency va bundle hajmi foyda keltirmaydi. |
| Hammasini `LearningRunner` ichida qoldirish, brauzer uni chaqiradi | Runner “bir chaqiriqda butun zanjir” modeliga qurilgan (practice + assessment bitta `run`). Brauzer esa bosqichma-bosqich, foydalanuvchi buyruqlari bilan ishlaydi. Orkestrator ikkala modelni ham bosqichlar orqali ifodalaydi. |
| `BrowserProgressService` ni canonical qilish | U brauzer tushunchalariga (page model) bog‘langan va headless testlarda ishlatib bo‘lmaydi. |
| Har bir UI bosishida attempt yaratish (P0 dagi inflyatsiya) | Attempt semantikasini buzadi (9 buyruq = 9 attempt), mastery og‘irliklarini buzadi. |
| Attempt’ni `BEGIN_PRACTICE` da darhol saqlash | Har bir sahifa ko‘rishi bo‘sh attempt qoldiradi; tarix shovqinga to‘ladi. |
| Status’ni joriy urinishga bog‘lash (achievement pasayishi mumkin) | TT §23: tarixiy yutuq yangi urinish sabab regress qilmasligi kerak. |
| `reinforcement_complete` degan yangi status qo‘shish | Progress record sxemasi (`2.0.0`) va migratsiyani o‘zgartiradi. Completion allaqachon `activityStates['cycle.reinforcement']` da; selector yetarli. |
| Progress uchun optimistic locking (versiya maydoni + retry) | IndexedDB `readwrite` tranzaksiyasi o‘zi serializatsiya beradi; qo‘shimcha maydon va migratsiya kerak emas. |

## Oqibatlar

- **O‘quvchiga ko‘rinadigan kichik o‘zgarish (C5).** Faqat reflection yozilgan, practice’i tugallanmagan unit’da cycle UI endi practice’ni “Bajarildi” deb ko‘rsatmaydi. Avval `assessment_complete` statusi practice’ni ham tugallangan deb ko‘rsatardi. Progress sahifasidagi matn o‘zgarmagan.
- **Practice sahifasidan chiqish** tugallanmagan attempt’ni `abandoned` qiladi.
- **Kechiktirilganlar:**
  - C1 — brauzerda `MASTERY_UPDATED` va mastery UI;
  - C2 — assessment’ni UI’ga ulash;
  - C3 — javob oqishi;
  - C4 — readiness enforcement;
  - D8 — `type`/`configFamily` routing;
  - D9 — `learning-cycle.json` asosidagi oqim.

  Orkestratorda ular uchun chegara bor (`submitAssessment`, `BeginPracticeInput`), lekin UI’ga ulanmagan.
