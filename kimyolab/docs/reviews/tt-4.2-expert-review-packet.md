# TT 4.2 — Kimyo ekspert review paketi

> Bu fayl `npm run chemistry:expert-packet` bilan generatsiya qilinadi; qo‘lda tahrirlamang. Mashina faqat **strukturaviy tekshiruv** qiladi va qaror qabul qilinadigan da’volarni sanaydi. Hech bir band tasdiqlanmagan: har biri `PENDING`. Qaror faqat inson tomonidan `content-src/chemistry-reviews.json` ga yoziladi.

## Qabul mezoni

- Mezon: 28/28 reactions reviewed by a chemistry expert; 0 unapproved assertions shown as approved
- Ekspert ko‘rib chiqqan: **0/28**
- Holat: **NOT_MET — human review outstanding (DRAFT/PENDING never counts as PASS)**
- Tasdiqsiz “reviewed” ko‘rsatilganlar: 0

## Mashina tekshiruvlari (qaror emas)

| Tekshiruv | Natija |
|---|---|
| Tenglama o‘qildi | 28/28 |
| Formulalar yozuvga mos | 28/28 |
| Atomlar saqlangan | 28/28 |
| Zaryad saqlangan | 28/28 |
| Kanonik balancer bilan mos koeffitsientlar | 28/28 |
| Strelka ↔ direction | 28/28 |
| Species aniqlangan (formula + faza) | 27/28 |
| Noma’lum condition maydoni (REJECT) | 0 |
| Kuzatuv bayroqlari | 6 |
| Yaroqli manba | 0/28 |
| Species identity buzilishi | 0 (84 ta yozuv) |
| Formula o‘rnida nom (parser qo‘llamaydi) | 6: `species.etanol`, `species.kraxmal`, `species.saxaroza`, `species.sirka`, `species.moy`, `species.indikator` |

Qaror kutayotgan da’volar: **67** (reaction / condition / observation).

## Reaksiyalar

| # | Reaksiya | Tenglama | Atom | Zaryad | Balancer | Species | Bayroq | Qarorlar |
|---|---|---|---|---|---|---|---|---|
| 1 | `rxn.h2-combustion` | 2H2 + O2 → 2H2O | BALANCED | BALANCED | AGREES | RESOLVED | OBSERVATION_NONSPECIFIC | `reaction` pending<br>`condition` pending<br>`observation` pending |
| 2 | `rxn.c-combustion` | C + O2 → CO2 | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`condition` pending<br>`observation` pending |
| 3 | `rxn.s-combustion` | S + O2 → SO2 | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`condition` pending<br>`observation` pending |
| 4 | `rxn.fe-combustion` | 3Fe + 2O2 → Fe3O4 | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`condition` pending<br>`observation` pending |
| 5 | `rxn.zn-hcl` | Zn + 2HCl → ZnCl2 + H2 | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`observation` pending |
| 6 | `rxn.zn-h2so4` | Zn + H2SO4 → ZnSO4 + H2 | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`condition` pending<br>`observation` pending |
| 7 | `rxn.mg-h2so4` | Mg + H2SO4 → MgSO4 + H2 | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`condition` pending<br>`observation` pending |
| 8 | `rxn.h2-cuo` | H2 + CuO → Cu + H2O | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`condition` pending<br>`observation` pending |
| 9 | `rxn.nacl-h2so4` | NaCl + H2SO4 → NaHSO4 + HCl | BALANCED | BALANCED | AGREES | RESOLVED | OBSERVATION_PRODUCT_MISMATCH | `reaction` pending<br>`condition` pending<br>`observation` pending |
| 10 | `rxn.cuo-hcl` | CuO + 2HCl → CuCl2 + H2O | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`observation` pending |
| 11 | `rxn.naoh-hcl` | NaOH + HCl → NaCl + H2O | BALANCED | BALANCED | AGREES | RESOLVED | OBSERVATION_NONSPECIFIC | `reaction` pending<br>`observation` pending |
| 12 | `rxn.caco3-hcl` | CaCO3 + 2HCl → CaCl2 + H2O + CO2 | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`observation` pending |
| 13 | `rxn.cao-water` | CaO + H2O → Ca(OH)2 | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`observation` pending |
| 14 | `rxn.co2-water` | CO2 + H2O ⇌ H2CO3 | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`observation` pending |
| 15 | `rxn.zncl2-naoh` | ZnCl2 + 2NaOH → Zn(OH)2 + 2NaCl | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`observation` pending |
| 16 | `rxn.znoh2-hcl` | Zn(OH)2 + 2HCl → ZnCl2 + 2H2O | BALANCED | BALANCED | AGREES | RESOLVED | OBSERVATION_PRODUCT_MISMATCH | `reaction` pending<br>`observation` pending |
| 17 | `rxn.agno3-nacl` | AgNO3 + NaCl → AgCl + NaNO3 | BALANCED | BALANCED | AGREES | UNRESOLVED | — | `reaction` pending<br>`observation` pending |
| 18 | `rxn.agno3-nabr` | AgNO3 + NaBr → AgBr + NaNO3 | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`observation` pending |
| 19 | `rxn.agno3-nai` | AgNO3 + NaI → AgI + NaNO3 | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`observation` pending |
| 20 | `rxn.cl2-kbr` | Cl2 + 2KBr → 2KCl + Br2 | BALANCED | BALANCED | AGREES | RESOLVED | OBSERVATION_NONSPECIFIC | `reaction` pending<br>`observation` pending |
| 21 | `rxn.br2-ki` | Br2 + 2KI → 2KBr + I2 | BALANCED | BALANCED | AGREES | RESOLVED | OBSERVATION_NONSPECIFIC | `reaction` pending<br>`observation` pending |
| 22 | `rxn.bacl2-h2so4` | BaCl2 + H2SO4 → BaSO4 + 2HCl | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`observation` pending |
| 23 | `rxn.nh4cl-caoh2` | 2NH4Cl + Ca(OH)2 → 2NH3 + CaCl2 + 2H2O | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`condition` pending<br>`observation` pending |
| 24 | `rxn.nh3-hcl` | NH3 + HCl → NH4Cl | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`observation` pending |
| 25 | `rxn.na2s-hcl` | Na2S + 2HCl → H2S + 2NaCl | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`observation` pending |
| 26 | `rxn.cuso4-na2s` | CuSO4 + Na2S → CuS + Na2SO4 | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`observation` pending |
| 27 | `rxn.p-combustion` | 4P + 5O2 → 2P2O5 | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`condition` pending<br>`observation` pending |
| 28 | `rxn.c-combustion-limited` | 2C + O2 → 2CO | BALANCED | BALANCED | AGREES | RESOLVED | — | `reaction` pending<br>`condition` pending<br>`observation` pending |

