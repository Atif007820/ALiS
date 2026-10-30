@echo off
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js/npm was not found. Install Node.js 18 or newer, then run this file again.
  exit /b 1
)

call npm.cmd install
if errorlevel 1 exit /b %errorlevel%

call npx.cmd playwright install
if errorlevel 1 exit /b %errorlevel%

call npm.cmd test
exit /b %errorlevel%
