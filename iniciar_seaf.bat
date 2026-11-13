@echo off
setlocal
cd /d "%~dp0"
title SEAF - Inicializador

echo ========================================
echo    SEAF - Iniciar ambiente local
 echo ========================================
echo.

if not exist "backend\package.json" (
  echo [ERRO] Pasta backend nao encontrada.
  echo Coloque este arquivo na raiz do projeto.
  pause
  exit /b 1
)
if not exist "frontend\package.json" (
  echo [ERRO] Pasta frontend nao encontrada.
  pause
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js/npm nao encontrado no PATH.
  pause
  exit /b 1
)

if not exist "node_modules" if not exist "backend\node_modules" (
  echo [AVISO] Dependencias podem nao estar instaladas.
  echo Execute npm ci na raiz do projeto antes de iniciar.
  echo.
)

set "NODE_ENV=development"
set "STARTUP_SCRIPTED_MIGRATIONS=false"
set "STARTUP_SCRIPTED_MIGRATIONS_STRICT=false"

echo Iniciando backend...
start "SEAF_BACKEND_LOCAL" cmd /d /k "title SEAF_BACKEND_LOCAL && cd /d ""%~dp0backend"" && set ""NODE_ENV=development"" && set ""STARTUP_SCRIPTED_MIGRATIONS=false"" && set ""STARTUP_SCRIPTED_MIGRATIONS_STRICT=false"" && npm.cmd run dev"

echo Iniciando frontend...
start "SEAF_FRONTEND_LOCAL" cmd /d /k "title SEAF_FRONTEND_LOCAL && cd /d ""%~dp0frontend"" && npm.cmd run dev"

echo.
echo Aplicacao iniciada em janelas separadas.
echo Confira as URLs exibidas nos terminais.
echo O MariaDB/XAMPP deve estar iniciado separadamente.
echo Nenhuma migracao de banco foi executada por este script.
echo.
if /i "%~1"=="--pause" pause
endlocal
