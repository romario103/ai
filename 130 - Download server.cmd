@echo off

echo === Chrome starten... ===
call "050 - Start Chrome Debug Mode.cmd"

REM === start_server.bat ===
REM Start de HTTP-server.

node "%~dp0scripts\server.js"

echo.
echo Exit code: %ERRORLEVEL%
pause