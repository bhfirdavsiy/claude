# Chemistry KB review packet (P1.7)

> Faqat inson reviewer uchun. Bu paket **approval emas**. Qaror `decisions.template.json` orqali to‘ldiriladi va `scripts/chemistry-review/import.ts` bilan `content-src/chemistry-reviews.json` registeriga import qilinadi. Agent va tooling hech qanday qaror yozmaydi.

## Holat

- Assertion’lar: **134** — approved: 0, pending: 134, stale: 0, rejected: 0, change_required: 0
- Gate: **PENDING** (FAIL: 0, PENDING: 165)
- Har assertion’ning hash’i o‘zgarsa, eski qaror **stale** bo‘ladi va hisobga olinmaydi.

## Kategoriyalar

| Kategoriya | Soni | Review talab (flag) |
|---|---|---|
| reaction | 28 | 0 |
| no-reaction | 0 | 0 |
| condition | 20 | 0 |
| observation | 28 | 6 |
| solubility | 20 | 0 |
| hydrolysis | 4 | 0 |
| indicator | 3 | 0 |
| species-name | 30 | 0 |
| electrolysis | 1 | 0 |

## Alohida e’tibor (CHEMISTRY_REVIEW_REQUIRED)

- `observation:rxn.br2-ki` — OBSERVATION_NONSPECIFIC: colour change without a stated colour
- `observation:rxn.cl2-kbr` — OBSERVATION_NONSPECIFIC: colour change without a stated colour
- `observation:rxn.h2-combustion` — OBSERVATION_NONSPECIFIC: colour change without a stated colour
- `observation:rxn.nacl-h2so4` — OBSERVATION_PRODUCT_MISMATCH: gas observed but no product is a gas
- `observation:rxn.naoh-hcl` — OBSERVATION_NONSPECIFIC: colour change without a stated colour
- `observation:rxn.znoh2-hcl` — OBSERVATION_PRODUCT_MISMATCH: precipitate observed but no product is insoluble (solubility rules) or solid

- `indicator:*` yozuvlari hydrolysis klassifikatsiyasidan **alohida** assertion: har biri o‘zi review qilinadi.

## Model qamrovi bo‘yicha nomzodlar (18)

`candidates.json`: o‘quvchi tokchasidagi, hozir `NOT_MODELED` yoki `CONDITION_DEPENDENT` juftliklar. `candidate` — eruvchanlik qoidalaridan chiqarilgan **taklif**, kanonik haqiqat emas.

