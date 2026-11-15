@echo off
rem Renew Groups ERP - removes the taskbar flash helper for the signed-in Windows user.

del /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\RenewErpFlash.vbs" 2>nul
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*taskbar-flash-helper.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
rmdir /S /Q "%LOCALAPPDATA%\RenewErpFlash" 2>nul
echo Renew ERP taskbar flash helper removed.
pause
