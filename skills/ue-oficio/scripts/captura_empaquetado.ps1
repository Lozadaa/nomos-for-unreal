# Captura la ventana del juego EMPAQUETADO (no el editor): lo que ve el jugador de verdad.
# Uso: pwsh -File captura_empaquetado.ps1 -Exe <ruta\Juego.exe> [-Salida captura.png] [-Tomas 0,15] [-Ancho 1920] [-Alto 1080] [-Extra args]
# -Tomas: segundos desde que aparece la ventana; una PNG por toma (captura-0.png, captura-15.png…). La toma 0 intenta
# pillar la pantalla de carga. Para el modo demo, pon antes la variable de entorno del juego: el proceso hijo la hereda.
# Sirve para el Shipping (sin consola ni HighResShot): pone la ventana encima de todo y graba su zona con ffmpeg gdigrab.
param([Parameter(Mandatory)][string]$Exe, [string]$Salida = "captura-empaquetado.png", [string]$Tomas = "15",
      [int]$Ancho = 1920, [int]$Alto = 1080, [string[]]$Extra = @(), [int]$Espera = 60)
$ErrorActionPreference = "Stop"
Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);'
$antes = @(Get-Process | Select-Object -ExpandProperty Id)
Start-Process $Exe -ArgumentList (@("-windowed", "-ResX=$Ancho", "-ResY=$Alto", "-ForceRes") + $Extra) | Out-Null
# La ventana es del proceso nuevo con título (el lanzador Juego.exe abre Juego-Win64-Shipping.exe): se espera a que exista
$reloj = [Diagnostics.Stopwatch]::StartNew(); $p = $null
while (-not $p -and $reloj.Elapsed.TotalSeconds -lt $Espera) {
  Start-Sleep -Milliseconds 200
  $p = Get-Process | Where-Object { $antes -notcontains $_.Id -and $_.MainWindowTitle } | Select-Object -First 1
}
if (-not $p) { Write-Error "No apareció la ventana del juego en $Espera s (¿se cerró al arrancar?)" }
$reloj.Restart()
"ventana: $($p.MainWindowTitle) (pid $($p.Id))"
# encima de todo: gdigrab graba la zona de pantalla, y otra ventana delante saldría en la captura [probado, Canicas-6]
# SWP_ASYNCWINDOWPOS: sin él, SetWindowPos espera a una ventana que aún está cargando y el script se cuelga [probado]
[W.U]::SetWindowPos($p.MainWindowHandle, [IntPtr](-1), 0, 0, 0, 0, 0x4003) | Out-Null
[W.U]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
# texto y no [double[]]: con `pwsh -File`, «0,3,10» llega como un solo número (310 s de espera) [probado]
$segundos = @($Tomas -split "[,; ]+" | Where-Object { $_ } | ForEach-Object { [double]$_ })
$base = [IO.Path]::ChangeExtension($Salida, $null).TrimEnd('.')
foreach ($t in ($segundos | Sort-Object)) {
  $falta = $t - $reloj.Elapsed.TotalSeconds; if ($falta -gt 0) { Start-Sleep -Milliseconds ([int]($falta * 1000)) }
  $png = if ($segundos.Count -eq 1) { $Salida } else { "$base-$t.png" }
  ffmpeg -y -loglevel error -f gdigrab -i "title=$($p.MainWindowTitle)" -frames:v 1 $png
  if (Test-Path $png) { "captura: $((Resolve-Path $png).Path)" } else { Write-Warning "ffmpeg no dejó $png" }
}
Get-Process | Where-Object { $antes -notcontains $_.Id -and $_.Path -like "$(Split-Path $Exe)*" } | Stop-Process -Force
