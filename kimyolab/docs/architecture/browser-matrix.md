# Phase 0 Browser / Device Baseline

## Current automated environment

- Node.js: v22.16.0
- System Chromium: 144.0.7559.96 (Debian)
- Current application server: Node static server on `127.0.0.1:4173`

## Target matrix from TT v2.1

Final browser support is calibrated from Phase 0 and must include current-minus-two major versions for Chromium-family, Firefox, and Safari, plus Android Chromium equivalent.

## Environment limitation discovered during Phase 0

The container's managed Chromium policy has `URLBlocklist: ["*"]`. Playwright/system Chromium therefore rejects both localhost and file navigation with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. Direct Chromium screenshot attempts also hang on DBus/zygote startup. This prevents trustworthy browser screenshot/Web-Vitals capture inside this execution environment.

This is an **environmental evidence blocker**, not a product PASS. Phase 0 visual gate remains open until screenshots are captured in an unrestricted browser environment or equivalent browser runner.
