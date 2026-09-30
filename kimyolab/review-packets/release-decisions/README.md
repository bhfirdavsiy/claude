# Release decisions — packet (P1.9)

> Faqat **content owner** (inson) uchun. Machine eligibility — shart, qaror emas. Agent `RELEASE` qarorini bermaydi.

Kutilayotgan activity’lar: **27**. Har biri `packet.json`da: activityId, LU, runtime readiness, content review, accessibility, route, engine, renderer, bog‘liqliklar, lifecycle, basisHash, eligibility.

1. Workbench → **Release decisions** tabi (rol: `content-owner`).
2. Qaror: `RELEASE` (faqat ELIGIBLE bo‘lsa), `KEEP_PENDING`, `DISABLE`, `CHANGE_REQUIRED` — `RELEASE`dan boshqasi uchun izoh majburiy.
3. Eksport → `npm run review:validate -- <fayl>` → inson `npm run review:import -- <fayl>`.
4. Content o‘zgarsa basisHash o‘zgaradi va qaror **STALE** bo‘ladi.

Release qarori pilot owner sign-off’ining o‘rnini bosmaydi.
