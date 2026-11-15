@echo off
rem Renew Groups ERP - installs the taskbar flash helper for the signed-in Windows user:
rem copies it to %LOCALAPPDATA%\RenewErpFlash, starts it hidden at every sign-in (Startup folder) and starts it now.

set "DEST=%LOCALAPPDATA%\RenewErpFlash"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

if not exist "%DEST%" mkdir "%DEST%"
copy /Y "%~dp0taskbar-flash-helper.ps1" "%DEST%\taskbar-flash-helper.ps1" >nul

rem a tiny VBS launcher runs PowerShell with no console window
> "%DEST%\start-hidden.vbs" echo CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%DEST%\taskbar-flash-helper.ps1""", 0, False
copy /Y "%DEST%\start-hidden.vbs" "%STARTUP%\RenewErpFlash.vbs" >nul

wscript.exe "%DEST%\start-hidden.vbs"
echo Renew ERP taskbar flash helper installed and running (http://localhost:47321).
pause
