#!/usr/bin/env bash
# Compila el editor del juego en macOS y Linux (sin probar con Unreal; en Windows, compilar.ps1). Uso: bash Scripts/compilar.sh
set -euo pipefail
. "$(dirname "$0")/motor.sh"
exec "$motor/Engine/Build/BatchFiles/$plataforma/Build.sh" SemillaEditor "$plataforma" Development "-Project=$uproject" -WaitMutex -NoHotReload
