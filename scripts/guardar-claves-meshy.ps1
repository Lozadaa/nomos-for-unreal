# Guarda claves de API de Meshy de varias personas sin que se vean en pantalla.
# Se cifran con DPAPI (solo tu usuario de Windows en este PC puede leerlas) en
# %USERPROFILE%\.nomos\meshy-claves.json (Nomos las lee de ahí; NOMOS_MESHY_CLAVES cambia la ruta).
# Nada de esto va a ningún repositorio. Uso: powershell -ExecutionPolicy Bypass -File scripts\guardar-claves-meshy.ps1
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:USERPROFILE '.nomos'
$file = Join-Path $dir 'meshy-claves.json'
New-Item -ItemType Directory -Force $dir | Out-Null

$cuentas = @()
if (Test-Path $file) { $cuentas = @((Get-Content $file -Raw | ConvertFrom-Json).cuentas) }

Write-Host "Claves de Meshy. Deja el nombre vacío para terminar." -ForegroundColor Cyan
while ($true) {
  $nombre = (Read-Host "Nombre de la persona (vacío = terminar)").Trim()
  if (-not $nombre) { break }
  $segura = Read-Host "Clave de Meshy de $nombre (no se verá)" -AsSecureString
  if ($segura.Length -eq 0) { Write-Host "  Vacía: no se guarda." -ForegroundColor Yellow; continue }

  # Comprobación opcional del saldo, solo contra la API de Meshy.
  $plana = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
  try {
    $r = Invoke-RestMethod -Uri 'https://api.meshy.ai/openapi/v1/balance' -Headers @{ Authorization = "Bearer $plana" } -TimeoutSec 15
    Write-Host "  ${nombre}: clave válida, $($r.balance) créditos." -ForegroundColor Green
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 401 -or $code -eq 403) { Write-Host "  ${nombre}: Meshy rechaza la clave ($code). No se guarda." -ForegroundColor Red; $plana = $null; continue }
    Write-Host "  ${nombre}: no se pudo comprobar el saldo ($($_.Exception.Message)). Se guarda igual." -ForegroundColor Yellow
  }
  $plana = $null

  $cifrada = ConvertFrom-SecureString $segura
  $cuentas = @($cuentas | Where-Object { $_.nombre -ne $nombre }) + [pscustomobject]@{ nombre = $nombre; clave = $cifrada; guardada = (Get-Date).ToString('s') }
}

[pscustomobject]@{ version = 1; cuentas = $cuentas } | ConvertTo-Json -Depth 4 | Set-Content $file -Encoding UTF8
Write-Host "Guardadas $($cuentas.Count) cuentas en $file : $((@($cuentas | ForEach-Object nombre)) -join ', ')" -ForegroundColor Cyan
