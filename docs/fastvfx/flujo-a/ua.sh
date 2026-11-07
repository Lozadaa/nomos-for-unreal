#!/bin/sh
# Flujo A: abre el editor sin GUI (render offscreen, igual que FASTVFX), ejecuta un script y anota inicio/fin en tiempos.log.
# Uso: ./ua.sh ETIQUETA script.py
D=$(dirname "$0"); L="$D/tiempos.log"
echo "$1 editor inicio $(date +%s.%3N)" >> "$L"
"/c/Program Files/Epic Games/UE_5.8/Engine/Binaries/Win64/UnrealEditor-Cmd.exe" "C:/Users/richa/Documents/Unreal Projects/FastVfxBench/FastVfxBench.uproject" \
  -RenderOffscreen -ExecutePythonScript="$(cygpath -m "$(realpath "$2")")" -unattended -nopause -nosplash -stdout -FullStdOutLogOutput > "$D/ultimo.log" 2>&1
echo "$1 editor fin $(date +%s.%3N) codigo $?" >> "$L"
grep -E "A_RESULTADO|LogPython: Error" "$D/ultimo.log" | cut -c1-400
