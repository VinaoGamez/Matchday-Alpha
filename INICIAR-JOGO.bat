@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PORT=5080"
set "PAGE=home.html"

echo.
echo  MATCHDAY FOOTBALL - SERVIDOR LOCAL
echo  =================================
echo.

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1 -ExpandProperty IPAddress); if ($ip) { $ip } else { '' }"`) do set "LOCAL_IP=%%i"

echo  Neste PC:
echo    http://127.0.0.1:%PORT%/%PAGE%
echo.

if defined LOCAL_IP (
  echo  Na rede local ^(compartilhar com outros dispositivos^):
  echo    http://%LOCAL_IP%:%PORT%/%PAGE%
  echo.
  > "LINK-COMPARTILHAMENTO.txt" (
    echo MATCHDAY FOOTBALL - LINK DE COMPARTILHAMENTO
    echo.
    echo Neste computador:
    echo http://127.0.0.1:%PORT%/%PAGE%
    echo.
    echo Na rede local:
    echo http://%LOCAL_IP%:%PORT%/%PAGE%
    echo.
    echo Mantenha esta janela aberta enquanto o jogo estiver hospedado.
    echo Pare o servidor com Ctrl+C ou fechando a janela.
  )
) else (
  echo  Nao foi possivel detectar o IP da rede local.
  echo  Use http://127.0.0.1:%PORT%/%PAGE% neste PC.
  echo.
  > "LINK-COMPARTILHAMENTO.txt" (
    echo MATCHDAY FOOTBALL - LINK DE COMPARTILHAMENTO
    echo.
    echo Neste computador:
    echo http://127.0.0.1:%PORT%/%PAGE%
  )
)

echo  Pagina inicial: %PAGE%
echo  Pressione Ctrl+C para encerrar o servidor.
echo.

where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://127.0.0.1:%PORT%/%PAGE%"
  py -m http.server %PORT% --bind 0.0.0.0
  exit /b
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://127.0.0.1:%PORT%/%PAGE%"
  python -m http.server %PORT% --bind 0.0.0.0
  exit /b
)

echo Python nao foi encontrado.
echo Instale o Python para hospedar o projeto localmente.
pause
