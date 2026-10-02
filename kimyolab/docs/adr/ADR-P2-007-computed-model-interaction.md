# ADR-P2-007 — Computed model interaction expansion (avval audit, keyin faqat haqiqiy model)

- **Holat:** qabul qilindi (P2.6).
- **Natija:**
  - 75 nomzod tekshirildi;
  - **3 tasi eligible va o‘tkazildi:** 9.23, 11.18, 11.20;
  - 9 tasi BLOCKED, 44 tasi NOT_ELIGIBLE, 17 tasi OUT_OF_FAMILY (organic), 2 tasi allaqachon MODEL_BASED.
  - MODEL_BASED: 4 activity / 6 mavzu → **7 activity / 9 mavzu**.
- **Qilinmadi:**
  - kimyo yozuvi, konstanta, reaksiya, species, sharoit, tenglama, manba yoki baholash javobi qo‘shilmadi (`newChemistryRecords: 0`);
  - inson qarori (chemistry, theory, source, assessment, release, pilot) yaratilmadi;
  - progress formulasi va og‘irliklari o‘zgarmadi.

## 1. Savol

Yangi reaksiya yozuvlarisiz, mavjud deterministik engine’lar bilan qaysi activity’lar **haqiqiy** model-based bo‘la oladi? Ko‘rib chiqilgan engine’lar:

- elektron konfiguratsiya;
- kinetika va muvozanat;
- marganes redoks;
- gaz qonunlari, Faraday;
- yadro tenglamasi, stexiometriya, redoks balanslash.

## 2. Qoida (F1–F8)

Engine matn maydoni ortida ishlashi activity’ni model-based qilmaydi. “Yakuniy javobni yoz → engine to‘g‘ri/noto‘g‘ri deydi” — bu STATIC_CHECK.

Activity faqat quyidagilarning **hammasi** bajarilganda eligible bo‘ladi:

1. O‘quvchi kamida bitta mazmunli domain parametrini boshqaradi.
2. Kamida ikkita to‘g‘ri tanlov mazmunan har xil model natijasiga olib keladi (black-swan).
3. Natija mavjud domain engine’dan keladi.
4. UI’da kimyo yoki matematika javob mantig‘i yo‘q.
5. Topshiriq semantikasini activity’ning o‘z kontenti allaqachon belgilagan.
6. Qo‘llab-quvvatlanmagan kiritish fail closed bo‘ladi.
7. Haqiqiy brauzer yo‘li muvaffaqiyatga yetadi.
8. Activity kurikulumdagi maqsadiga pedagogik jihatdan teng qoladi.

Audit `scripts/lib/computed-model-interaction.ts` da. Har nomzod uchun real domain chaqiriladi: EquilibriumModel, ManganeseRedoxModel, KineticsModel, electronConfiguration. Hisobot: `reports/computed-model-interaction-audit.json`.

## 3. Natija

| Holat | Nomzodlar | Asosiy sabab |
|---|---|---|
| CONVERTED | 9.23, 11.18, 11.20 | sharoit → natija; 2–3 xil domain natijasi; kontent sharoitlarni belgilaydi |
| BLOCKED | 11.16, 8.19 | barcha modellangan kinetika omillari bir xil ta’sir beradi (`increase`) → BLACK_SWAN_FAIL; P va V yozuvlari yo‘q |
| BLOCKED | 11.01, 8.06 | Z’ni o‘zgartirish so‘ralgan javobning o‘zini ko‘rsatadi (ANSWER_LEAK); engine istisnolarsiz bitta to‘ldirish tartibini qo‘llaydi (Z=24, Z=29 natijalari kimyo review talab qiladi) |
| BLOCKED | 11.15 | “tezlik grafigi” konsentratsiya–vaqt modelini talab qiladi; domain’da faqat ikki nuqtali o‘rtacha tezlik bor |
| BLOCKED | 11.17 | dinamik muvozanat modeli yo‘q (runtime ikki config sonini solishtiradi) |
| BLOCKED | 8.20 | beta1 config targetState’ni solishtiradi. 8.20 ning o‘z kontentida bitta perturbatsiya bor (bosim). Harorat yozuvi `src.curriculum.11.18` ga tegishli, uni 8.20 ga qo‘shish topshiriqni kontentdan kengaytiradi. |
| BLOCKED | 11.2, 9.10 | bitta elektroliz yozuvi; elektroliz ma’lumotini kengaytirish P2.6 doirasidan tashqarida |
| NOT_ELIGIBLE | 11.06, 11.08, 11.14, 11.22 | hisoblash: kiritishlarni o‘zgartirib natijani ko‘rish so‘ralgan hisobni almashtiradi (F8); kashfiyot topshirig‘ini kontent belgilamagan (F5) |
| NOT_ELIGIBLE | 11.03, 11.19, 11.10, 9.05, 7.5, 7.4 | validator yoki trainer: “javobni yoz → to‘g‘ri/noto‘g‘ri” |
| NOT_ELIGIBLE | 35 ta config-target simulyatsiya/hisob | domain modeli yo‘q, javob config qiymati |
| OUT_OF_FAMILY | 17 ta organic | yozuvlarga asoslangan bilim, hisoblanmaydi |

## 4. O‘tkazish dizayni

### 4.1 Domain

