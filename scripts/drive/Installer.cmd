@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-SeaPilotDrive.ps1" -NoConfigure
if errorlevel 1 pause
