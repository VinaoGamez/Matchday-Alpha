$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cloudflared = Join-Path $root 'tools\cloudflared.exe'
$port = if ($env:TESTER_PORT) { [int]$env:TESTER_PORT } else { 5081 }
$page = 'home.html'
$linkFile = Join-Path $root 'LINK-EXTERNO.txt'

if (-not (Test-Path $cloudflared)) {
  Write-Host 'cloudflared.exe nao encontrado em tools\. Execute INICIAR-LINK-EXTERNO.bat novamente.'
  exit 1
}

$listening = netstat -ano | Select-String ":$port\s" | Select-String 'LISTENING'
if (-not $listening) {
  Write-Host "Servidor hardened nao detectado na porta $port."
  Write-Host 'Execute INICIAR-LINK-EXTERNO.bat ou aguarde alguns segundos.'
  exit 1
}

Write-Host ''
Write-Host ' MATCHDAY FOOTBALL - LINK EXTERNO'
Write-Host ' ================================='
Write-Host ''
Write-Host 'Gerando tunel publico... (pode levar alguns segundos)'
Write-Host ''

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $cloudflared
$psi.Arguments = "tunnel --url http://127.0.0.1:$port"
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true

$proc = [System.Diagnostics.Process]::Start($psi)
$externalUrl = $null
$deadline = (Get-Date).AddSeconds(45)

while ((Get-Date) -lt $deadline -and -not $proc.HasExited) {
  while ($proc.StandardError.Peek() -ge 0) {
    $line = $proc.StandardError.ReadLine()
    Write-Host $line
    if ($line -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
      $externalUrl = $Matches[0]
      break
    }
  }
  if ($externalUrl) { break }
  Start-Sleep -Milliseconds 200
}

if (-not $externalUrl) {
  Write-Host 'Nao foi possivel obter o link externo.'
  exit 1
}

$shareUrl = "$externalUrl/$page"
@(
  'MATCHDAY FOOTBALL - LINK EXTERNO'
  ''
  'Pagina inicial:'
  $shareUrl
  ''
  'Link base do tunel:'
  $externalUrl
  ''
  'Mantenha esta janela aberta junto com o servidor hardened (porta 5081).'
  'Desenvolvimento local continua em http://127.0.0.1:5080 (nao exposto).'
  'O link expira quando o tunel for encerrado (Ctrl+C).'
) | Set-Content -Path $linkFile -Encoding UTF8

Write-Host ''
Write-Host 'Link externo pronto:'
Write-Host "  $shareUrl"
Write-Host ''
Write-Host "Salvo em: $linkFile"
Write-Host 'Pressione Ctrl+C para encerrar o tunel.'
Write-Host ''

try {
  Start-Process $shareUrl | Out-Null
} catch {}

$proc.WaitForExit()
