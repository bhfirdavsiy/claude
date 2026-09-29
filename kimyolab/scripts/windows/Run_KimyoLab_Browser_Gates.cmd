@echo off
setlocal EnableExtensions
cd /d "%~dp0\..\.."

echo ============================================================
echo KimyoLab v20 - Real Browser Gate Runner
echo ============================================================

echo [1/6] Checking Node.js...
where node >nul 2>nul || (
  echo ERROR: Node.js is not installed or not in PATH.
  exit /b 10
)
for /f "tokens=*" %%v in ('node -v') do echo Node %%v

echo [2/6] Checking dependencies...
if not exist node_modules\vite\package.json (
  if exist package-lock.json (
    call npm ci || exit /b 11
  ) else (
    call npm install || exit /b 11
  )
)

echo [3/6] Checking external provider readiness...
call npm run external-labs:readiness || exit /b 12

echo [3/6] Running production browser gates...
call npm run browser:gates
set BROWSER_EXIT=%ERRORLEVEL%

echo [4/6] Refreshing Stable status...
call npm run signoff:targets >nul 2>nul
call npm run stable:status
set STATUS_EXIT=%ERRORLEVEL%

echo [5/6] Collecting evidence...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\windows\Collect_KimyoLab_Browser_Evidence.ps1"
set COLLECT_EXIT=%ERRORLEVEL%

echo [6/6] Result
if not "%BROWSER_EXIT%"=="0" (
  echo Browser gate did not pass. See browser-evidence\ and reports\browser-gates.json.
  echo A managed-browser URL policy is a BLOCKED result, not a PASS.
  exit /b %BROWSER_EXIT%
)
if not "%COLLECT_EXIT%"=="0" exit /b %COLLECT_EXIT%

echo Browser gates completed. Human visual approval can now review the captured screenshots.
exit /b 0
