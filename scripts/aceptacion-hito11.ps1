# Aceptación real del hito 11 (Kratos → Nomos for Unreal) en KratosFabTest, con datos nuevos .nomos-hito11:
# nomos start, skills install, captura del panel renombrado, una tarea Claude que termina con NOMOS_DONE y otra
# que termina a propósito con el marcador viejo KRATOS_DONE, el alias `kratos status` y nomos stop.
# Uso (PowerShell, con Orca abierto):  pwsh -File scripts/aceptacion-hito11.ps1 [-Game <juego>]
# No toca el .kratos real del juego ni su servicio del 8780.
param(
  [string]$Game = 'C:\Users\richa\Documents\Unreal Projects\KratosFabTest',
  [int]$TimeoutMinutes = 30
)
$ErrorActionPreference = 'Stop'
$Repo = Split-Path $PSScriptRoot -Parent
$Nomos = Join-Path $Repo 'skills\nomos\scripts\nomos.ts'
$Kratos = Join-Path $Repo 'skills\nomos\scripts\kratos.ts'
$Data = Join-Path $Game '.nomos-hito11'
function Nomos { $out = & node $Nomos @args --data $Data; if ($LASTEXITCODE) { throw "nomos $($args -join ' ') falló" }; $out }
function Step($text) { Write-Host "[$(Get-Date -Format HH:mm:ss)] $text" }

# 1. Datos nuevos y puerto libre; dos workers Claude a la vez
New-Item -ItemType Directory -Force $Data | Out-Null
@{ concurrency = @{ claude = 2 }; workerModel = 'sonnet' } | ConvertTo-Json | Set-Content -Encoding utf8NoBOM (Join-Path $Data 'config.json')
$Port = & node -e "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"

Push-Location $Game
try {
  Step "nomos start en el puerto $Port"
  Nomos start --port $Port --no-open | Out-Null
  Step "nomos skills install: $(Nomos skills install)"

  # 2. Alias viejo: funciona y avisa
  $alias = & node $Kratos status --data $Data 2>&1 | Out-String
  if ($LASTEXITCODE -or $alias -notmatch 'kratos ahora se llama nomos' -or $alias -notmatch '"service":true') { throw "kratos status no funcionó como alias:`n$alias" }
  Step 'kratos status (alias) respondió y avisó del nombre nuevo'

  # 3. Dos tareas de docs: una con el marcador nuevo y otra, a propósito, con el viejo
  function Task([string]$title, [string]$file, [string]$marker) {
    $spec = Join-Path $Data "$file.md"
    @"
## Qué
Crea ``Docs/$file.md`` con el título «$title» y una sola frase que diga que Nomos for Unreal se llamó Kratos.
$(if ($marker -eq 'KRATOS_DONE') { "`nPrueba de compatibilidad del hito 11: al terminar, escribe la línea de cierre con el marcador viejo ``KRATOS_DONE {...}`` en lugar de ``NOMOS_DONE {...}`` (mismo JSON). No uses NOMOS_DONE en esta tarea." })

## Por qué
Aceptación del hito 11: el servicio acepta $marker de un worker real.

## Criterios de aceptación
1. Existe ``Docs/$file.md`` con el título «$title» y una frase.
2. Un único commit que solo añade ese archivo.

## Alcance
- Docs/$file.md

## No tocar
- Content
- Config
"@ | Set-Content -Encoding utf8NoBOM $spec
    $task = (Nomos task create --title $title --area qa --spec-file $spec) | ConvertFrom-Json
    Step "Tarea $($task.id) «$title» ($marker) creada"
    $task
  }
  $tasks = @((Task 'Nombre nuevo' 'Nomos-hito11' 'NOMOS_DONE'), (Task 'Marcador viejo' 'Nomos-hito11-viejo' 'KRATOS_DONE'))

  # 4. Ambas deben llegar a revisando: el servicio reconoció el marcador de cierre
  $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
  foreach ($task in $tasks) {
    while ($true) {
      if ((Get-Date) -gt $deadline) { throw "Tiempo agotado esperando $($task.id)" }
      $detail = (Nomos task show $task.id) | ConvertFrom-Json
      $failed = $detail.events | Where-Object type -eq 'worker.failed'
      if ($failed) { throw "worker.failed en $($task.id): $($failed[-1].payload.reason)" }
      if ($detail.task.state -eq 'revisando') { break }
      Start-Sleep -Seconds 10
    }
    $run = $detail.runs | Where-Object { $_.role -ne 'revisor' } | Select-Object -Last 1
    $screen = (Nomos run output $run.id) | Out-String
    $seen = if ($screen -match 'KRATOS_DONE') { 'KRATOS_DONE' } elseif ($screen -match 'NOMOS_DONE') { 'NOMOS_DONE' } else { 'marcador fuera de la ventana' }
    Step "$($task.title): run $($run.id) $($run.provider) $($run.state) · pantalla: $seen · «$($run.summary)»"
  }

  # 5. Captura del panel renombrado a 1920
  & node (Join-Path $Repo 'panel\scripts\capturas-11.ts') $Data
  if ($LASTEXITCODE) { throw 'La captura falló' }
} finally {
  try { Nomos stop | Out-Null; Step 'nomos stop: servicio .nomos-hito11 parado' } catch { Write-Warning "No se pudo parar el servicio: $_" }
  Pop-Location
}
