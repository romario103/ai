@echo off

echo === Chrome starten... ===
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="C:\chrome-debug-profile" ^
  --no-first-run ^
  --no-default-browser-check ^
  "https://perchance.org/cy59utrbbe"

echo === Herschik nu de Windows... ===
pause

echo === Focus op de pagina zetten... ===
helpers\perchance_focus.ahk

REM === start_batch.bat ===
REM Start de batch-verwerker.

node "%~dp0scripts\batch.js"

echo.
echo Exit code: %ERRORLEVEL%
pause