# Empaqueta la versión web (Wasm + WebGPU, UE 5.9) en EmpaquetadoWeb/Wasm y la sirve con -Servir. Ver ue-oficio/references/web.md.
# Uso: pwsh -File Scripts/empaquetar-web.ps1 [-Config Shipping|Development] [-Servir]
# Necesita emscripten 6.0.10 (emsdk) en WASM_EMSDK_ROOT o en %USERPROFILE%\emsdk: git clone https://github.com/emscripten-core/emsdk;
# emsdk install 6.0.10; emsdk activate 6.0.10 (unos 2 GB, sin tocar el sistema).
param([ValidateSet('Shipping', 'Development')][string]$Config = 'Shipping', [switch]$Servir)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'motor.ps1')
if (-not $env:WASM_EMSDK_ROOT) { $env:WASM_EMSDK_ROOT = Join-Path $env:USERPROFILE 'emsdk' }
if ((Get-Content (Join-Path $env:WASM_EMSDK_ROOT 'upstream\emscripten\emscripten-version.txt') -EA SilentlyContinue) -notmatch '6\.0\.10') {
  throw "Falta emscripten 6.0.10 en $env:WASM_EMSDK_ROOT (ver cabecera de este script)"
}
Remove-Item Env:EMSDK -EA SilentlyContinue  # un EMSDK viejo de otro proyecto gana a AutoSDK y rompe la validación
$web = Join-Path $juego 'EmpaquetadoWeb'
# -archive no borra el .wasm de otra configuración: con dos binarios la página no sabe cuál cargar (TrompoLab, 2026-11-10)
Remove-Item -Recurse -Force (Join-Path $web 'Wasm'), (Join-Path $web 'Wasm-Debug') -EA SilentlyContinue
& (Join-Path $motor 'Engine\Build\BatchFiles\RunUAT.bat') BuildCookRun "-project=$uproject" -platform=Wasm "-clientconfig=$Config" `
  -build -cook -stage -pak -iostore -package -archive "-archivedirectory=$web" -nop4 -utf8output -unattended `
  '-AdditionalCookerOptions=-unattended -nopause -nosplash -nullrhi'
if ($LASTEXITCODE) { exit $LASTEXITCODE }
$py = Join-Path $motor 'Engine\Binaries\ThirdParty\Python3\Win64\python.exe'
# file:// no funciona: el juego necesita COOP/COEP; serve.py del motor los pone. Abrir en Chrome o Edge (WebGPU).
if ($Servir) { & $py (Join-Path $motor 'Engine\Platforms\Wasm\Build\Tools\web\serve.py') --root (Join-Path $web 'Wasm') --port 8900 }
