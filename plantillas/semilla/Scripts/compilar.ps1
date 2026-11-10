# Compila el editor del juego (50-80 s). Desde PowerShell: desde bash la ruta con espacios hacia Build.bat falla.
# Uso: pwsh -File Scripts/compilar.ps1
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'motor.ps1')
& (Join-Path $motor 'Engine\Build\BatchFiles\Build.bat') SemillaEditor Win64 Development "-Project=$uproject" -WaitMutex -NoHotReload
exit $LASTEXITCODE
