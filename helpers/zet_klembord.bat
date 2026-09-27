@echo off
powershell -NoProfile -Command "Set-Clipboard -Value ([Console]::In.ReadToEnd())"