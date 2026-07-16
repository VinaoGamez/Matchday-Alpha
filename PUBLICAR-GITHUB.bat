@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo  MATCHDAY FOOTBALL - LINK FIXO VIA GITHUB PAGES
echo  ================================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo  Git nao encontrado no PATH.
  echo  Instale: https://git-scm.com/download/win
  echo  Depois execute este arquivo novamente.
  echo.
  goto :manual
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo  Pasta ainda nao e um repositorio Git.
  echo  Siga os passos em LINK-GITHUB-SETUP.txt
  echo.
  goto :manual
)

for /f "delims=" %%r in ('git remote get-url origin 2^>nul') do set "REMOTE=%%r"
if not defined REMOTE (
  echo  Nenhum remote "origin" configurado.
  echo  Siga os passos em LINK-GITHUB-SETUP.txt
  echo.
  goto :manual
)

echo  Remote: %REMOTE%
echo.
echo  Enviando codigo para o GitHub...
echo  O deploy automatico publica em GitHub Pages apos o push.
echo.

git add -A
git status --short
echo.
set /p MSG=Descricao do commit (Enter = atualiza build testers): 
if "%MSG%"=="" set "MSG=Atualiza build de testers"
git commit -m "%MSG%" 2>nul
git push -u origin HEAD
if errorlevel 1 (
  echo.
  echo  Falha no push. Verifique login GitHub e branch main/master.
  goto :manual
)

echo.
echo  Push concluido. Aguarde 1-3 min e abra:
echo  https://SEU-USUARIO.github.io/NOME-DO-REPO/home.html
echo  ^(substitua pelo seu usuario e nome do repositorio^)
echo.
echo  Acompanhe em: GitHub ^> Actions ^> Deploy testers
goto :end

:manual
type LINK-GITHUB-SETUP.txt 2>nul

:end
echo.
pause
