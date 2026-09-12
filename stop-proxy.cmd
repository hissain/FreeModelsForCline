@echo off
echo Stopping OpenRouter Proxy on port 8081...
powershell -NoProfile -Command ^
  "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*router.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('Stopped node process (PID ' + $_.ProcessId + ')') };" ^
  "Get-CimInstance Win32_Process -Filter \"Name = 'cmd.exe'\" | Where-Object { $_.CommandLine -like '*run-proxy*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('Stopped runner loop (PID ' + $_.ProcessId + ')') };" ^
  "Write-Host '[OK] OpenRouter Proxy stopped.' -ForegroundColor Green"
pause
