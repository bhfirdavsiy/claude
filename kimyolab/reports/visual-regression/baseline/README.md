# Visual baseline status

Visual baseline capture is still OPEN.

Attempts made:
1. Chromium `--headless --screenshot` — timed out with DBus/zygote errors.
2. Chromium under Xvfb — timed out with the same browser startup problems.
3. Playwright using system Chromium — navigation blocked by managed policy `URLBlocklist: ["*"]` (`net::ERR_BLOCKED_BY_ADMINISTRATOR`).

No fabricated screenshot is accepted as regression evidence. Capture must be repeated in an unrestricted browser environment before the Phase 0 gate is marked green.