Har bir da’voning `assertionId` va `assertionHash` qiymatlari: `reports/chemistry-expert-review-packet.json` → `reactions[].decisions[]`.

## rxn.agno3-nacl — NaCl(aq) qarori

Topilma: yozuv NaCl(aq) ni nomlaydi; registrda: species.nacl (s).

- **A.** author a canonical NaCl(aq) species record (with source and review), keep the reaction record as written
- **B.** change the reaction record so its NaCl participant names a phase the registry holds (a chemistry change — needs the same review)
- **C.** keep both as they are: the record stays unreachable in the explorer (PHASE_NOT_IN_REGISTRY), no learner claim changes

Agent tanlamaydi (variantlar tartibi tavsiya emas). Qaror: **PENDING**.

## Xavf da’volari (safety review)

39 ta species 45 ta xavf kodini da’vo qiladi; reaksiyalarda 20 ta safety tegi bor. Manba: INTERNAL_PROPOSAL (yaroqsiz). Xavf uchun kb-review kategoriyasi hali yo‘q — review yo‘lini inson belgilashi kerak.

| Species | Faza | Xavf kodlari | Qaror |
|---|---|---|---|
| `species.o2` (O2) | g | oxidizer | PENDING |
| `species.h2` (H2) | g | flammable | PENDING |
| `species.hcl` (HCl) | aq | corrosive | PENDING |
| `species.h2so4` (H2SO4) | aq | corrosive | PENDING |
| `species.hno3` (HNO3) | aq | corrosive, oxidizer | PENDING |
| `species.naoh` (NaOH) | aq | corrosive | PENDING |
| `species.camoh2` (Ca(OH)2) | aq | irritant | PENDING |
| `species.cao` (CaO) | s | corrosive | PENDING |
| `species.mg` (Mg) | s | flammable | PENDING |
| `species.s` (S) | s | flammable | PENDING |
| `species.kno3` (KNO3) | s | oxidizer | PENDING |
| `species.nh4cl` (NH4Cl) | s | irritant | PENDING |
| `species.nh4no3` (NH4NO3) | s | oxidizer | PENDING |
| `species.na2co3` (Na2CO3) | s | irritant | PENDING |
| `species.na2s` (Na2S) | s | toxic | PENDING |
| `species.zncl2` (ZnCl2) | aq | irritant | PENDING |
| `species.alcl3` (AlCl3) | aq | corrosive | PENDING |
| `species.cuso4` (CuSO4) | aq | irritant | PENDING |
| `species.agno3` (AgNO3) | aq | corrosive | PENDING |
| `species.br2` (Br2) | l | toxic, corrosive | PENDING |
| `species.i2` (I2) | s | irritant | PENDING |
| `species.cl2` (Cl2) | g | toxic, oxidizer | PENDING |
| `species.etanol` (etanol) | l | flammable | PENDING |
| `species.sirka` (sirka) | aq | irritant | PENDING |
| `species.so2` (SO2) | g | toxic, irritant | PENDING |
| `species.znso4` (ZnSO4) | aq | irritant | PENDING |
| `species.cucl2` (CuCl2) | aq | irritant | PENDING |
| `species.nahso4` (NaHSO4) | s | irritant | PENDING |
| `species.bacl2` (BaCl2) | aq | toxic | PENDING |
| `species.nh3` (NH3) | g | toxic, irritant | PENDING |
| `species.nano3` (NaNO3) | aq | oxidizer | PENDING |
| `species.k2s` (K2S) | aq | toxic | PENDING |
| `species.p` (P) | s | flammable | PENDING |
| `species.p2o5` (P2O5) | s | corrosive | PENDING |
| `species.h3po4` (H3PO4) | aq | irritant | PENDING |
| `species.na3po4` (Na3PO4) | aq | irritant | PENDING |
| `species.so3` (SO3) | g | corrosive | PENDING |
| `species.h2s` (H2S) | g | toxic, flammable | PENDING |
| `species.co` (CO) | g | toxic | PENDING |
