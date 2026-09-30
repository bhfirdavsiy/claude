# ADR-P2-001 — Release authority va learning-depth baseline

- **Holat:** qabul qilindi (P2.0).
- **Scope:** o‘lchash va rejalashtirish.
- **Qilinmadi:**
  - yangi renderer, assessment itemi yoki kimyo haqiqati;
  - activity release qilinmadi; global strict yoqilmadi.

## 1. Release authority (P1.9 closeout)

**Muammo.** P1.9 da inson RELEASE qarori faqat register va hisobotda qayd qilinardi. Lifecycle va runtime unga bog‘lanmagan edi.

**Tanlov: A — release register → build-time effective lifecycle.** Kontent mutatsiyasi yo‘q, ikki source-of-truth ham yo‘q.

- **Yagona authority:** `content-src/release-decisions.json` (inson qarori; faqat importer yozadi).
- **Build vaqtida hisoblanadi:** `compileReadiness` har activity uchun `effectiveRelease(activity, config, records)`ni hisoblaydi. Qaror joriy `releaseBasisHash`ga mos bo‘lsagina natija beradi.
  - `RELEASED` — planned activity launchable bo‘ladi (runtime READY);
  - `DISABLED` — runtime DISABLED (`RELEASE_DISABLED`);
  - stale yoki yo‘q qaror, `KEEP_PENDING`, `CHANGE_REQUIRED` → ta’siri yo‘q.
- **Grandfathered lifecycle:**
  - authored `lifecycleStatus: 'ready'` — P0/P1 dan qolgan texnik mavjudlik. U inson release’i **emas**.
  - Hisobotlar ularni `runtimeAvailable` deb, release’dan alohida ko‘rsatadi.
  - Invariant testi: authored `ready` soni 118 da qotirilgan. Yangi activity faqat register orqali release qilinadi.
- **B (`release:apply` → lifecycle mutatsiyasi) nega tanlanmadi:** u register bilan authored lifecycle — ikkita yozuvchini yaratardi. Qaror kontentga ko‘chirilgach, stale bo‘lganini aniqlab bo‘lmasdi.

**Invariantlar** (`tests/p2-0-learning-depth.test.mjs`):
- `APPROVED ≠ RELEASED`;
- `ELIGIBLE ≠ RELEASED`;
- `RELEASE + joriy basis → effective RELEASED`;
- kontent o‘zgarsa → `STALE` → effective RELEASED false.

Inson release’ini agent yaratmaydi: importer, identity va muhit (environment) qoidalari P1.8/P1.9 dagidek.

## 2. Learning depth baseline

**Savol:** “122 mavzu bo‘yicha o‘quvchi qanchalik chuqur o‘rganishi mumkin?”

**Hisobotlar:**
- `reports/learning-depth-baseline.json` — 122 mavzu va 146 activity matritsasi, engine, renderer, lab, accessibility va localization;
- `reports/learning-depth-summary.json`;
- `reports/learning-unit-gap-map.json`;
- `reports/project-progress.json`;
- `reports/p2-work-packages.json`.

**Tamoyillar:** barcha formulalar `docs/roadmap/PROGRESS_MODEL.md`da.
- Tasnif o‘quvchi haqiqiy brauzer yo‘lida nima qila olishidan olinadi, activity nomidan emas.
- Black-swan guard ishlaydi.
- Provenance qarzi alohida kategoriya.

**Asosiy topilmalar (fakt):**
- Nazariya: 122/122 mavzuda bor, lekin hammasi MINIMAL (bir qatorli xulosa). STRUCTURED — 0.
- Activity’lar chuqurligi (146 ta):

  | Chuqurlik | Soni |
  |---|---|
  | MODEL_BASED | 4 |
  | GUIDED | 25 |
  | STATIC_CHECK | 116 |
  | NONE | 1 (routlanmagan) |

- Model-based mashq 6/122 mavzuda bor.
- Launchable 145/145 activity yakunlanadi (CAN_SUCCEED).
- Assessment: 5 item (0 approved), 1 mavzu, outcome qamrovi 1/122.
- MASTERED 0/122 mavzuda erishiladi.
- `practice.simulation.9.23.planned` noto‘g‘ri kiritilgan matnda (masalan, o‘zbekcha “kislotali”) sessiyani exception bilan yiqitadi. Bu yashirin dead-end; o‘lchandi, lekin tuzatilmadi.
- 36 activity o‘quvchidan inglizcha identifikator-tokenni yozishni talab qiladi (masalan `polybutadiene-repeat-unit`).
- 67 activity o‘quvchiga raw-id label ko‘rsatadi.
- Legacy UI’ning accessibility’si 141 activity’da UNKNOWN (PASS deb taxmin qilinmaydi).
- Kontent faqat uz-Latn’da; uz-Cyrl va ru — 0.
