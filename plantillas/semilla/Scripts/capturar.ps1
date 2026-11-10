# Captura el .exe empaquetado (no el editor) en docs/empaquetado-<segundo>.png. Para el modo demo: $env:SEMILLA_AUTO=1 antes.
# Uso: pwsh -File Scripts/capturar.ps1 [-Tomas "0,3,15"]
param([string]$Tomas = "0,3,15")
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'motor.ps1')
$script = @((Join-Path $raiz '.claude\skills\ue-oficio\scripts\captura_empaquetado.ps1'),
  (Join-Path $env:USERPROFILE '.claude\skills\ue-oficio\scripts\captura_empaquetado.ps1')) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $script) { throw 'Falta captura_empaquetado.ps1 de la skill ue-oficio' }
& $script -Exe (Join-Path $empaquetado 'Windows\Semilla.exe') -Salida (Join-Path $raiz 'docs\empaquetado.png') -Tomas $Tomas
