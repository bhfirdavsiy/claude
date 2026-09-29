@echo off
setlocal EnableExtensions
cd /d "%~dp0\..\.."

echo ============================================================
echo KimyoLab v20 - Reviewer Workspace
 echo ============================================================
where node >nul 2>nul || (
  echo ERROR: Node.js is not installed or not in PATH.
  exit /b 10
)
call npm run reviewer:handoff || exit /b 11
start "" "review-packets\reviewer-workspace.html"
echo Reviewer workspace opened.
exit /b 0
