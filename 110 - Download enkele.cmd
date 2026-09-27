@echo off

echo === Chrome starten... ===
call "050 - Start Chrome Debug Mode.cmd"

REM === Roept download.js aan met een vaste testprompt. ===
node "%~dp0scripts\download.js" "An owl that looks like an angel which is within a merkaba"

echo.
echo Exit code: %ERRORLEVEL%
pause