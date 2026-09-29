@echo off
setlocal EnableExtensions
cd /d "%~dp0\..\.."
if "%~1"=="" (
  echo Usage: scripts\windows\Import_KimyoLab_Beta_Approvals.cmd ^<filled-beta-register.json^>
  exit /b 2
)
call npm run beta:approvals:import -- "%~1" || exit /b 40
call npm run approvals:refresh || exit /b 41
echo Beta approval decisions imported and Stable status refreshed.
exit /b 0
