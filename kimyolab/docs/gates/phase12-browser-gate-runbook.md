# Phase 12 real-browser gate runbook

The repository has a dependency-free production build and an automated real-browser gate runner.

## Run on an unrestricted Windows workstation

Requirements:
- Node.js 22+
- Google Chrome or Microsoft Edge

From the project directory:

```bat
npm run prod:build
npm run http:smoke
npm run browser:gates
npm run stable:status
```

`browser:gates` automatically looks for Chrome/Edge on Windows and Chromium/Chrome on Linux.

Expected browser evidence:
- E2E route smoke: home, search, progress, learning unit, practice, worksheet;
- JavaScript exception / severe console error count;
- real DOM accessibility-name smoke + Chromium accessibility tree;
- FCP/LCP/CLS/navigation timing smoke;
- screenshots under `reports/visual-regression/phase12-smoke/`.

The visual gate remains `PENDING` after screenshots are captured until a human reviewer checks the screenshots. Do not mark it approved automatically.

## Managed-browser environments

If the browser displays “Your organization doesn’t allow you to view this site”, the runner records:

```text
MANAGED_BROWSER_URL_POLICY
```

This is an environment blocker, not a product PASS. Run the same command on an unrestricted workstation.
