# ADR-P1-007 — Ionic precipitation reference renderer (`ionic-precipitation@1.0.0`)

- **Holat:** qabul qilindi (P1.6 implementatsiyasi). Bu human content approval, chemistry approval yoki pilot sign-off **emas**.
- **Kontekst:**
  - ADR-P1-005 (RendererRegistry);
  - ADR-P1-006 (hydrolysis);
  - P1.3 renderer foundation hisobotidagi `ionic-precipitation`: “fixed reagent sequence = scripted”.
- **Asosiy qoidalar:**
  - Renderer reaksiya yoki eruvchanlik kimyosini o‘zi hisoblamaydi.
  - Noma’lum juftlik hech qachon “reaksiya bormaydi” deb taxmin qilinmaydi.

## 1. Oldin / keyin

| | P1.5 gacha (8.1) | P1.6 |
|---|---|---|
| O‘quvchi harakati | `selectApparatus → addNaCl → addAgNO3 → observe → record` (qat’iy ssenariy) | tokchadan **o‘zi** A va B reagentni tanlaydi → aralashtiradi → kuzatadi → tenglama yozadi |
| Reaksiya | config’dagi ikki reagent (payload bo‘lmasa) | `ReactionMatcher` tanlangan juftlik bo‘yicha |
| Tenglama | `sameEquation` (bo‘sh joysiz string tengligi) | `compareNetIonic` (tartibga bog‘liq emas, kimyoviy) |
| Tugallanish | ssenariy qadamlari | target reaksiya kuzatilgan **va** uning net-ion tenglamasi to‘g‘ri |

## 2. Domain audit (authority’lar)

| Mas’uliyat | Authority | Fayl / ma’lumot |
|---|---|---|
| Reagent identifikatsiyasi | `SpeciesRegistry` | `species.json` (84 ta) |
| Eritma reagenti (ionlarga ajraladi) | `IonicEngine.dissociate` | `solubility.json` (12 ta dissociation rule, 8 ta insoluble) |
| Aralashtirilganda nima bo‘ladi | `ReactionMatcher` | `reactions.json` (28 ta yozuv; soni content’dan olinadi) |
| Kutilgan net-ion tenglama | `IonicEngine.netIonicEquation` | reaksiya + dissociation |
| O‘quvchi tenglamasi to‘g‘rimi | `compareNetIonic` | `src/domain/chemistry/ionic-equation.ts` |
| Ketma-ketlik va tugallanish | `evaluateIonicMixing` | `src/domain/chemistry/ionic-mixing.ts` |

**KB audit:**
- Har yozuvda `reactants`, `products`, `observations`, `sourceRefs` va `molecularEquation` bor.
- Yozuvlarda alohida `reviewStatus` maydoni yo‘q. Ular butunligicha CHEM-033 surface’ida (`pending`).
- Aniq “no reaction” yozuvi **yo‘q**.

## 3. Uch xil natija (aralashtirilmaydi)

- **`reaction`** — modellashtirilgan reaksiya. Kuzatuv KB yozuvidan olinadi.
- **`no-reaction`** — **aniq**, review qilinadigan yozuv (`reactionType: 'no-reaction'`, mahsulotsiz, faqat `no-visible-change`). Domain buni qo‘llab-quvvatlaydi, lekin KB’da hozircha bunday yozuv yo‘q (known limitation). Test fixture bilan isbotlangan.
- **`not-modeled`** — `REACTION_NOT_MODELED`, `REACTION_CONDITION_REQUIRED` yoki `REACTION_CONDITIONS_NOT_MET`.
  - Bu model qamrovidagi bo‘shliq. Kuzatuv ixtiro qilinmaydi.
  - Matnda “Bu ‘reaksiya bormaydi’ degani emas.” deyiladi.
  - Evidence yozilmaydi.

**Sharoitlar (P1.6 audit topilmasi).** `rxn.nacl-h2so4` konsentrlangan kislota va qizdirishni talab qiladi, lekin eski matcher so‘rovda sharoit berilmasa uni moslab yuborardi. Natijada ikki eritmani xona haroratida aralashtirish “gaz ajraldi” deb ko‘rsatilardi.

