# Electrolysis expansion — authoring brief (P1.8)

> **PROPOSED / NEEDS REVIEW.** Bu brief kimyo reviewer uchun. Undagi elektrolit va elektrod holatlari agent **taklifi**: ular kanonik kimyo emas, `content-src/chemistry/electrolysis.json`ga qo‘shilmagan va hech bir engine yoki renderer ularni o‘qimaydi. Electrolysis renderer hali boshlanmagan.

## Nega kerak

- Hozir modelda **1 ta yozuv** bor: CuCl₂(aq), inert elektrod → katod Cu, anod Cl₂ (review: pending).
- `reports/electrolysis-model-readiness.json` start gate: **NOT_READY**.
- Black-swan mezoni: ≥ 2 mustaqil o‘quvchi tanlovi (har biri ≥ 2 qiymat) va ≥ 3 xil katod/anod natijasi. Aks holda har bir o‘quvchi yo‘li bir xil natijaga olib boradi — bu simulyatsiya emas, tayyor animatsiya.

## Taklif qilingan eng kichik dizayn (`proposals.json` → `proposedDesign`)

| | Cl⁻ | SO₄²⁻ |
|---|---|---|
| **Cu²⁺** | CuCl₂ → Cu / Cl₂ *(mavjud yozuv)* | CuSO₄ → Cu / O₂ *(taklif)* |
| **Na⁺** | NaCl → H₂ / Cl₂ *(taklif)* | Na₂SO₄ → H₂ / O₂ *(taklif)* |

- Faza: suvli eritma, elektrod: inert (o‘zgarmaydi).
- 2 mustaqil tanlov (kation, anion) × 2 qiymat = **4 xil natija**.

## Qo‘shimcha nomzodlar (dizayndan tashqarida)

- **KI(aq), inert** → H₂ / I₂. lu.9.15 outcome’i “CuCl₂ va KI eritmalari elektrolizi” deydi: NaCl o‘rniga KI kerakmi?
- **NaCl(l), inert** → Na / Cl₂. `Na` species ro‘yxatda yo‘q.
- **CuSO₄(aq), mis elektrod** → katodda Cu, anod eriydi. Yozuv formatida “elektrod eriydi” degan mahsulot yo‘q, shuning uchun avval model o‘zgarishi kerak.

## Reviewer qarori (har holat uchun)

1. Kimyoviy natija to‘g‘rimi (katod, anod, kuzatuv)?
2. Maktab darajasida aniq ifodalanganmi? Masalan, NaCl konsentratsiyasi.
3. Manba (`sourceRefs`) nima?

Tasdiqlangan holatni **muallif** `electrolysis.json`ga yozuv sifatida qo‘shadi. So‘ng u chemistry assertion sifatida qayta review qilinadi (`npm run review:build` → workbench). Agent hech narsa qo‘shmaydi.
