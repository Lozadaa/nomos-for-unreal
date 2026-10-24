# Prueba real del nivel 1 de Fab · 2026-10-22

Objetivo: comprobar sin interfaz gráfica lo que el plan v2 (§5.6) llama nivel 1: indexar lo que ya está en la máquina y migrar un pack Fab a un proyecto nuevo sin abrir la pestaña Fab.

Archivos de esta carpeta: `index.py` (indexador, solo stdlib), `fab-index.json` (su salida), `verify_pack.py` (se ejecuta dentro del editor sin GUI), `verify-Free_Tennisball.json` (resultado).

## Qué funciona

| Paso | Resultado | Evidencia |
|---|---|---|
| Indexar `Content/Fab` de los proyectos | 4 packs en 2 proyectos (CrazyPadel: Free_Tennisball, Nude_Tennis_Racket, Skybox_Fantasy; unknowncall: Phone), 19 archivos, 89,9 MB, clasificados por tipo (malla, material, textura) | `fab-index.json` → `packs` |
| Indexar Megascans Library (Quixel Bridge) | 2 assets (presets MetaHuman Hudson y Emory) | `fab-index.json` → `megascans` |
| Leer los metadatos de la biblioteca del Launcher | La base `listings_v1.db` existe y se lee desde una copia; hoy 0 filas | `fab-index.json` → `launcher_listings` |
| Crear un proyecto nuevo sin el editor | `KratosFabTest.uproject` (5.8, Blueprint, PythonScriptPlugin) + `Config/DefaultEngine.ini` escritos a mano; el editor lo abre y completa la config | `C:\Users\richa\Documents\Unreal Projects\KratosFabTest` |
| Migrar un pack copiando archivos | `Content/Fab/Free_Tennisball` copiado de CrazyPadel (5 `.uasset`, 44 MB) | carpeta destino |
| Verificar con el editor sin GUI | `UnrealEditor-Cmd -ExecutePythonScript -NullRHI`: 5/5 assets cargan, 0 dependencias faltantes, 0 externas al pack/motor, 10 s de ejecución total | `verify-Free_Tennisball.json`: `ok: true` |

Detalle del pack verificado: malla `scene` con 1 LOD y 11 430 triángulos, 1 material (instancia del `MI_Default_Opaque_DS` de Interchange, contenido del motor), 3 texturas 4096×4096.

Compatibilidad: CrazyPadel guardó esos assets con el mismo motor instalado (5.8.0, hoy 5.8.3, misma ruta), así que la copia directa es válida. Entre versiones mayores distintas haría falta reimportar o migrar con Asset Tools.

## Qué no funciona o no existe hoy

1. **Caché del plugin Fab: vacía.** El plugin la guarda en `FabSettings.CacheDirectoryPath`, por defecto `%TEMP%\FabLibrary` (`FPlatformProcess::UserTempDir()`), y esa carpeta no existe en tu equipo. Nunca se ha hecho «Add to project» de un pack UE nativo desde el editor, o la caché se limpió. Los packs que tienes vinieron de importaciones GLB (`FGenericImportWorkflow`), que no dejan zip.
2. **El MCP de Unreal no hace la parte de Fab.** Ningún archivo de los 27 toolsets ni del plugin `ModelContextProtocol` contiene la palabra «Fab», y el plugin Fab no registra ningún toolset ni skill. El MCP sí cubre la mitad «integrar»: `import_asset` (Interchange desde un archivo en disco), `find_assets`, `move`, `duplicate`, `get_metadata_tags`, `import_file` de mallas. La mitad «extraer de tu biblioteca» sigue siendo del frontend web de Fab dentro del plugin (URL firmada con tu sesión), como describe el plan.
3. **Metadatos de la biblioteca: 0 filas.** `listings_v1.db` se rellena al abrir Mi biblioteca en Fab del Launcher. Hasta entonces el Catálogo solo puede listar lo que ya está en disco.
4. **Escala.** La pelota de tenis mide 200 × 200 × 199 cm en Unreal: el GLB se importó con factor de metros a centímetros sin corregir. Confirma que `ue-asset-intake` debe comprobar escala y pivote en toda importación Fab, también en las que ya hiciste a mano.

## Qué aprende Nomos de esto

- El toolset de importación del nivel 1 puede ser el propio `verify_pack.py` ampliado: copiar carpeta, escanear con el Asset Registry, cargar, comprobar dependencias y devolver JSON. No necesita C++.
- La verificación sin GUI es barata (10 s con `-NullRHI`), así que el coordinador puede exigirla en cada cierre de tarea de assets.
- El indexador corre sin Unreal y sin red; es la base del Catálogo. Hay que ejecutar Python con `-X utf8`: hay nombres de pack con emoji.
- El editor añade a `DefaultEngine.ini` secciones propias (Android File Server) al abrir el proyecto: es normal, no un fallo.

## Reproducir

```bash
python -I -X utf8 index.py fab-index.json
```

```bash
"C:/Program Files/Epic Games/UE_5.8/Engine/Binaries/Win64/UnrealEditor-Cmd.exe" "C:/Users/richa/Documents/Unreal Projects/KratosFabTest/KratosFabTest.uproject" -ExecutePythonScript="C:/Users/richa/Documents/Codex/2026-10-22/referenced-chatgpt-conversation-this-is-an/outputs/kratos-fab-nivel1/verify_pack.py" -unattended -nopause -nosplash -NullRHI -stdout -FullStdOutLogOutput
```

El informe queda en `KratosFabTest/Saved/nomos-verify.json` salvo que se fije la variable `NOMOS_REPORT`.
