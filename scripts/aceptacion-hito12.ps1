# Aceptación real del hito 12: una tarea de docs con OpenCode, revisión Claude y cierre en KratosFabTest.
# Uso (PowerShell, donde opencode está en el PATH):
#   pwsh -File scripts/aceptacion-hito12.ps1 [-Game <juego>] [-Model opencode/beam-free]
# Deja la captura en docs/capturas-12/ y para siempre su servicio (.kratos-hito12); no toca el del 8780.
param(
  [string]$Game = 'C:\Users\richa\Documents\Unreal Projects\KratosFabTest',
  [string]$Model = 'opencode/beam-free',
  [int]$TimeoutMinutes = 30
)
$ErrorActionPreference = 'Stop'
$Repo = Split-Path $PSScriptRoot -Parent
$Cli = Join-Path $Repo 'service\src\cli.ts'
$Data = Join-Path $Game '.kratos-hito12'
function Kratos { $out = & node $Cli @args --data $Data; if ($LASTEXITCODE) { throw "kratos $($args -join ' ') falló" }; $out }
function Step($text) { Write-Host "[$(Get-Date -Format HH:mm:ss)] $text" }

# 1. OpenCode debe autenticar antes de gastar nada: una pregunta mínima al mismo modelo
Step "Comprobando credenciales de OpenCode con $Model"
$probe = (& opencode run --model $Model 'Responde solo: ok' 2>&1 | Out-String)
if ($probe -match 'Invalid credential|401') { throw "OpenCode rechazó las credenciales: ejecuta opencode auth login`n$probe" }

# 2. Datos nuevos y puerto libre
New-Item -ItemType Directory -Force $Data | Out-Null
@{ concurrency = @{ claude = 1; opencode = 1 }; opencodeModel = $Model; workerModel = 'sonnet' } |
  ConvertTo-Json | Set-Content -Encoding utf8NoBOM (Join-Path $Data 'config.json')
$Port = & node -e "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"

Push-Location $Game
try {
  Step "Arrancando el servicio en el puerto $Port"
  Kratos start --port $Port --no-open | Out-Null

  # 3. Tarea sencilla de docs, pedida explícitamente a OpenCode
  $spec = Join-Path $Data 'tarea-opencode.md'
  @'
## Qué
Crea `Docs/OpenCode.md` con un título «Notas de OpenCode» y tres viñetas que expliquen qué tareas
sencillas puede hacer OpenCode en este proyecto (documentación, datos, scripts pequeños).

## Por qué
Comprobar el adaptador OpenCode del hito 12 con una tarea barata y verificable sin Unreal.

## Criterios de aceptación
1. Existe `Docs/OpenCode.md` con el título «Notas de OpenCode» y exactamente tres viñetas.
2. Un único commit que solo añade ese archivo.

## Alcance
- Docs

## No tocar
- Content
- Config
'@ | Set-Content -Encoding utf8NoBOM $spec
  $task = (Kratos task create --title 'Notas de OpenCode' --area builds --provider opencode --spec-file $spec) | ConvertFrom-Json
  Step "Tarea $($task.id) creada; el planificador la lanza con OpenCode"

  $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
  function WaitState([string[]]$states) {
    while ((Get-Date) -lt $deadline) {
      $detail = (Kratos task show $task.id) | ConvertFrom-Json
      $failed = $detail.events | Where-Object type -eq 'worker.failed'
      if ($failed) { throw "worker.failed: $($failed[-1].payload.reason)" }
      if ($detail.decision) { throw "Decisión abierta: $($detail.decision.reason)" }
      if ($states -contains $detail.task.state) { return $detail }
      Start-Sleep -Seconds 10
    }
    throw "Tiempo agotado esperando $($states -join '/')"
  }

  # 4. KRATOS_DONE de OpenCode → revisando
  $detail = WaitState @('revisando')
  $impl = $detail.runs | Where-Object { $_.role -ne 'revisor' } | Select-Object -Last 1
  if ($impl.provider -ne 'opencode' -or $impl.state -ne 'done') { throw "La implementación no la hizo OpenCode: $($impl.provider) $($impl.state)" }
  Step "OpenCode terminó: $($impl.summary) (modelo $($impl.metadata.model))"

  # 5. Revisión: el revisor de OpenCode es siempre Claude
  Kratos task review $task.id | Out-Null
  $detail = WaitState @('probando', 'implementando', 'integrando', 'cerrando')
  $review = $detail.runs | Where-Object role -eq 'revisor' | Select-Object -Last 1
  if ($detail.task.state -eq 'implementando') { throw "El revisor $($review.provider) pidió cambios: $($review.summary)" }
  if ($review.provider -ne 'claude') { throw "El revisor no fue Claude: $($review.provider)" }
  Step "Revisión Claude aprobada"

  # 6. Cierre
  if ($detail.task.state -eq 'probando') { Kratos task integrate $task.id | Out-Null; $detail = WaitState @('cerrando', 'done') }
  if ($detail.task.state -eq 'cerrando') { Kratos task finalize $task.id | Out-Null; $detail = WaitState @('done') }
  Step "Tarea cerrada: $($detail.task.state)"

  # 7. Captura de Producción a 1920 y gasto
  & node (Join-Path $Repo 'panel\scripts\capturas-12.ts') $Data
  if ($LASTEXITCODE) { throw 'La captura falló' }
  Step 'Gasto según opencode stats:'
  & opencode stats
} finally {
  try { Kratos stop | Out-Null; Step 'Servicio .kratos-hito12 parado' } catch { Write-Warning "No se pudo parar el servicio: $_" }
  Pop-Location
}
