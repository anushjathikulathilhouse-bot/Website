@echo off
REM =============================================================
REM  Generate manifest.json from audio files in /vocals folder
REM  Run this after adding new audio files to the vocals folder
REM =============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "FOLDER=vocals"
set "OUT=manifest.json"
if not exist "%FOLDER%" (
  echo ERROR: %FOLDER% folder not found.
  pause
  exit /b 1
)

echo [
echo Generating manifest for all audio files in %FOLDER%/...

(
  echo [
  set "first=1"
  for %%f in ("%FOLDER%\*.mp3" "%FOLDER%\*.wav" "%FOLDER%\*.ogg" "%FOLDER%\*.m4a" "%FOLDER%\*.aac" "%FOLDER%\*.flac") do (
    if exist "%%f" (
      if "!first!"=="1" (
        echo   { "name": "%%~nxf", "path": "%FOLDER%/%%~nxf" }
        set "first=0"
      ) else (
        echo ,  { "name": "%%~nxf", "path": "%FOLDER%/%%~nxf" }
      )
    )
  )
  echo ]
) > "%OUT%"

echo Done. manifest.json:
type "%OUT%"
echo.
pause
exit /b 0
