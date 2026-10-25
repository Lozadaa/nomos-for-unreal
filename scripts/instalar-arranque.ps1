# Hito 22: tarea programada de Windows «Nomos - arranque» que, al iniciar sesión, levanta de forma oculta los servicios
# registrados en %LOCALAPPDATA%\nomos\projects.json (cada uno con su --data y su puerto) con `nomos autostart run`.
# Uso (PowerShell):
#   pwsh -File scripts/instalar-arranque.ps1 [-WhatIf]      # instala (o reinstala)
#   pwsh -File scripts/instalar-arranque.ps1 -Desinstalar    # la quita
# También: `nomos autostart on|off|status`. -WhatIf enseña lo que haría sin registrar nada.
[CmdletBinding(SupportsShouldProcess)]
param([switch]$Desinstalar, [string]$Nombre = 'Nomos - arranque')
$ErrorActionPreference = 'Stop'
$Repo = Split-Path $PSScriptRoot -Parent
$Cli = Join-Path $Repo 'service\src\cli.ts'
$Node = (Get-Command node -ErrorAction Stop).Source

if ($Desinstalar) {
  if (-not (Get-ScheduledTask -TaskName $Nombre -ErrorAction SilentlyContinue)) { Write-Host "No hay tarea «$Nombre»"; return }
  if ($PSCmdlet.ShouldProcess($Nombre, 'Quitar la tarea programada')) {
    Unregister-ScheduledTask -TaskName $Nombre -Confirm:$false
    Write-Host "Quitada la tarea «$Nombre»"
  }
  return
}

# PowerShell oculto alrededor de node: sin ventana de consola al iniciar sesión
$Command = "& '$Node' '$Cli' autostart run"
$Action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $Repo `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -Command `"$Command`""
# un minuto de margen: Orca y la red llegan después del escritorio
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$Trigger.Delay = 'PT1M'
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -Hidden
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Write-Host "Tarea: $Nombre"
Write-Host "Al iniciar sesión (1 min después): powershell.exe -WindowStyle Hidden -Command $Command"
if ($PSCmdlet.ShouldProcess($Nombre, 'Registrar la tarea programada al iniciar sesión')) {
  Register-ScheduledTask -TaskName $Nombre -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null
  Write-Host "Instalada la tarea «$Nombre»"
}