Yechim: aralashtirish `conditionPolicy: 'require-record-conditions'` bilan so‘raydi (closeout’da aniq majburiy argumentga aylantirildi, addendum D1). Yozuv talab qilgan har bir sharoit (teg, tok, yorug‘lik, muhit) mavjud bo‘lmasa → `REACTION_CONDITIONS_NOT_MET`. Mavjud chaqiruvchilar uchun xulq o‘zgarmadi (flag ixtiyoriy).

## 4. Reagent tanlash

- **Tokcha (content):** `reference-slices.json` → `practice.experiment.8.1.reagentShelf` (7 ta species ID). Domain uni tekshiradi (`resolveShelf`):
  - har biri mavjud species va eritma reagenti bo‘lishi kerak;
  - target reaksiya tokchadan yetib boriladigan bo‘lishi kerak.
  - Aks holda `IONIC_SHELF_*` / `IONIC_TARGET_*` bilan fail-closed.
- **Renderer ro‘yxatni `reactions.json` dan tuzmaydi.** U RendererModel’dagi `reagents` ni oladi (domain holatidan).
- **Identifikatsiya — species ID** (`species.agno3`). Formula yorlig‘i (AgNO₃) faqat ko‘rsatish uchun. Payload’da formula yuborilsa → `REAGENT_NOT_AVAILABLE`.
- **Intent’lar** (mavjud `experiment-action` ichida):
  - `selectReagent {slot:'A'|'B', speciesId}`;
  - `mix` — aniq amal: tanlashning o‘zi reaksiyani ishga tushirmaydi;
  - `writeEquation {equation}`.

## 5. Net-ion tenglama

- **Kiritish:** o‘quvchi oddiy matn yozadi.
- **Sintaksis** (maydon ostida yordam matni, `aria-describedby`):
  - `Ag+`, `Cl-`, `NO3-`, `Ba2+` / `Ba^2+`, `SO4^2-` (ko‘p atomli ion zaryadining kattaligi `^` bilan, chunki `SO42-` ikki xil o‘qiladi);
  - strelka `->` / `→` / `=`;
  - hadlar orasida “ + ”;
  - Unicode indekslar (SO₄²⁻) va ↓/↑ belgilari qabul qilinadi.
  - Yordam matnidagi misollar tokchadagi reaksiyalarning ionlarini **ishlatmaydi**, ya’ni javobga ishora bermaydi.
- **Taqqoslash:**
  - hadlar tartibi ahamiyatsiz, tomonlar ahamiyatli;
  - koeffitsiyent aniq (`2Ag+ + 2Cl- → 2AgCl` net tenglama emas);
  - holat belgisi ixtiyoriy, lekin yozilsa mos kelishi kerak (`AgCl(aq)` xato);
  - tomoshabin ionlar qo‘shilsa xato.
- **Sintaksis xatosi** kimyoviy verdict emas: yordam matni chiqadi, evidence yozilmaydi.
- **Kutilgan tenglama** domain holatida ham, RendererModel’da ham **yo‘q**. U faqat topshirilgan javobning audit evidence’iga (`canonicalExpected`) yoziladi.

## 6. Evidence (click emas, ma’noli)

- **Kuzatuv evidence’i:** har bir **alohida** modellashtirilgan juftlik uchun bitta `observation`:
  - `observationKind: 'ionic-mixing'`, `reagents`, `outcome` (`reaction` | `no-reaction`, hech qachon `not-modeled`), `reactionId`;
  - o‘sha juftlikni qayta aralashtirish yangi yozuv qo‘shmaydi.
- **Tenglama evidence’i:** har topshirilgan tenglama uchun bitta `answer`:
  - `answerKind: 'net-ionic-equation'`, `response`, `canonicalExpected`, `correct`;
  - to‘g‘ri yozilgach, o‘sha reaksiya uchun yangi urinish rad etiladi (`EQUATION_ALREADY_SOLVED`).
