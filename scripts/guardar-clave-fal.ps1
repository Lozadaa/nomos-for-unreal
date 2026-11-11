# Guarda tu clave de API de fal.ai sin que se vea en pantalla ni pase por ningún chat.
# Se cifra con DPAPI (solo tu usuario de Windows en este PC puede leerla) en %USERPROFILE%\.nomos\fal-clave.json
# (Nomos la lee de ahí; NOMOS_FAL_CLAVE cambia la ruta). Nada de esto va a ningún repositorio.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\guardar-clave-fal.ps1
$ErrorActionPreference = 'Stop'
$file = if ($env:NOMOS_FAL_CLAVE) { $env:NOMOS_FAL_CLAVE } else { Join-Path $env:USERPROFILE '.nomos\fal-clave.json' }
New-Item -ItemType Directory -Force (Split-Path $file) | Out-Null

$segura = Read-Host "Clave de fal.ai (no se verá)" -AsSecureString
if ($segura.Length -eq 0) { Write-Host "Vacía: no se guarda." -ForegroundColor Yellow; exit 1 }

[pscustomobject]@{ version = 1; clave = (ConvertFrom-SecureString $segura); guardada = (Get-Date).ToString('s') } |
  ConvertTo-Json | Set-Content $file -Encoding UTF8
Write-Host "Clave guardada en $file. Compruébala con: nomos doctor" -ForegroundColor Cyan
