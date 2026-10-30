# TT 4.2 — Canonical kimyo bilimlar bazasi va ilmiy aniqlik

Holat: **DRAFT**. Bu hujjat mashina bajara oladigan ishlarni va inson qarori kutayotgan bandlarni ajratib ko‘rsatadi. Hech bir kimyoviy da’vo, manba, xavf yoki qaror agent tomonidan tasdiqlanmagan.

## Talablar va holat

| # | Talab (TT 4.2) | Mashina qismi | Inson qismi | Holat |
|---|---|---|---|---|
| 1 | SpeciesRegistry identity invariantlari | `SpeciesRegistry.from` noyob id va (formula, faza, zaryad, variant, allotrop) ni talab qiladi; paket formula zaryadini ham tekshiradi: **0 buzilish / 84 yozuv**. 6 species formula o‘rnida nom saqlaydi (parser qo‘llamaydi, ma’lum bo‘shliq) | — | mashina qismi bajarildi |
| 2 | `rxn.agno3-nacl` NaCl(aq) ↔ NaCl(s) | topilma va A/B/C variantlari paketda; avto-tuzatish yo‘q, tavsiya yo‘q | kimyo eksperti variantni tanlaydi | **PENDING** |
| 3 | 28 reaksiyaning individual review’i; conditions strict; noma’lum maydon REJECT | har bir reaksiya uchun: tenglama o‘qilishi, atom va zaryad saqlanishi, kanonik balancer bilan moslik, strelka ↔ direction, species aniqlanishi, condition shartnomasi, kuzatuv bayroqlari, manba yaroqliligi; qaror qilinadigan 67 da’vo `assertionId` + `assertionHash` bilan | ekspert `content-src/chemistry-reviews.json` ga qaror yozadi | **0/28**, mashina tekshiruvi 28/28 balanslangan |
| 4 | Manba registri: nom, muallif, nashr, versiya, URL/ISBN, litsenziya, amal sanasi, reviewer | `sourceAcceptance` endi `bibliographicComplete` ni talab qiladi (`SOURCE_BIBLIOGRAPHY_INCOMPLETE`); intake sxemasi `license` va `effectiveDate` ni qabul qiladi; workbench formasida maydonlar bor | manbani inson taklif qiladi va qabul qiladi | 0 yaroqli manba → molyar massa **noma’lum** bo‘lib qoladi |
| 5 | 39 xavf da’vosining safety review’i | 39 species (45 kod) va 20 reaksiya safety tegi ro‘yxati paketda; xavf uchun kb-review kategoriyasi yo‘qligi qayd etilgan | kimyogar + metodist review qiladi va review yo‘lini belgilaydi | **PENDING** |
| 6 | Explicit MODELED_NO_REACTION faqat authored va reviewed yozuv uchun | explorer tasdiqlanmagan no-reaction yozuvini `NO_REACTION_NOT_REVIEWED` deb ko‘rsatadi (“reaksiya bormaydi” deyilmaydi); review to‘plami bo‘lmasa fail-closed | ekspert yozuvni yozadi va tasdiqlaydi | 0 yozuv |

## Qabul mezoni

- 28/28 reviewed: **bajarilmagan** (0/28; inson vazifasi).
- 0 tasdiqlanmagan da’vo tasdiqlangan deb ko‘rsatilgan: **0** (mashina invarianti, test bilan qotirilgan).

DRAFT, PENDING, SKIPPED, SIMULATED va NOT_MODELED holatlari PASS hisoblanmaydi; shuning uchun 4.2 qabul holati `NOT_MET`.

## Artefaktlar

- `npm run chemistry:expert-packet` → `reports/chemistry-expert-review-packet.json`, `docs/reviews/tt-4.2-expert-review-packet.md` (generator bilan teng; `--check` rejimi bor).
- Testlar: `tests/tt-4-2-knowledge-accuracy.test.mjs`.
- Siyosat: `docs/governance/SOURCE_POLICY.md` (bibliografik to‘liqlik).

## O‘zgartirilgan eski testlar (izoh bilan)

- `tests/p2-4-governed-content-operations.test.mjs`, `tests/p2-13-periodic-table.test.mjs`, `tests/p2-14-substance-reaction.test.mjs`: HUMAN_ACCEPTED fixture’lariga fixture bibliografiyasi qo‘shildi (haqiqiy manba emas); `sourceAcceptance` natijasi yangi maydonlarni o‘z ichiga oladi.
- `tests/p2-14-substance-reaction.test.mjs` test 8: tasdiqlanmagan no-reaction fixture endi `NO_REACTION_NOT_REVIEWED`; reviewed to‘plam bilan `MODELED_NO_REACTION`.
