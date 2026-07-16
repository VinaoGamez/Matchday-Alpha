$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$projectName = if ($env:MATCHDAY_PAGES_PROJECT) { $env:MATCHDAY_PAGES_PROJECT } else { 'matchday-football-alpha' }
$linkFile = Join-Path $root 'LINK-FIXO.txt'

Write-Host ''
Write-Host ' MATCHDAY FOOTBALL - PUBLICAR LINK FIXO'
Write-Host ' ======================================'
Write-Host ''

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js/npm nao encontrado. Instale Node.js e rode npm install.'
  exit 1
}

Write-Host 'Gerando bundle (npm run build)...'
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Verificando login Cloudflare...'
$whoami = npx --yes wrangler whoami 2>&1 | Out-String
if ($whoami -match 'not authenticated|Please run') {
  Write-Host 'Conta Cloudflare nao conectada. Abrindo login no navegador...'
  npx --yes wrangler login
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Login cancelado ou falhou. Crie conta gratis em https://dash.cloudflare.com/sign-up e tente novamente.'
    exit 1
  }
}

Write-Host ''
Write-Host 'Publicando em Cloudflare Pages...'
Write-Host "Projeto: $projectName"
Write-Host ''

npx --yes wrangler pages deploy dist --project-name $projectName --branch main
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host 'Falha no deploy. Rode manualmente: npx wrangler login'
  exit $LASTEXITCODE
}

$baseUrl = "https://$projectName.pages.dev"
$homeUrl = "$baseUrl/home.html"
$newGameUrl = "$baseUrl/index.html?novo=1"

@(
  'MATCHDAY FOOTBALL - LINK FIXO (TESTERS)'
  ''
  'Pagina inicial:'
  $homeUrl
  ''
  'Novo jogo:'
  $newGameUrl
  ''
  'Link base:'
  $baseUrl
  ''
  'Este endereco e permanente enquanto o projeto existir no Cloudflare Pages.'
  'Para atualizar a versao dos testers, execute PUBLICAR-LINK-FIXO.bat novamente.'
  ''
  "Projeto Cloudflare Pages: $projectName"
  "Publicado em: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
) | Set-Content -Path $linkFile -Encoding UTF8

Write-Host ''
Write-Host 'Link fixo publicado:'
Write-Host "  $homeUrl"
Write-Host ''
Write-Host "Salvo em: $linkFile"
Write-Host ''
