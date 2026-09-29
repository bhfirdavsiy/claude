@echo off
cd /d %~dp0
if not exist dist\index.html call npm run build
node server.mjs
pause
