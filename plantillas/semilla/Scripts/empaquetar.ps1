# Empaqueta Shipping Win64 en Empaquetado/ (una vez al final, no en cada paso). Uso: pwsh -File Scripts/empaquetar.ps1
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'motor.ps1')
& (Join-Path $motor 'Engine\Build\BatchFiles\RunUAT.bat') BuildCookRun "-project=$uproject" -platform=Win64 -clientconfig=Shipping `
  -build -cook -stage -pak -archive "-archivedirectory=$empaquetado" -nop4 -utf8output -unattended
exit $LASTEXITCODE
