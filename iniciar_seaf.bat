@echo off
setlocal EnableExtensions DisableDelayedExpansion

:: ================================================================
:: SEAF - Inicializador de ambiente local
:: Inicia backend e frontend usando exclusivamente o ambiente
:: funcional isolado definido em .seaf-local.env.
:: Nao altera .env, bancos protegidos ou migracoes.
:: ================================================================

set "SEAF_ROOT=%~dp0"
if "%SEAF_ROOT:~-1%"=="\" set "SEAF_ROOT=%SEAF_ROOT:~0,-1%"

title SEAF - Inicializador
echo ========================================
echo    SEAF - Iniciar ambiente local
echo ========================================
echo.

:: ------------------------------------------------------------------
:: 1. Estrutura do projeto
:: ------------------------------------------------------------------
if not exist "%SEAF_ROOT%\backend\package.json" (
    echo [ERRO] Pasta backend nao encontrada em:
    echo        "%SEAF_ROOT%\backend"
    echo Coloque este arquivo na raiz do projeto.
    if not defined SEAF_NO_PAUSE pause
    exit /b 1
)

if not exist "%SEAF_ROOT%\frontend\package.json" (
    echo [ERRO] Pasta frontend nao encontrada em:
    echo        "%SEAF_ROOT%\frontend"
    echo Coloque este arquivo na raiz do projeto.
    if not defined SEAF_NO_PAUSE pause
    exit /b 1
)

if not exist "%SEAF_ROOT%\node_modules" (
    echo [ERRO] Dependencias nao instaladas.
    echo Execute "npm ci" na raiz do projeto antes de iniciar.
    if not defined SEAF_NO_PAUSE pause
    exit /b 1
)

:: ------------------------------------------------------------------
:: 2. Node.js
:: ------------------------------------------------------------------
where node.exe >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado no PATH.
    if not defined SEAF_NO_PAUSE pause
    exit /b 1
)

:: ------------------------------------------------------------------
:: 3. Arquivo de ambiente funcional isolado
:: ------------------------------------------------------------------
set "SEAF_ENV_FILE=%SEAF_ROOT%\.seaf-local.env"
if not exist "%SEAF_ENV_FILE%" (
    echo [ERRO] Arquivo de ambiente funcional nao encontrado:
    echo        "%SEAF_ENV_FILE%"
    echo.
    echo Crie este arquivo com DATABASE_URL apontando para seaf_gestao_functional
    echo usando a conta restrita seaf_functional_run. Nao inclua no Git.
    if not defined SEAF_NO_PAUSE pause
    exit /b 1
)

echo [SEAF] Verificando ambiente funcional isolado...
echo.

