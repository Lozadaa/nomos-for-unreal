# Capturas del juego. Dos modos:
# - Sin -Demo: captura el .exe empaquetado (no el editor) en docs/empaquetado-<segundo>.png. Para el modo demo: $env:SEMILLA_AUTO=1 antes.
#   Uso: pwsh -File Scripts/capturar.ps1 [-Tomas "0,3,15"]
# - Con -Demo: lanza el juego con el editor en -game a 1280x720 y SEMILLA_AUTO=1, y deja docs/capturas/inicio.png, mitad.png y
#   final.png con su .json de escena (el Shipping no tiene Python para escribirlo). Después pasa revisar_imagen.py.
#   Uso: pwsh -File Scripts/capturar.ps1 -Demo [-Segundos "3,20,45"]   (compila antes con Scripts/compilar.ps1)
param([string]$Tomas = "0,3,15", [switch]$Demo, [string]$Segundos = "3,20,45")
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'motor.ps1')
function Skill([string]$relativa) {
  @((Join-Path $raiz ".claude\skills\$relativa"), (Join-Path $env:USERPROFILE ".claude\skills\$relativa")) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $Demo) {
  $script = Skill 'ue-oficio\scripts\captura_empaquetado.ps1'
  if (-not $script) { throw 'Falta captura_empaquetado.ps1 de la skill ue-oficio' }
  & $script -Exe (Join-Path $empaquetado 'Windows\Semilla.exe') -Salida (Join-Path $raiz 'docs\empaquetado.png') -Tomas $Tomas
  exit $LASTEXITCODE
}

# nomos_demo.py viaja con Nomos: embebido en el juego (Tools/Nomos) o junto a la skill instalada
$enlace = Join-Path $env:USERPROFILE '.claude\skills\nomos'
$candidatos = @((Join-Path $raiz 'Tools\Nomos\service\unreal\nomos_demo.py'), (Join-Path $juego 'Tools\Nomos\service\unreal\nomos_demo.py'))
if (Test-Path $enlace) {
  $destino = (Get-Item $enlace).Target
  if ($destino) { $candidatos += Join-Path (Split-Path (Split-Path ([string]$destino))) 'service\unreal\nomos_demo.py' }
}
$guion = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $guion) { throw 'Falta nomos_demo.py (Tools/Nomos/service/unreal): actualiza Nomos con nomos embed --update' }
$salida = Join-Path $raiz 'docs\capturas'
New-Item -ItemType Directory -Force $salida | Out-Null
Remove-Item (Join-Path $salida '*.png*') -ErrorAction SilentlyContinue
$env:NOMOS_SCRIPT = $guion -replace '\\', '/'
$env:NOMOS_DEMO_DIR = $salida
$env:NOMOS_DEMO_SEGUNDOS = $Segundos
$env:NOMOS_REPORT = Join-Path $salida 'demo.json'
$env:SEMILLA_AUTO = '1'
$log = Join-Path $raiz 'Saved\Logs\Semilla.log'
$editor = Join-Path $motor 'Engine\Binaries\Win64\UnrealEditor.exe'
$proceso = Start-Process $editor -PassThru -ArgumentList @("`"$uproject`"", '-game', '-ResX=1280', '-ResY=720', '-windowed', '-ForceRes',
  "-ExecCmds=`"py import os;exec(open(os.environ['NOMOS_SCRIPT']).read())`"", '-unattended', '-nosplash', '-log')
$tope = [int](($Segundos -split ',')[-1]) + 180
if (-not $proceso.WaitForExit($tope * 1000)) { Stop-Process -Id $proceso.Id -Force; Write-Host "El juego no terminó en $tope s: cerrado" }
if (-not (Test-Path $log) -or -not (Select-String -Path $log -Pattern 'NOMOS_DEMO activo' -Quiet)) {
  Write-Host 'El juego no tiene modo demo: SEMILLA_AUTO=1 debe jugarlo solo y escribir «NOMOS_DEMO activo» en el log'
}
Get-ChildItem $salida -Filter '*.png' | ForEach-Object { Write-Host "Captura: $($_.FullName)" }
$revisar = Skill 'ue-oficio\scripts\revisar_imagen.py'
if (-not $revisar) { Write-Host 'Falta revisar_imagen.py de la skill ue-oficio'; exit 2 }
& python -X utf8 $revisar $salida
exit $LASTEXITCODE
