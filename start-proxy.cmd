@echo off
echo Starting OpenRouter Proxy in the background on port 8081...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~dp0run-proxy.cmd' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
echo [OK] Proxy started in background.
echo Check status anytime with: status-proxy.cmd
timeout /t 2 /nobreak >nul
