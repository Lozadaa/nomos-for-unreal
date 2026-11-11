# Lo cargan compilar.sh y empaquetar.sh (macOS y Linux; sin probar con Unreal): deja raiz, uproject, juego, empaquetado,
# plataforma y motor (el Unreal que pide Semilla.uproject). NOMOS_UNREAL_ROOT (la carpeta que contiene Engine/) manda.
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
uproject="$raiz/Semilla.uproject"
# el empaquetado va siempre a la carpeta del juego, también desde un worktree de Nomos (.nomos/worktrees/x), que se borra
padre="$(dirname "$raiz")"
if [ "$(basename "$padre")" = worktrees ] && [ "$(basename "$(dirname "$padre")")" = .nomos ]; then juego="$(dirname "$(dirname "$padre")")"; else juego="$raiz"; fi
empaquetado="$juego/Empaquetado"
version="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8").replace(/^﻿/,"")).EngineAssociation)' "$uproject")"
case "$(uname -s)" in
  Darwin) plataforma=Mac; dat="$HOME/Library/Application Support/Epic/UnrealEngineLauncher/LauncherInstalled.dat"; defecto="/Users/Shared/Epic Games/UE_$version" ;;
  *) plataforma=Linux; dat=""; defecto="$HOME/UnrealEngine" ;;
esac
motor="${NOMOS_UNREAL_ROOT:-}"
if [ -z "$motor" ] && [ -n "$dat" ] && [ -f "$dat" ]; then
  motor="$(node -e 'const l=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).InstallationList||[];const i=l.find(x=>x.AppName==="UE_"+process.argv[2]);if(i)console.log(i.InstallLocation)' "$dat" "$version")"
fi
[ -n "$motor" ] || motor="$defecto"
if [ ! -d "$motor/Engine/Build/BatchFiles" ]; then
  echo "Este juego pide Unreal $version y no está instalado ($motor). Define NOMOS_UNREAL_ROOT con la carpeta que contiene Engine/." >&2
  exit 1
fi
