@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0\..\.."
if "%~1"=="" (
  echo Usage: scripts\windows\Import_KimyoLab_Review_Returns.cmd ^<review-return-folder^>
  exit /b 2
)
set "RET=%~1"
if not exist "%RET%" (
  echo ERROR: folder not found: %RET%
  exit /b 3
)
set IMPORTED=0
for %%G in (CHEM-033 PROD-002 VISUAL-001) do (
  if exist "%RET%\%%G-approval.json" (
    echo Importing %%G...
    call npm run approval:import -- "%%G" "%RET%\%%G-approval.json" || exit /b 30
    set /a IMPORTED+=1
  )
)
for %%B in (beta1 beta2 beta3) do (
  if exist "%RET%\%%B-approval-register.json" (
    echo Importing %%B approvals...
    call npm run beta:approvals:import -- "%RET%\%%B-approval-register.json" || exit /b 31
    set /a IMPORTED+=1
  )
)
if !IMPORTED! EQU 0 (
  echo ERROR: no recognized review return files found.
  exit /b 4
)
call npm run reviewer:return:refresh || exit /b 32
echo Imported !IMPORTED! review file(s). Stable status and tracker refreshed.
exit /b 0