:: ------------------------------------------------------------------
:: 4. Validacao fail-closed, inicio, health check e registro de PIDs
:: ------------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';$root='%SEAF_ROOT%';$envFile=Join-Path $root '.seaf-local.env';$pidFile=Join-Path $root '.seaf-pids.json';$art=Join-Path $root '.artifacts';$api=$null;$web=$null;$wrotePid=$false;function Busy($p){$c=New-Object System.Net.Sockets.TcpClient;try{$c.Connect('127.0.0.1',$p);return $true}catch{return $false}finally{$c.Close()}};try{$cfg=@{};foreach($line in Get-Content -LiteralPath $envFile){$t=$line.Trim();if($t -eq '' -or $t.StartsWith('#')){continue};$i=$t.IndexOf('=');if($i -lt 1){continue};$k=$t.Substring(0,$i).Trim();$v=$t.Substring($i+1).Trim();$q=[string][char]34;if($v.Length -ge 2 -and $v.StartsWith($q) -and $v.EndsWith($q)){$v=$v.Substring(1,$v.Length-2)};$cfg[$k]=$v};$url=$cfg['DATABASE_URL'];if([string]::IsNullOrWhiteSpace($url)){throw 'DATABASE_URL ausente em .seaf-local.env.'};$uri=$null;if(-not [System.Uri]::TryCreate($url,[System.UriKind]::Absolute,[ref]$uri)){throw 'DATABASE_URL invalida.'};if($uri.Scheme -ne 'mysql'){throw 'DATABASE_URL deve usar mysql://.'};if($uri.Host -ne '127.0.0.1'){throw 'DATABASE_URL deve apontar para 127.0.0.1.'};if($uri.Port -ne 3306){throw 'DATABASE_URL deve usar a porta 3306.'};$db=$uri.AbsolutePath.Trim('/');if($db -ne 'seaf_gestao_functional'){throw ('Banco nao autorizado: '+$db+'. Use somente seaf_gestao_functional.')};if($uri.UserInfo.Split(':')[0] -eq 'root'){throw 'A conta de execucao nao pode ser root.'};if($cfg.ContainsKey('NODE_ENV') -and $cfg['NODE_ENV'] -eq 'production'){throw 'NODE_ENV=production nao e permitido neste launcher.'};$apiPort=3001;if($cfg.ContainsKey('PORT')){$apiPort=[int]$cfg['PORT']};if(-not (Busy 3306)){throw 'MariaDB inacessivel em 127.0.0.1:3306. Inicie o modulo MySQL no XAMPP Control Panel antes de executar o SEAF.'};foreach($p in @($apiPort, 5173)){$conns=Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue;foreach($c in $conns){$proc=Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue;if($proc -and $proc.ProcessName -eq 'node'){$cmd='';try{$cmd=(Get-CimInstance Win32_Process -Filter ('ProcessId = '+$proc.Id)).CommandLine}catch{};if($cmd -notlike ('*'+$root+'*')){Write-Host ('[SEAF] Liberando porta '+$p+' ocupada por processo externo PID '+$proc.Id+'...');Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue;Start-Sleep -Milliseconds 500}}}};if(Busy $apiPort){throw ('Porta '+$apiPort+' ocupada. Execute parar_seaf.bat antes de iniciar.')};if(Busy 5173){throw 'Porta 5173 ocupada. Execute parar_seaf.bat antes de iniciar.'};if(Test-Path -LiteralPath $pidFile){$old=Get-Content -LiteralPath $pidFile -Raw|ConvertFrom-Json;$alive=@();foreach($p in $old.PSObject.Properties){if(Get-Process -Id ([int]$p.Value) -ErrorAction SilentlyContinue){$alive+=$p.Name}};if($alive.Count -gt 0){throw ('SEAF ja esta em execucao: '+($alive -join ', ')+'. Execute parar_seaf.bat primeiro.')};Remove-Item -LiteralPath $pidFile -Force;Write-Host '[SEAF] Arquivo de PIDs obsoleto removido.'};New-Item -ItemType Directory -Path $art -Force|Out-Null;$env:DATABASE_URL=$url;$env:NODE_ENV='development';$env:PORT=('{0}' -f $apiPort);$env:MAIL_ENABLED='0';if($cfg.ContainsKey('CORS_ORIGINS')){$env:CORS_ORIGINS=$cfg['CORS_ORIGINS']};if($cfg.ContainsKey('ADMIN_TASK_CREATION_ENABLED')){$env:ADMIN_TASK_CREATION_ENABLED=$cfg['ADMIN_TASK_CREATION_ENABLED']};if($cfg.ContainsKey('LOGIN_RATE_MAX_ATTEMPTS')){$env:LOGIN_RATE_MAX_ATTEMPTS=$cfg['LOGIN_RATE_MAX_ATTEMPTS']};$apiOut=Join-Path $art 'seaf-api.out.log';$apiErr=Join-Path $art 'seaf-api.err.log';Write-Host '[SEAF] Iniciando backend...';$api=Start-Process -FilePath 'node' -ArgumentList 'src/server.js' -WorkingDirectory (Join-Path $root 'backend') -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -WindowStyle Hidden -PassThru;$apiOk=$false;for($i=0;$i -lt 80;$i++){try{$r=Invoke-WebRequest -Uri ('http://127.0.0.1:'+$apiPort+'/api/v1/health') -UseBasicParsing -TimeoutSec 3;if($r.StatusCode -eq 200){$apiOk=$true;break}}catch{};if($api.HasExited){break};Start-Sleep -Milliseconds 500};if(-not $apiOk){$tail='';if(Test-Path -LiteralPath $apiErr){$tail=(Get-Content -LiteralPath $apiErr -Tail 12) -join ' / '};throw ('Backend nao respondeu no health check. '+$tail)};Write-Host '[SEAF] Backend ativo.';Write-Host '[SEAF] Iniciando frontend...';$vite=Join-Path $root 'node_modules\vite\bin\vite.js';if(-not (Test-Path -LiteralPath $vite)){throw 'Vite nao encontrado em node_modules. Execute npm ci na raiz.'};$webOut=Join-Path $art 'seaf-web.out.log';$webErr=Join-Path $art 'seaf-web.err.log';$web=Start-Process -FilePath 'node' -ArgumentList $vite,'--host','127.0.0.1','--port','5173','--strictPort' -WorkingDirectory (Join-Path $root 'frontend') -RedirectStandardOutput $webOut -RedirectStandardError $webErr -WindowStyle Hidden -PassThru;$webOk=$false;for($i=0;$i -lt 80;$i++){try{$r=Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 3;if($r.StatusCode -eq 200){$webOk=$true;break}}catch{};if($web.HasExited){break};Start-Sleep -Milliseconds 500};if(-not $webOk){$tail='';if(Test-Path -LiteralPath $webErr){$tail=(Get-Content -LiteralPath $webErr -Tail 12) -join ' / '};throw ('Frontend nao respondeu. '+$tail)};[ordered]@{backend=$api.Id;frontend=$web.Id}|ConvertTo-Json|Set-Content -LiteralPath $pidFile -Encoding ASCII;$wrotePid=$true;Write-Host '';Write-Host '[SEAF] Ambiente iniciado com sucesso.';Write-Host ('[SEAF] API:   http://127.0.0.1:'+$apiPort+'/api/v1/health');Write-Host '[SEAF] Web:   http://localhost:5173';Write-Host ('[SEAF] PIDs:  backend='+$api.Id+'  frontend='+$web.Id);if(-not $env:SEAF_NO_BROWSER){Start-Process 'http://localhost:5173'}}catch{Write-Host ('[SEAF][ERRO] '+$_.Exception.Message);if($web){Stop-Process -Id $web.Id -Force -ErrorAction SilentlyContinue};if($api){Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue};if($wrotePid -and (Test-Path -LiteralPath $pidFile)){Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue};exit 1}"

if errorlevel 1 (
    echo.
    echo [SEAF] Inicializacao falhou. Nenhum banco protegido foi alterado.
    if not defined SEAF_NO_PAUSE pause
    exit /b 1
)

echo.
if not defined SEAF_NO_PAUSE pause
endlocal