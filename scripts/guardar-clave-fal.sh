#!/usr/bin/env bash
# Guarda tu clave de API de fal.ai sin que se vea en pantalla (macOS y Linux; en Windows, guardar-clave-fal.ps1, que
# cifra con DPAPI). Aquí no hay DPAPI: la clave va tal cual en ~/.nomos/fal-clave.json (NOMOS_FAL_CLAVE cambia la ruta)
# con permisos 600, solo legible por tu usuario. Nada de esto va a ningún repositorio.
# Alternativa sin archivo: exporta FAL_KEY. Uso: bash scripts/guardar-clave-fal.sh
set -euo pipefail
umask 077
file="${NOMOS_FAL_CLAVE:-$HOME/.nomos/fal-clave.json}"
mkdir -p "$(dirname "$file")"
read -r -s -p "Clave de fal.ai (no se verá): " clave; echo
[ -n "$clave" ] || { echo "Vacía: no se guarda."; exit 1; }
# la clave va por stdin a node, nunca en la línea de órdenes
printf '%s' "$clave" | node -e '
  const fs=require("fs"),f=process.argv[1];let k="";process.stdin.on("data",d=>k+=d).on("end",()=>{
  fs.writeFileSync(f,JSON.stringify({version:1,clave:k,cifrado:"ninguno",guardada:new Date().toISOString()},null,2)+"\n",{mode:0o600});fs.chmodSync(f,0o600)})' "$file"
clave=""
echo "Clave guardada en $file. Compruébala con: nomos doctor"
