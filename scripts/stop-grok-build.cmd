@echo off
rem Double-click entry point for stop-grok-build.ps1.
rem start /min + -WindowStyle Hidden so this cmd window closes right away.
start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0stop-grok-build.ps1"
exit /b 0
