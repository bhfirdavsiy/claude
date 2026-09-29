@echo off
setlocal EnableExtensions
cd /d "%~dp0\..\.."
if "%~1"=="" (
  echo Usage: scripts\windows\Import_KimyoLab_Browser_Evidence.cmd ^<unpacked-browser-evidence-folder^>
  exit /b 2
)
call npm run browser:evidence:import -- "%~1" || exit /b 20
call npm run signoff:targets || exit /b 21
call npm run signoff:templates || exit /b 22
call npm run reviewer:workspace || exit /b 23
call npm run stable:status
call npm run tracker:build || exit /b 24
echo Browser evidence imported. VISUAL-001 still requires human screenshot review.
exit /b 0
