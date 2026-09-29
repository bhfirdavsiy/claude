@echo off
setlocal EnableExtensions
cd /d "%~dp0\..\.."
if "%~2"=="" (
  echo Usage: scripts\windows\Import_KimyoLab_Gate_Approval.cmd ^<CHEM-033^|PROD-002^|VISUAL-001^> ^<approval.json^>
  exit /b 2
)
call npm run approval:import -- "%~1" "%~2" || exit /b 30
call npm run approvals:refresh || exit /b 31
echo Approval imported and Stable status refreshed.
exit /b 0