`src/domain/chemistry/condition-trial.ts` — sharoitni tanlash → natijani bashorat qilish → reveal. Bu umumiy sequencer:

- Natija **faqat** adapter orqali mavjud modeldan keladi:
  - `equilibriumConditionModel`: bitta reaksiya tizimining perturbatsiyalari → siljish;
  - `manganeseConditionModel`: muhit → mahsulot.
- Adapterlar yozuv qo‘shmaydi. `EquilibriumModel.cases(reactionId)` — mavjud yozuvlarning faqat o‘qish uchun ko‘rinishi.
- Pedagogika domain’da majburlanadi, UI’da emas:
  - reveal bashoratni talab qiladi;
  - reveal’dan keyingi bashorat rad etiladi;
  - bir urinishda har sharoit bir marta sinaladi;
  - modellanmagan sharoit yoki modeldan tashqari javob rad etiladi.

### 4.2 Evidence

`src/runtime/reference-slices/condition-practice.ts`. Har sinov uchun bitta oddiy answer evidence yoziladi:

- `questionId condition:<kind>:<condition>`;
- `response` — bashorat;
- `score` — domain verdikti.

Kamida bitta sinov bo‘lgach, target sharoit uchun bitta construction qo‘shiladi.

- Rad etilgan kiritish sinov yozmaydi, demak evidence ham yozmaydi. Bu P2.1 kafolati: noto‘g‘ri kiritish evidence emas.
- Yangi answerKind qo‘shilmadi; mastery va orchestrator o‘zgarmadi.
- Noto‘g‘ri sinov — qonuniy evidence. Retry — yangi attempt; eski evidence o‘zgarmaydi.

### 4.3 Versiyalash

Baholash semantikasi o‘zgardi: bir maydonli javob o‘rniga bashorat sinovi. Shuning uchun:

- config versiyasi `1.0.0 → 2.0.0`;
- yangi evidence id’lari (`<id>.condition.trial.<n>`, `<id>.condition`);
- yangi targetId’lar (`<model>-<condition>-trial`).

Eski evidence hech qachon bir xil baholash konteksti sifatida ko‘rsatilmaydi. Bu P1.5 gidroliz presedentiga mos.

### 4.4 Renderer

`condition-prediction@1.0.0` (`src/renderers/condition-prediction/`) — qayta ishlatiladigan primitiv, ichida kimyo yo‘q:

- Har so‘z learner-interaction katalogidan keladi (`ui.cond-*`, `answer.<domain>.<id>`); formulalar faqat tipografiya (`Mn^2+` → `Mn²⁺`).
- Renderer tanlash `capability id + version` bo‘yicha, hech qachon activityId bo‘yicha emas.
- Reveal’dan oldin renderer modeli natijani ko‘rmaydi.
- Javob variantlari modelning yopiq to‘plami. Tartibi qaysi variant to‘g‘ri bo‘lishiga bog‘liq emas.
- Accessibility:
  - native radio + fieldset/legend;
  - matnli holat jadvali va aria-live xulosa;
  - ✓/✗ matni;
  - harakat yo‘q;
  - 375 px’da reflow.

### 4.5 Per-activity black-swan

`reports/reference-renderer-condition-prediction.json` har activity’ni real stack orqali alohida o‘lchaydi (ContentClient → session → adapter → domain). `scripts/lib/learning-depth.ts#blackSwanPass` aynan shu activity qatorini o‘qiydi. Natijalar:

- 9.23: 3 sharoit → 3 natija;
- 11.20: 3 sharoit → 3 natija;
- 11.18: 2 sharoit → 2 natija.

Soxta (bir natijali) model FAIL beradi (unit test).

## 5. Ko‘rsatilmaydigan va inson ishi

- **Tarjima qarzi:**
  - Muvozanat yozuvlarining izohlari va marganes kuzatuvlari faqat ingliz tilida. Ular o‘quvchiga **ko‘rsatilmaydi**; faqat struktura natijalari chiqadi (siljish nomi, mahsulot formulasi).
  - 9.23 sarlavhasidagi “rangli” kuzatuv shuning uchun hozircha matn sifatida yo‘q.
- **Yangi display matnlari** (review pending):
  - `answer.equilibrium-perturbation.*`, `ui.cond-*`;
  - `answer.equilibrium-system.haber` — yozuv izohidagi tenglamani takrorlaydi.
- **Bloklarni ochish** (kimyo/kurikulum qarori, agent qaror qilmaydi):
  - 11.16 uchun turli ta’sirli kinetika yozuvlari (P, V);
  - 11.01 uchun ko‘rib chiqilgan istisno yozuvlari va bosqichma-bosqich domain holati;
  - 11.15 uchun konsentratsiya–vaqt modeli;
  - 8.20 uchun o‘z kontentiga ikkinchi perturbatsiya.

## 6. Invariantlar

- Host parity 11/11 (yangi ssenariylar: 9.23, 11.18, 11.20), portal 13/13, standalone desktop va mobile smoke PASS.
- Learner bundle +4 modul, taxminan +31 KB xom. Yangi dependency yo‘q.
- Hard-coded o‘zbekcha literal soni 156 da qoldi.
- Progress: foundation 100, learning product 11.688 → 12.189, overall 47.013 → 47.313. Faqat `modelBasedInteraction` komponenti o‘zgardi (6/122 → 9/122).
