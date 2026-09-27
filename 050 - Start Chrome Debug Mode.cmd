@echo off
setlocal

REM === Config uitlezen uit config.json ===
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command ^
  "$c = Get-Content '%~dp0config.json' -Raw | ConvertFrom-Json; Write-Output $c.chromePad"`) do set CHROME_PAD=%%A
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command ^
  "$c = Get-Content '%~dp0config.json' -Raw | ConvertFrom-Json; Write-Output $c.chromeProfiel"`) do set CHROME_PROFIEL=%%A
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command ^
  "$c = Get-Content '%~dp0config.json' -Raw | ConvertFrom-Json; Write-Output $c.ahkPad"`) do set AHK_PAD=%%A

echo === Chrome starten... ===
start "" "%CHROME_PAD%" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="%CHROME_PROFIEL%" ^
  --no-first-run ^
  --no-default-browser-check ^
  "https://perchance.org/cy59utrbbe"

echo === Herschik nu de Windows... ===
pause

echo === Focus op de pagina zetten... ===
helpers\perchance_focus.ahk

endlocal