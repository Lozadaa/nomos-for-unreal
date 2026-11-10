# Build web (UE 5.9: WebAssembly + WebGPU)

Probado el 2026-11-10 con Trompo (proyecto C++ de la semilla) en el UE 5.9 MegaJam Preview del Launcher, Windows 11,
RTX 5060. Marcas: **[observado]** lo hicimos aquí; **[fuente]** lo dicen los documentos que trae el motor en
`Engine/Platforms/Wasm/Docs` (léelos antes que el foro) o el anuncio.

## Lo que hace falta

- **Motor del Launcher, no desde fuente.** En Windows el instalado trae las librerías Wasm precompiladas
  (`Engine/Binaries/Wasm`, `Engine/Platforms/Wasm`). El anuncio del foro dice «requires a source build»: eso vale para
  Mac y Linux, a los que les faltan archivos. [observado + fuente]
- **Proyecto C++.** Uno solo de Blueprint no empaqueta para web (UAT sale con código 19). Los de `nomos nuevo` ya lo
  son. [fuente]
- **emscripten 6.0.10 exacto** (`Engine/Platforms/Wasm/Config/Wasm_SDK.json`): unos 2 GB en `%USERPROFILE%\emsdk`,
  70 s de instalación, nada fuera de esa carpeta. [observado]
  ```powershell
  git clone --depth 1 https://github.com/emscripten-core/emsdk $env:USERPROFILE\emsdk
  cd $env:USERPROFILE\emsdk; .\emsdk.bat install 6.0.10; .\emsdk.bat activate 6.0.10   # sin --permanent
  ```
  `Scripts/empaquetar-web.ps1` pone `WASM_EMSDK_ROOT` solo para su proceso y quita un `EMSDK` viejo.
- **Navegador con WebGPU:** Chrome o Edge de escritorio. El Chrome del usuario puede no tener adaptador WebGPU (GPU
  bloqueada: la página dice «Trompo can't run on this GPU»); el Chromium de Playwright y el navegador integrado de la
  app sí lo dieron con la RTX 5060. [observado]
- **Nada de toolsets del MCP en el cook web:** `AIAssistant`, `AllToolsets` y `ToolsetRegistry` rompen un cook Wasm.
  Si el `.uproject` lleva `AllToolsets` (apaño UE-412135), añádele `"PlatformDenyList": ["Wasm"]`. [fuente: skill
  `web-deploy` del motor]

## Empaquetar y probar

```powershell
pwsh -File Scripts/empaquetar-web.ps1                     # Shipping en EmpaquetadoWeb/Wasm
pwsh -File Scripts/empaquetar-web.ps1 -Config Development -Servir   # acepta ?args=, sirve en http://127.0.0.1:8900
```

- `file://` no funciona: hacen falta COOP/COEP. Sirve con `Engine/Platforms/Wasm/Build/Tools/web/serve.py` (lo hace
  `-Servir`) o con `EmpaquetadoWeb/Play_<Juego>.bat`. [fuente]
- Comprobación de verdad, con números: `python Engine/Platforms/Wasm/Build/Tools/web/webrun.py run --stage
  EmpaquetadoWeb/Wasm --fixture idle --args=-<Flag> --shots 20 --out <dir>` abre Chromium (Playwright), deja
  `result.json` (READY, bytes, tier, fotogramas) y capturas `t020s.png`. Necesita `pip install playwright`. [observado]
- El modo demo: en web no hay variables de entorno. Lee además un flag de línea de órdenes
  (`FParse::Param(FCommandLine::Get(), TEXT("<Juego>Auto"))`) y pásalo con `?args=-<Juego>Auto` (la semilla ya lo lee) en una página
  **Development**. Shipping solo deja pasar un mapa `/Game/...`, `-culture=`, `-WebQualityPreset=` y
  `-WebScreenPercentage=`; lo demás va en el ajuste `PageArgs`. [observado + fuente]

## Trompo en web, medido [observado]

| | Development | Shipping |
|---|---|---|
| Empaquetar (con C++ ya compilado para Win64 al menos una vez) | 6 min 4 s | 15 min 20 s (`wasm-opt` se lleva casi todo y 4,5 GB de RAM) |
| Carpeta `Wasm` en disco (incluye las copias `.br`) | 282 MB | 203 MB (`.wasm` 140 MB, 26 MB en Brotli) |
| Descarga hasta READY | 72,8 MB | 55,4 MB |
| READY desde la navegación | 3,4 s | 5,2 s (con la red limitada a 300 Mbit) |

`check_stage.py` pasa en Shipping (un aviso: una fuente del motor dentro del `.ucas`). Itera en Development y deja
Shipping para el final, como el `.exe`.

- Tier elegido en la RTX 5060: **mobile deferred** (`SP_WEBGPU_ES3_1_DEFERRED`); 0 errores WebGPU.
- Fotogramas: 10 317 en 60 s con VSync y límite apagados (unos 170 fps a 1920×1080). En el panel integrado, oculto,
  el navegador frena `requestAnimationFrame` y salen 2-6 fps: no midas ahí.
- Funciona: materiales propios, sombras, física de los trompos, estelas, HUD de UMG con las fuentes TTF propias,
  audio (WebAudio a 48 kHz, sin cortes). Modo demo con `?args=-TrompoAuto`: «victoria a los 42,4 s».
- Se rompe: el **cielo**. `SkyAtmosphere` no se ve en el renderer móvil sin una malla con material `IsSky`; queda una
  franja plana y, en Development, un aviso rojo en pantalla. Para web, cielo con malla o color de fondo propio.
- Sin probar: ratón y teclado jugando a mano, móviles, Firefox y Safari, subirlo a itch.io (límite 500 MB total,
  200 MB por archivo [fuente: anuncio]).

## Límites del Preview 1 [fuente]

- Solo el renderer móvil (forward y deferred). Sin Lumen (el tier de escritorio con Lumen software es experimental y va
  apagado), sin Nanite (se ven los fallback), sin sombras virtuales (cascadas), sin ray tracing.
- wasm64 con hilos, 1 GB de memoria inicial y 4 GB de máximo; el anuncio dice que se cae por encima de 2 GB.
- Bink no funciona; el guardado puede perderse al recargar; sin `IpNetDriver` en proyectos `--web-ready`.
- Texturas BC por defecto: móviles Android y iPhone anteriores al 15 Pro necesitan ASTC.
