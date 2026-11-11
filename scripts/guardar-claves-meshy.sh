#!/usr/bin/env bash
# Guarda claves de API de Meshy de varias personas sin que se vean en pantalla (macOS y Linux; en Windows,
# guardar-claves-meshy.ps1, que cifra con DPAPI). Aquí no hay DPAPI: la clave va tal cual en ~/.nomos/meshy-claves.json
# (NOMOS_MESHY_CLAVES cambia la ruta) con permisos 600, solo legible por tu usuario. Nada de esto va a ningún repositorio.
# Alternativa sin archivo: exporta MESHY_API_KEY. Uso: bash scripts/guardar-claves-meshy.sh
set -euo pipefail
umask 077
file="${NOMOS_MESHY_CLAVES:-$HOME/.nomos/meshy-claves.json}"
mkdir -p "$(dirname "$file")"
echo "Claves de Meshy. Deja el nombre vacío para terminar."
while true; do
  read -r -p "Nombre de la persona (vacío = terminar): " nombre
  [ -n "$nombre" ] || break
  read -r -s -p "Clave de Meshy de $nombre (no se verá): " clave; echo
  if [ -z "$clave" ]; then echo "  Vacía: no se guarda."; continue; fi
  # comprobación opcional del saldo, solo contra la API de Meshy; la clave va por stdin a node, nunca en la línea de órdenes
  estado="$(printf '%s' "$clave" | node -e '
    let k="";process.stdin.on("data",d=>k+=d).on("end",async()=>{try{const r=await fetch("https://api.meshy.ai/openapi/v1/balance",{headers:{Authorization:"Bearer "+k},signal:AbortSignal.timeout(15000)});
    console.log(r.status===401||r.status===403?"rechazada "+r.status:r.ok?"ok "+(await r.json()).balance:"error "+r.status)}catch(e){console.log("error "+e.message)}})')"
  case "$estado" in
    rechazada*) echo "  $nombre: Meshy rechaza la clave (${estado#rechazada }). No se guarda."; continue ;;
    ok*) echo "  $nombre: clave válida, ${estado#ok } créditos." ;;
    *) echo "  $nombre: no se pudo comprobar el saldo (${estado#error }). Se guarda igual." ;;
  esac
  printf '%s' "$clave" | NOMBRE="$nombre" node -e '
    const fs=require("fs"),f=process.argv[1];let k="";process.stdin.on("data",d=>k+=d).on("end",()=>{
    let d={version:1,cuentas:[]};try{d=JSON.parse(fs.readFileSync(f,"utf8").replace(/^﻿/,""))}catch{}
    d.cuentas=(d.cuentas||[]).filter(c=>c.nombre!==process.env.NOMBRE).concat({nombre:process.env.NOMBRE,clave:k,cifrado:"ninguno",guardada:new Date().toISOString().slice(0,19)});
    fs.writeFileSync(f,JSON.stringify(d,null,2)+"\n",{mode:0o600});fs.chmodSync(f,0o600)})' "$file"
  clave=""
done
[ -f "$file" ] && node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(`Guardadas ${d.cuentas.length} cuentas en ${process.argv[1]}: ${d.cuentas.map(c=>c.nombre).join(", ")}`)' "$file"
