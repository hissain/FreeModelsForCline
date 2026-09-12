@echo off
echo Removing OpenRouter Proxy from Startup...
powershell -NoProfile -Command "$path = \"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\OpenRouterProxy.lnk\"; if (Test-Path $path) { Remove-Item $path -Force; Write-Host '[OK] Startup shortcut removed.' -ForegroundColor Yellow } else { Write-Host 'No startup shortcut found.' }"
pause
