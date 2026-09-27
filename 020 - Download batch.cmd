@echo off

echo === Chrome starten... ===
call "005 - Start Chrome Debug Mode.cmd"

REM === start_batch.bat ===
REM Start de batch-verwerker.

node "%~dp0scripts\batch.js"

echo.
echo Exit code: %ERRORLEVEL%
pause