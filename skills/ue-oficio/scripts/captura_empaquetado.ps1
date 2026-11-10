# Captura la ventana del juego EMPAQUETADO (no el editor): lo que ve el jugador de verdad.
# Uso: pwsh -File captura_empaquetado.ps1 -Exe <ruta\Juego.exe> [-Salida captura.png] [-Segundos 15] [-Ancho 1920] [-Alto 1080]
# Sirve para el Shipping (sin consola ni HighResShot): graba la ventana con ffmpeg gdigrab.
param([Parameter(Mandatory)][string]$Exe, [string]$Salida = "captura-empaquetado.png", [int]$Segundos = 15,
      [int]$Ancho = 1920, [int]$Alto = 1080, [string[]]$Extra = @())
$ErrorActionPreference = "Stop"
$antes = @(Get-Process | Select-Object -ExpandProperty Id)
Start-Process $Exe -ArgumentList (@("-windowed", "-ResX=$Ancho", "-ResY=$Alto", "-ForceRes") + $Extra) | Out-Null
Start-Sleep $Segundos
# La ventana es del proceso nuevo con título (el lanzador Juego.exe abre Juego-Win64-Shipping.exe)
$p = Get-Process | Where-Object { $antes -notcontains $_.Id -and $_.MainWindowTitle } | Select-Object -First 1
if (-not $p) { Write-Error "No apareció la ventana del juego en $Segundos s (¿se cerró al arrancar? mira Saved/Logs o el visor de eventos)" }
"ventana: $($p.MainWindowTitle) (pid $($p.Id))"
ffmpeg -y -loglevel error -f gdigrab -i "title=$($p.MainWindowTitle)" -frames:v 1 $Salida
Get-Process | Where-Object { $antes -notcontains $_.Id -and $_.Path -like "$(Split-Path $Exe)*" } | Stop-Process -Force
if (-not (Test-Path $Salida)) { Write-Error "ffmpeg no dejó $Salida" }
"captura: $((Resolve-Path $Salida).Path)"
