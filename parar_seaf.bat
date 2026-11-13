@echo off
setlocal
cd /d "%~dp0"
title SEAF - Encerramento

echo ========================================
echo    SEAF - Parar ambiente local
 echo ========================================
echo.
echo Encerrando somente as janelas identificadas da SEAF...

taskkill /F /T /FI "WINDOWTITLE eq SEAF_BACKEND_LOCAL*" >nul 2>&1
if errorlevel 1 (echo Backend: janela nao encontrada ou ja encerrada.) else (echo Backend: encerrado.)

taskkill /F /T /FI "WINDOWTITLE eq SEAF_FRONTEND_LOCAL*" >nul 2>&1
if errorlevel 1 (echo Frontend: janela nao encontrada ou ja encerrada.) else (echo Frontend: encerrado.)

echo.
echo Outros processos Node.js, CMD, Nginx e MariaDB nao foram encerrados.
echo Se alguma janela foi renomeada, feche-a manualmente.
echo.
pause
endlocal
