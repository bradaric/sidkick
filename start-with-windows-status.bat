@echo off
setlocal
set "SIDKICK_SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Sidkick.lnk"
if exist "%SIDKICK_SHORTCUT%" (
    echo Sidkick automatic startup is ENABLED.
) else (
    echo Sidkick automatic startup is DISABLED.
)
pause

