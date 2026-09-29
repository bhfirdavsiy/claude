# KimyoLab v20 — Windows real-browser gate

Run from an unrestricted Windows workstation with current Chrome or Edge and Node.js 22+.

Double-click:

`scripts/windows/Run_KimyoLab_Browser_Gates.cmd`

The runner:
1. verifies Node.js;
2. installs dependencies only when missing;
3. runs the production real-browser gates;
4. refreshes Stable status;
5. collects machine-readable reports and screenshots;
6. creates `KimyoLab_v20_Browser_Evidence.zip`.

A managed-browser URL policy is recorded as **BLOCKED**, never PASS. Visual screenshots still require a real human `VISUAL-001` review.
