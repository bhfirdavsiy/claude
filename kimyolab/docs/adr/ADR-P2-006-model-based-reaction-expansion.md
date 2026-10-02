# ADR-P2-006 — Model-based reaction interaction expansion (eligibility first)

- **Holat:** qabul qilindi (P2.5).
- **Natija:** 21 nomzod tekshirildi, **0 tasi eligible**, **0 tasi o‘tkazildi**. MODEL_BASED: 4 activity / 6 mavzu, avvalgidek.
- **Qilinmadi:**
  - reaksiya, mahsulot, kuzatuv, eruvchanlik yoki “reaksiya bormaydi” yozuvi qo‘shilmadi (`chemistryRecordsAdded: 0`);
  - hech bir activity marshruti o‘zgartirilmadi;
  - dekorativ “simulyatsiya” yaratilmadi;
  - inson qarori (chemistry, content, release, pilot, source) yaratilmadi.

## 1. Savol

Mavjud model yozuvlari (28 reaksiya) va mavjud ionic-mixing seam (`src/domain/chemistry/ionic-mixing.ts` + `ionic-precipitation` renderer) bilan qaysi activity’lar **haqiqiy** model-based bo‘la oladi?

## 2. Audit qoidasi (`scripts/lib/model-interaction.ts`)

Har nomzod real domain orqali tekshiriladi: ReactionMatcher, IonicEngine, SpeciesRegistry va `solution-mixing` sharoitlari. Bular ionic-mixing ishlatadigan aynan o‘sha chaqiruvlar.

- **Shelf faqat activity kontentidan:** activity’ning o‘z guided bosqichlaridagi reaksiya yozuvlari reaktantlari va legacy reagent ro‘yxati. Undan faqat ionic-mixing modellay oladiganlari (dissociation rule bor eritmalar) qoldiriladi. Qolganlari sababi bilan ro‘yxatlanadi (`NOT_IN_SPECIES_REGISTRY`, `NO_DISSOCIATION_RULE`).
- **Natija faqat toza kuzatuvdan:** agar KB’ning o‘z struktura tekshiruvi reaksiya kuzatuvini `CHEMISTRY_REVIEW_REQUIRED` deb belgilagan bo‘lsa, u “tanlov natijani o‘zgartiradi” degan dalil bo‘la olmaydi.
- **Modellanmagan juftlik** “not modeled” bo‘lib qoladi (fail closed). U natija sifatida sanalmaydi.
- **ELIGIBLE** bo‘lish uchun quyidagilarning hammasi kerak:
  - activity experiment bo‘lsin;
  - shelf’da kamida 2 reagent bo‘lsin;
  - juftliklar kamida 2 xil toza modellangan natijaga yetsin (black-swan);
  - activity’ning o‘z yozuvlaridan biri shelf’dan erishiladigan, toza kuzatuvli va net ionic tenglamasi hisoblanadigan bo‘lsin (completion target).
- Nomzodlar: P2.0 work package’laridagi 12 ta activity (reaction-matcher 10, ionic-engine 2), hamda repozitoriydagi kamida 2 modellangan eritmasi bor boshqa barcha experiment’lar (9 ta). Hech biri yashirilmaydi.

## 3. Natija (`reports/model-interaction-expansion.json`)

| Sabab | Nomzodlar |
|---|---|
| `BLACK_SWAN_FAIL` | 21 |
| `NO_REACHABLE_TARGET` | 17 |
| `SHELF_TOO_SMALL` | 5 |
| `ACTIVITY_TYPE_TRAINER` / `NO_CONTENT_DEFINED_REAGENTS` | 2 (9.05, 11.10) |

- **8.6 va 9.16** eng yaqin nomzodlar. Ikkita modellangan natijaga yetadi: ZnCl₂ + NaOH (oq cho‘kma) va NaOH + HCl. Lekin ikkinchisining kuzatuvi (“rang o‘zgardi”, rang ko‘rsatilmagan, shelf’da indikator yo‘q) KB tomonidan belgilangan. Toza natija bitta bo‘lgani uchun black-swan FAIL.
  - Bundan tashqari, ular o‘rgatadigan amfoterlik bosqichi (`rxn.znoh2-hcl`, Zn(OH)₂ cho‘kmasi bilan) eritma aralashtirish modelidan tashqarida. Bu yozuv kuzatuvi ham belgilangan (cho‘kma kuzatuvi, lekin erimaydigan mahsulot yo‘q).
  - O‘tkazish o‘rgatilayotgan qadamni yo‘qotardi.
- **8.8, 8.9, 9.3** — bittadan toza natija.
- **8.10** (galogenlar): Cl₂, Br₂, KBr, KI eritma sifatida modellanmagan.
- **7.x, 8.14, 9.4** — metallar, oksidlar, gazlar. Ular boshqa interaksiya modelini talab qiladi.
- **Trainer’lar (9.05, 11.10):** reagent nomlamaydi. Shelf o‘ylab topilgan kontent bo‘lardi.
- Mavjud MODEL_BASED **8.1** endi o‘z shelf’i bo‘yicha tekshiriladi va o‘tadi: 3 ta toza natija (AgNO₃+NaCl, BaCl₂+H₂SO₄, ZnCl₂+NaOH).

## 4. Klassifikatsiya qoidasi mustahkamlandi

Avval `ionic-precipitation` renderer’iga bog‘langan har qanday activity capability darajasidagi reference hisobotdan black-swan’ni meros qilib olardi. Endi:

- `scripts/lib/learning-depth.ts#blackSwanPass` reaction-mixing renderer uchun **activity’ning o‘z shelf’ini** real domain orqali tekshiradi (`activityBlackSwan`);
- yangi bog‘langan activity kamida 2 xil toza natijasiz MODEL_BASED bo‘la olmaydi (GUIDED bo‘ladi);
- hozirgi klassifikatsiya o‘zgarmadi: 8.1 o‘tadi.

## 5. Nimalar ochadi (inson ishi, `unlockSummary`)

Hisobot har nomzod uchun chiqarib tashlangan reagentlarni va ularni o‘z ichiga olgan **mavjud** reaksiya yozuvlarini faktlar sifatida beradi. Bu taklif emas. Masalan:

- **8.8:** NaBr va NaI uchun ko‘rib chiqilgan dissociation rule bo‘lsa, mavjud `rxn.agno3-nabr`, `rxn.agno3-nai` erishiladigan bo‘lardi. Bu uchta xil cho‘kma natijasi bo‘lardi.
- **8.6 / 9.16:** NaOH + HCl kuzatuvi (indikator bilan) va `rxn.znoh2-hcl` kuzatuvi kimyo review’ida tuzatilsa, hamda cho‘kmani keyingi aralashtirishda reagent qiladigan domain modeli bo‘lsa.
- **8.10:** galogen almashinuvi uchun boshqa interaksiya modeli (eritma ichidagi oddiy moddalar).

Qaysi turga dissociation rule berilishi yoki qaysi activity boshqa modelga muhtojligi — kimyo qarori. Agent qaror qilmaydi.

## 6. Invariantlar

- Evidence, mastery, LearningOrchestrator, completion semantikasi va renderer o‘zgarmadi.
- Host parity 9/9, portal 13/13, standalone smoke PASS.
- Progress formulasi va og‘irliklari o‘zgarmadi: foundation 100, learning product 11.688, overall 47.013.
