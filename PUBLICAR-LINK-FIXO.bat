@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo  MATCHDAY FOOTBALL - LINK FIXO PARA TESTERS
echo  ==========================================
echo.
echo  Publica a pasta dist/ no Cloudflare Pages.
echo  O link fica permanente (ex.: matchday-football-alpha.pages.dev).
echo.
echo  Requisitos: Node.js, conta gratuita Cloudflare (login na 1a vez).
echo  O navegador abrira para autorizar — necessario para o link fixo funcionar.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-cloudflare-pages.ps1"
if errorlevel 1 (
  echo.
  echo  O link fixo NAO foi publicado. Use INICIAR-LINK-EXTERNO.bat para link temporario.
)
echo.
pause
