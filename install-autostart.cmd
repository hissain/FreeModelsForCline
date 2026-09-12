@echo off
echo Configuring OpenRouter Proxy to start on system boot/login...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut(\"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\OpenRouterProxy.lnk\"); $s.TargetPath = 'powershell.exe'; $s.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command \"\"\"Start-Process -FilePath ''%~dp0run-proxy.cmd'' -WorkingDirectory ''%~dp0'' -WindowStyle Hidden\"\"\"'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'OpenRouter Proxy Port 8081'; $s.Save(); Write-Host '[OK] Startup shortcut created at:' \"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\OpenRouterProxy.lnk\" -ForegroundColor Green"
pause
