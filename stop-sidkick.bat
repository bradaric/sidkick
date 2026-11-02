@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-chatgpt-bridge.ps1"
if errorlevel 1 (
    echo.
    echo Sidkick failed to stop. Review the error above.
    pause
    exit /b 1
)

