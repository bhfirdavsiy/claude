# KimyoLab v20 — External Virtual Lab Integration

## Architecture

KimyoLab keeps native practice engines as the source of truth. External providers are optional supplements:

- `chem-lab-station`: reference/deep-link only;
- `chemai`: deep-link + self-reported observation evidence;
- `nobook`: official iframe/SDK adapter with scene save/restore support when partner access is configured.

External completion never updates mastery directly. A mapped KimyoLab LearningUnit/local assessment remains required.

## Mapping source

`content-src/external-lab-bindings.json`

Validate with:

```bash
npm run external-labs:validate
```

The validator writes `reports/external-lab-integration.json`.

## NOBOOK server configuration

Keep partner secrets on the server only:

```text
NOBOOK_APP_KEY=...
NOBOOK_APP_SECRET=...
NOBOOK_PID_SCOPE=...
NOBOOK_SDK_VERSION=2.2.1
NOBOOK_SDK_SHA256=<64-char sha256 of approved SDK artifact>
NOBOOK_EXPERIMENT_URL=...        # official experiment URL obtained through NOBOOK partner/API flow
NOBOOK_FRAME_SOURCE=https://*.nobook.com
```

KimyoLab exposes:

- `GET /api/external-labs/nobook/status`
- `POST /api/external-labs/nobook/auth`
- `POST /api/external-labs/nobook/session`

The auth endpoint signs on the server. `app_secret` is never returned to the browser.

## NOBOOK browser SDK seam

The public NOBOOK docs currently install their SDK from a Git-over-HTTP URL. KimyoLab does not automatically vendor or execute that dependency. After a licensed/version-pinned SDK artifact is approved, register its `Postmate` constructor through:

```ts
import {registerNobookPostmate} from './src/integrations/external-labs/nobook/sdk-adapter.ts';
registerNobookPostmate(Postmate);
```

The provider then uses the official-style communication contract (`config`, `switchModule`, `getData`, `setData`, `takeScreenShot`, `setSceneSave`).

## Evidence policy

- NOBOOK: scene state + optional screenshot can be stored as external evidence.
- ChemAI: student observation note can be stored after returning from the external lab.
- Chem Lab Station: reference only by default.

None of these evidence records means `mastered`. Mastery stays inside KimyoLab assessment/runtime.

## Production readiness contract

KimyoLab treats NOBOOK as production-ready only when all of the following are true:

1. server-side partner credentials are configured;
2. the experiment URL is HTTPS and belongs to `nobook.com` or a subdomain;
3. a licensed SDK module exists at `public/vendor/nobook/postmate.js`;
4. `NOBOOK_SDK_SHA256` matches that exact artifact byte-for-byte;
5. the module exports a Postmate-compatible constructor as `default` or `Postmate`.

Run `npm run external-labs:readiness` to generate `reports/external-provider-readiness.json`.
The report may list missing configuration names, but never secret values.
