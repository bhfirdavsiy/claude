# ADR-P2-003 — Bitta mahsulot, ikki host (single product, dual host)

- **Holat:** qabul qilindi (P2.2).
- **Scope:** host chegarasi — portal-safe asos.
- **Qilinmadi:**
  - real `raqamlitalim.trm.uz` deploy (P3);
  - portal autentifikatsiyasi;
  - iframe arxitekturasi;
  - UI redesign;
  - yangi kontent yoki kimyo haqiqati.

## 1. Qaror

KimyoLab — **bitta** mahsulot. Unda bir xil repository, production modullar, content pack, kimyo engine’lari, `RendererRegistry`, assessment, evidence/mastery va learner UX bor.

U ikki **host** orqali yetkaziladi:

| Host | Transport | Qayerda |
|---|---|---|
| **path host** | HTTP, `basePath` ostida (`/` yoki `/kimyolab/`) | lokal server, portal simulyatsiyasi, P3 portal |
| **embedded host** | bitta HTML fayl, hash route, pack baytlari fayl ichida | taqdimot uchun standalone artefakt |

**Invariant:** SAME PRODUCT, SAME RUNTIME, SAME CONTENT, DIFFERENT HOST ADAPTER ONLY.

Standalone demo **emas**: unda alohida engine, renderer, kontent, assessment, progress yoki “demo success” yo‘q.

## 2. Host chegarasi

- `src/app/host.ts` — `KimyoLabHost`:
  - `basePath`, `assetBase`, `contentBase`, `apiBase`, `storageNamespace`;
  - `currentLocation()`, `href()`, `assetUrl()`, `apiUrl()`, `navigate()`, `onLocationChange()`;
  - `fetchContent`, ixtiyoriy `portalHomeUrl`.
- Host’ni **faqat** `src/app/bootstrap.ts` aniqlaydi (`resolveHost`). Manbalar:
  - HTTP sahifa: `<meta name="kimyolab-base-path">`;
  - standalone: `__KIMYOLAB_HOST__ = {kind:'embedded', content, assets}`.
- Feature, renderer, domain, runtime, assessment, mastery va kimyo engine’lari host turini bilmaydi:
  - ular mantiqiy route yozadi (`/learn/…`);
  - ular asset’ni mahsulot ildiziga nisbatan nomlaydi (`assets/…`);
  - `src/ui/host-paths.ts` bootstrap bergan xaritani qo‘llaydi.
- `__KIMYOLAB_STANDALONE__` flag’i olib tashlandi. Standalone endi global `fetch`ni almashtirmaydi.

## 3. Route modeli

Bitta mantiqiy route modeli (`parseAppRoute`) va ikki transport:

| Host | Misol |
|---|---|
| mantiqiy route | `/learn/lu.8.16/practice` |
| standalone | `#/learn/lu.8.16/practice` |
| portal host | `/kimyolab/learn/lu.8.16/practice` |

- `link()` haqiqiy `href`ni host orqali yozadi, mantiqiy route’ni `data-kl-route`da saqlaydi. Klik → `host.navigate`.
- Server `--base-path`/`KIMYOLAB_BASE_PATH` bilan subpath’da ishlaydi:
  - mount’dan tashqarisi 404;
  - `/kimyolab` → 308 `/kimyolab/`;
  - deep link va refresh `index.html`ga tushadi.

## 4. Content va asset

- `ContentClient`ning content bazasi endi **majburiy** va host’dan keladi. Site-root default yo‘q.
- Portal `/kimyolab/content/…` dan yuklaydi, standalone embedded transport’dan.
- Ikkala holatda ham bir xil manifest, checksum, versiya tekshiruvi ishlaydi (fail-closed). Standalone integrity’ni chetlab o‘tmaydi.
- Shell’dagi (`index.html`) root-absolute `src/href`larni production build `applyBasePath` bilan qayta yozadi.
- Standalone build asset’larni `data:` URL qilib joylaydi va shell’da root-absolute URL qolsa build’ni to‘xtatadi.

## 5. Saqlash va Web Locks namespace

| basePath | IndexedDB | Lock prefix |
|---|---|---|
| `/` (root, standalone) | `kimyolab-runtime` | `kimyolab.attempt.` |
| `/kimyolab/` | `kimyolab@/kimyolab/.runtime` | `kimyolab@/kimyolab/.attempt.` |

- `/` va standalone P2.2 dan oldingi nomlarni **aynan** saqlaydi, shuning uchun mavjud learner ma’lumoti joyida qoladi va migratsiya kerak emas.
- Subpath mount’lar ilgari ishlamagan, demak ularda ko‘chiriladigan eski ma’lumot yo‘q.
- Persistence va liveness implementatsiyasi ikki host uchun bitta; faqat nom parametr.

## 6. Service worker

Yo‘q va P2.2 da qo‘shilmaydi. Audit (`reports/host-architecture-audit.json`) har qanday ro‘yxatdan o‘tkazishni topadi. Qo‘shilsa, scope `basePath`dan kengaymasligi shart.

## 7. Brend

- **Canonical manba** — foydalanuvchi chatda tasdiqlagan original PNG (1254×1254, SHA-256 `243d59b0ed1a3e827a5f63522f816e445a43953e9b24492bd67d771533d2f7b0`). Joyi: `public/assets/brand/kimyolab-logo.png`, o‘zgartirilmaydi.
- **Delivery asset** — `public/assets/brand/kimyolab-logo.webp` (SHA-256 `c5afee42…`). Bu logo chat kanali orqali kelgan WebP ko‘rinishi; original bilan baytma-bayt bir xil **emas**. U derivative hisoblanadi.
- `reports/brand-integration.json` ikkalasini ajratadi: `canonicalSourceSha256`, `deliveryAssetSha256`, `derivedFromCanonical`, `visuallyEquivalent`. Oxirgi ikkisi faqat original bilan tekshirilgandan keyin tasdiqlanadi.
- P2.2 closeout (A1) tuzatishi: avvalgi test WebP’ni o‘zining hash’iga teng konstanta bilan solishtirardi (o‘z-o‘zini tasdiqlash). U olib tashlandi.
- **Blocker:** original PNG agent muhitida yo‘q (`BRAND_ASSET_MISSING`). Uni foydalanuvchi yuqoridagi yo‘lga o‘zgartirmasdan qo‘shishi kerak; test hash’ni tekshiradi.
- Vaqtinchalik “K” belgisi olib tashlandi. Logo host-safe asset yo‘li orqali ikkala host’da ko‘rsatiladi.

## 8. Progress

- Portal tayyorgarligi **alohida** metrika (`reports/portal-subpath-readiness.json`).
- U 0.4/0.6 boshqaruv formulasiga qo‘shilmaydi, chunki arxitektura ishi pedagogik to‘liqlikni oshirmaydi.
