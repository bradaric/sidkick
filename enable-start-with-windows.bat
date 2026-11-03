@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$startup = [Environment]::GetFolderPath('Startup'); $path = Join-Path $startup 'Sidkick.lnk'; $shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut($path); $shortcut.TargetPath = '%~dp0start-sidkick.bat'; $shortcut.WorkingDirectory = '%~dp0'; $shortcut.WindowStyle = 7; $shortcut.Description = 'Start the Sidkick ChatGPT bridge'; $shortcut.Save(); Write-Host 'Sidkick will start when you sign in to Windows.'"
if errorlevel 1 (
    echo.
    echo Could not enable Sidkick startup.
    pause
    exit /b 1
)
pause

