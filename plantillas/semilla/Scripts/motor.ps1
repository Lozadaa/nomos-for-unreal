# Lo cargan compilar.ps1, empaquetar.ps1 y capturar.ps1: deja $raiz, $uproject y $motor (el Unreal que pide Semilla.uproject).
$raiz = Split-Path $PSScriptRoot -Parent
$uproject = Join-Path $raiz 'Semilla.uproject'
$version = (Get-Content $uproject -Raw | ConvertFrom-Json).EngineAssociation
$dat = 'C:\ProgramData\Epic\UnrealEngineLauncher\LauncherInstalled.dat'
$motor = $null
if (Test-Path $dat) {
  $motor = ((Get-Content $dat -Raw | ConvertFrom-Json).InstallationList | Where-Object AppName -eq "UE_$version" | Select-Object -First 1).InstallLocation
}
if (-not $motor) { $motor = Join-Path $env:ProgramFiles "Epic Games\UE_$version" }
if (-not (Test-Path (Join-Path $motor 'Engine\Build\BatchFiles'))) { throw "Este juego pide Unreal $version y no está instalado ($motor)" }
