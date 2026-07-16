@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PORT=5081"
set "DEV_PORT=5080"
set "TESTER_PORT=5081"
set "TOOLS=%~dp0tools"
set "CLOUDFLARED=%TOOLS%\cloudflared.exe"

echo.
echo  MATCHDAY FOOTBALL - LINK EXTERNO (TESTERS)
echo  ============================================
echo  Dev local: porta %DEV_PORT%  ^|  Testers: porta %PORT% (hardened)
echo.

if not exist "%TOOLS%" mkdir "%TOOLS%"

if not exist "%CLOUDFLARED%" (
  echo  Baixando cloudflared...
  powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/download/2026.7.2/cloudflared-windows-amd64.exe' -OutFile '%CLOUDFLARED%' -UseBasicParsing"
)

netstat -ano | findstr ":%DEV_PORT%" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo  Servidor de desenvolvimento nao encontrado na porta %DEV_PORT%.
  echo  Iniciando servidor local para voce continuar testando...
  start "Matchday Dev Server" cmd /k "cd /d ""%~dp0"" && py -m http.server %DEV_PORT% --bind 127.0.0.1"
  timeout /t 2 >nul
)

echo.
echo  Preparando build de testers (npm run build)...
where npm >nul 2>&1
if not errorlevel 1 (
  call npm run build
) else (
  echo  Node/npm nao encontrado — link externo usara fallback com bloqueios parciais.
  echo  Instale Node.js e rode npm run build para bundle minificado sem fontes expostas.
)

netstat -ano | findstr ":%PORT%" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo  Iniciando servidor hardened de testers na porta %PORT%...
  start "Matchday Tester Server" cmd /k "cd /d ""%~dp0"" && py scripts\tester-server.py --port %PORT% --bind 127.0.0.1"
  timeout /t 2 >nul
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-tunnel.ps1"
pause