- **Construction:** `ionic-<targetReactionId>`, `achieved`.
- **Tanlash harakatlari va modellashtirilmagan juftliklar evidence yaratmaydi.**
- Validator discriminator’lari (P1.5 `answerKind` modeli kengaytirildi, yangi ierarxiya yo‘q) begona, qisman va noma’lum yozuvlarni rad etadi.
- **Versiya:** 8.1 config `1.0.0 → 2.0.0`. Baholash semantikasi o‘zgardi va eski ssenariy evidence’i bilan aralashmaydi.

## 7. Tugallanish

Tugallanish = target reaksiya (`config.reactionId`) kuzatilgan **va** uning net-ion tenglamasi to‘g‘ri. Buni domain qaror qiladi.
- Boshqa reaksiyani to‘g‘ri yechish tugallamaydi.
- Kuzatib, xato tenglama yozish ham tugallamaydi.
- Renderer tugallanish yaratmaydi.

## 8. Renderer / domain chegarasi

- Converter (`toIonicPrecipitationRendererModel`) faqat so‘z tanlaydi (rang ID → “Oq”). Unda mahsulot, ion yoki eruvchanlik bilimi yo‘q (test manba kodni tekshiradi).
- Renderer: native `<select>` ×2, “Aralashtirish” tugmasi, `form` (label + yordam), text-state jadval, `aria-live` xulosa. Animatsiya yo‘q (`reducedMotion: 'static'`).
- Guard’lar:
  - `RENDERER_IMPORTS_CONTENT_DATA` (reactions.json, solubility.json, config, fetch);
  - `CHEMISTRY_DOMAIN_IMPORTED_IN_RENDERER` (`ReactionMatcher`, `IonicEngine`, `compareNetIonic`);
  - boshqa 5 ta renderer qoidasi;
  - hammasi 0 violation.

## 9. Uchinchi capability isboti (registry generalizatsiyasi)

- `ionic-precipitation` faqat `catalog.ts` va `index.ts` orqali qo‘shildi. `registry.ts`, `host.ts` va `contract.ts` da capability ID bo‘yicha shart yo‘q (test).
- **`practiceType` auditi:** bu sahifaning engine oilasi. Mavjud `PracticeCommand` contract’i aynan shunga qarab kalitlanadi, shuning uchun u umumiy context, renderer-specific leakage emas.
  - Uchinchi renderer **yangi context maydoni talab qilmadi**. `RendererMountContext` = title, goal, elementName, practiceType (test).
  - `practiceType` endi majburiy. Umumiy `commandFor()` (`src/renderers/intent.ts`) hydrolysis va ionic tomonidan qayta ishlatiladi.
- Bitta readiness yo‘li: uchala capability `^2.0.0` bilan bir xilda `BLOCKED`/`RENDERER_UNAVAILABLE` beradi (test).

## 10. Governance

- 8.1 readiness `rendererRequirement` bilan va usiz **aynan bir xil** (`REVIEW_PENDING`, `isReleaseReady=false`).
- Approval’lar `pending` holicha qoldi.
- Readiness 118/27/1.
- Sign-off yo‘q.
- Global strict o‘chiq.

## Scope’dan tashqari

- Elektroliz renderer’i.
- 3D/WebGL, to‘liq periodik jadval.
- Yangi assessment generatsiyasi, global strict readiness, D9, server-side assessment.

## Addendum — P1.6 closeout (merge oldidan semantik audit)

### D1. Sharoit siyosati aniq (implicit default yo‘q)
`ReactionMatcher.match` endi `conditionPolicy` ni **majburiy** qabul qiladi. U berilmasa → `REACTION_MATCH_POLICY_REQUIRED`.

| Chaqiruvchi | Siyosat | Ma’nosi |
|---|---|---|
| `experiment-adapter.ts` (legacy scenario yo‘li) | `filter-by-query` | Oldingi hujjatlangan xulq: so‘rov sharoiti nomzodlarni toraytiradi, yozuv talablari majburlanmaydi. |
| `ionic-mixing.ts` (ikki eritmani aralashtirish) | `require-record-conditions` | So‘rov haqiqiy sharoitni to‘liq aytadi. Yozuv talabi bajarilmasa → `REACTION_CONDITIONS_NOT_MET`. |

