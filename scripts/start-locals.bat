@echo off
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-LocalServices.ps1" -KeRoot "%~dp0.."
if errorlevel 1 pause
