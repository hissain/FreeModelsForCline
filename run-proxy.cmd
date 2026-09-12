@echo off
title OpenRouter Proxy (Port 8081)
cd /d "%~dp0"

:loop
echo [%date% %time%] Starting OpenRouter proxy on port 8081... >> "%~dp0proxy.log"
"C:\Program Files\nodejs\node.exe" router.mjs >> "%~dp0proxy.log" 2>&1
echo [%date% %time%] Process exited (code: %ERRORLEVEL%). Restarting in 3 seconds... >> "%~dp0proxy.log"
timeout /t 3 /nobreak >nul
goto loop