Test barcha `src/` chaqiruvchilarini ro‘yxatlaydi (ro‘yxatda yo‘q chaqiruvchi = FAIL). Legacy testlar (`phase2-reactions`) izoh bilan `filter-by-query` ga o‘tkazildi.

### D2. Sharoit semantikasi (`requirementsMet`)
| Yozuv | Haqiqiy sharoit | Natija |
|---|---|---|
| maydon ko‘rsatilmagan | — | talab yo‘q (bajarilgan) |
| ko‘rsatilgan | ko‘rsatilmagan | **bajarilmagan** (noma’lum ≠ bajarilgan) |
| ko‘rsatilgan | boshqacha | **bajarilmagan** (ziddiyat) |

- Maydonlar: `tags` (har biri bo‘lishi shart), `lightRequired`/`electricalCurrent` (boolean mos kelishi kerak), `medium`, `solvent`, `catalystIds`, `temperatureRange`/`pressureRange`/`concentrationRules` (aynan teng bo‘lishi kerak, oraliq arifmetikasi taxmin qilinmaydi).
- **Known limitation → P1.7:** KB sharoitlari erkin matnli teglar. Masalan “dilute acid” aslida reagent deskriptori, lekin hozir u ham talab sifatida o‘qiladi. Teglar lug‘ati P1.7 da tuziladi.

### D3. Uch klass
- `classifyMatch()` quyidagilardan birini qaytaradi: `MODELED_REACTION`, `MODELED_NO_REACTION`, `NOT_MODELED`.
- Domain (`outcome`), evidence (`outcome` faqat `reaction`/`no-reaction`) va UI (`reactionState`) shu uchtasini ajratadi.
- `NOT_MODELED` hech qachon “reaksiya bormaydi” deb ko‘rsatilmaydi.
- Sintetik fixture no-reaction yo‘lini isbotlaydi. Production KB’da 0 ta yozuv bor: **KNOWN CONTENT GAP**.

### D4. Doimiy regression
Sharoit talab qiladigan **har bir** KB yozuvi xona haroratidagi eritmalar aralashmasiga mos kelmaydi. O‘z sharoiti bilan esa mos keladi. Bu KB kengaysa ham ishlaydigan property test.

### D5. Tenglama taqqoslovchi korpusi
`tests/fixtures/net-ionic-corpus.json` — 38 holat. Qamrov:
- hadlar tartibi, koeffitsiyent normallashtirish, zaryad sintaksisi, Unicode;
- holat belgilari, tomoshabin ionlar;
- strelka turlari, bo‘sh joylar, noaniq zaryad yozuvi.

Har holatda kutilgan verdict: qabul, rad yoki sintaksis. Na false positive, na false negative.

### D6. Kutilgan javob
Kutilgan tenglama topshirilishdan **oldin ham, keyin ham** RendererModel’da va DOM’da (matn va `data-model`) yo‘q (mini-DOM testi). O‘quvchi faqat feedback matnini ko‘radi. `canonicalExpected` faqat audit evidence’ida qoladi.

### D7. Evidence identitet
- A+B va B+A — bitta juftlik.
- Qayta aralashtirish yangi yozuv qo‘shmaydi.
- **Bir xil tenglamani qayta topshirish** (tartib yoki bo‘sh joy farqi bilan) yangi revision emas: `EQUATION_UNCHANGED`, evidence yo‘q.
  - Solishtirish qat’iy: holat belgisi ham teng bo‘lishi kerak. Audit’da topilgan xato: yumshoq solishtirish `AgCl` va `AgCl(aq)` ni bir xil deb, to‘g‘ri javobni rad etardi.
- Retry yangi attempt ochadi. Engine ID takrorlanadi, persisted ID esa noyob. Append-only.
- Mastery evidence chegaralangan: kuzatuvlar ≤ modellashtirilgan juftliklar soni, har reaksiya uchun bitta to‘g‘ri javob.
