#!/usr/bin/env bash
# Empaqueta Shipping en Empaquetado/ en macOS y Linux (sin probar con Unreal; en Windows, empaquetar.ps1). Uso: bash Scripts/empaquetar.sh
set -euo pipefail
. "$(dirname "$0")/motor.sh"
exec "$motor/Engine/Build/BatchFiles/RunUAT.sh" BuildCookRun "-project=$uproject" "-platform=$plataforma" -clientconfig=Shipping \
  -build -cook -stage -pak -archive "-archivedirectory=$empaquetado" -nop4 -utf8output -unattended
