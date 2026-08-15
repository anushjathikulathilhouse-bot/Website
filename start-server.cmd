@echo off
REM  Ultra-minimal Premiere Timeline - Start local server
REM  Uses Node dev-server if npm/node is available, otherwise Python fallback.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  echo [1/2] Installing dependencies (if needed)...
  if not exist "node_modules" call npm install --no-audit --no-fund 2>nul
  echo.
  echo [2/2] Starting dev server on http://localhost:8080
  start "" http://localhost:8080
  call node scripts/dev-server.mjs
  goto :eof
)

where py >nul 2>nul
if %ERRORLEVEL% NEQ 0 where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  echo Using Python fallback...
  if not exist node_modules ( echo Node not found; skipping dependency install )
  set "PORT=8080"
  start "" http://localhost:8080
  where py >nul 2>nul && ( py -3 -m http.server 8080 & goto :eof )
  python -m http.server 8080
  goto :eof
)

echo.
echo ERROR: Neither Node.js nor Python found on this machine.
echo Please install Node.js 18+ from https://nodejs.org/ (recommended)
echo or install Python 3 from https://www.python.org/.
echo.
pause
