@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$path = Join-Path ([Environment]::GetFolderPath('Startup')) 'Sidkick.lnk'; if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }; Write-Host 'Sidkick will not start automatically with Windows.'"
if errorlevel 1 (
    echo.
    echo Could not disable Sidkick startup.
    pause
    exit /b 1
)
pause

