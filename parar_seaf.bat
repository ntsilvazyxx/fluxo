@echo off
setlocal EnableExtensions DisableDelayedExpansion

:: ================================================================
:: SEAF - Encerrador de ambiente local
:: Encerra somente os processos iniciados por iniciar_seaf.bat.
:: Nao encerra processos de terceiros nem toca em bancos/.env.
:: ================================================================

set "SEAF_ROOT=%~dp0"
if "%SEAF_ROOT:~-1%"=="\" set "SEAF_ROOT=%SEAF_ROOT:~0,-1%"

title SEAF - Encerramento
echo ========================================
echo    SEAF - Parar ambiente local
echo ========================================
echo.

:: ------------------------------------------------------------------
:: 1. Arquivo de PIDs
:: ------------------------------------------------------------------
set "SEAF_PID_FILE=%SEAF_ROOT%\.seaf-pids.json"

if not exist "%SEAF_PID_FILE%" (
    echo [SEAF] Nenhum arquivo de PIDs encontrado em:
    echo        "%SEAF_PID_FILE%"
    echo O sistema nao parece estar em execucao pelos scripts do SEAF.
    echo.
    if not defined SEAF_NO_PAUSE pause
    exit /b 0
)

echo [SEAF] Localizando processos do SEAF...

:: ------------------------------------------------------------------
:: 2. Encerramento por PID, com verificacao de dono e da porta
:: ------------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';$root='%SEAF_ROOT%';$pidFile=Join-Path $root '.seaf-pids.json';$ports=@{backend=3001;frontend=5173};$stopped=@();$missing=@();$skipped=@();try{$pids=Get-Content -LiteralPath $pidFile -Raw|ConvertFrom-Json;if($null -eq $pids){throw 'Arquivo de PIDs vazio ou invalido.'};foreach($p in $pids.PSObject.Properties){$name=$p.Name;$id=[int]$p.Value;if($id -le 0){continue};$proc=Get-Process -Id $id -ErrorAction SilentlyContinue;if(-not $proc){$missing+=($name+' PID '+$id);continue};$cmd='';try{$cmd=(Get-CimInstance Win32_Process -Filter ('ProcessId = '+$id) -ErrorAction Stop).CommandLine}catch{};if($proc.ProcessName -ne 'node'){$skipped+=($name+' PID '+$id+' nao e node');continue};$expected=$ports[$name];$owns=$false;if($expected){try{$owns=[bool](Get-NetTCPConnection -LocalPort $expected -State Listen -ErrorAction Stop|Where-Object OwningProcess -eq $id)}catch{}};if(-not $owns -and $cmd -and $cmd -like ('*'+$root+'*')){$owns=$true};if(-not $owns){$skipped+=($name+' PID '+$id+' nao pertence ao SEAF');continue};$kids=Get-CimInstance Win32_Process -Filter ('ParentProcessId = '+$id);foreach($kid in $kids){Stop-Process -Id $kid.ProcessId -Force -ErrorAction SilentlyContinue};Stop-Process -Id $id -Force -ErrorAction SilentlyContinue;$stopped+=$name;Write-Host ('[SEAF] '+$name+' encerrado - PID '+$id+'.')};foreach($m in $missing){Write-Host ('[SEAF] '+$m+': nao encontrado, ja encerrado.')};foreach($s in $skipped){Write-Host ('[SEAF] '+$s+' - ignorado.')};Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue;$busy=@();foreach($port in 3001,5173){$c=New-Object System.Net.Sockets.TcpClient;try{$c.Connect('127.0.0.1',$port);$busy+=$port}catch{}finally{$c.Close()}};if($busy.Count -gt 0){Write-Host ('[SEAF][AVISO] Portas ainda em uso: '+($busy -join ', '))};Write-Host '';if($stopped.Count -gt 0){Write-Host '[SEAF] Sistema encerrado com sucesso.'}else{Write-Host '[SEAF] Nenhum processo do SEAF estava em execucao.'}}catch{Write-Host ('[SEAF][ERRO] '+$_.Exception.Message);exit 1}"

if errorlevel 1 (
    echo.
    echo [SEAF] Ocorreram problemas ao encerrar os processos.
    if not defined SEAF_NO_PAUSE pause
    exit /b 1
)

echo.
if not defined SEAF_NO_PAUSE pause
endlocal