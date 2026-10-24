# Prueba real del nivel 2 de Fab · 2026-10-22

Objetivo: comprobar lo que el plan v2 (§5.6) llama nivel 2: un asset ya adquirido en Fab y nunca descargado entra en un proyecto Unreal mediante «Add to project» del Epic Games Launcher, pulsado por un agente de escritorio (Computer use), y se verifica sin interfaz.

Archivos nuevos de esta carpeta: `informe-nivel2.md` (este), `verify-AdvancedCelShader.json` (verificación en el editor sin GUI), capturas `nivel2-01..06-*.jpg`. Modificados: `verify_pack.py` (la raíz se pasa por la variable `NOMOS_ROOT`), `index.py` (indexa las descargas del Launcher y las carpetas `Content/<Pack>` que coinciden), `fab-index.json` regenerado.

Asset elegido: **Advanced Cel Shader Lite** (Skull), gratuito, formato Unreal Engine, en Mi biblioteca y sin etiqueta «On disk». Destino: `KratosFabTest` (UE 5.8.3). No se pulsó nada con precio ni carrito.

## Qué funciona

| Paso | Resultado | Evidencia |
|---|---|---|
| Acceso a escritorio solo al Launcher | `request_access(["Epic Games Launcher"])` concedido en nivel «full»; el resto de ventanas sale enmascarado en las capturas | respuesta de la herramienta |
| Ir a Fab sin clics | `Start-Process 'com.epicgames.launcher://ue/fab'` → log `MainRouter GoToUrl('/ue/fab')`; pero eso abre la **portada** de Fab (botón «Start exploring» externo), no la tienda embebida | log del Launcher 00:42:09 |
| Tienda Fab embebida | 1 clic en «Fab» del menú lateral → log `GoToUrl('[fab]')`, web view con Discover / My Library | `nivel2-01-mi-biblioteca.jpg` |
| Mi biblioteca | 1 clic → 109 productos; filtro Formats → Unreal Engine → 104 | `nivel2-01` |
| Add to project | «+» en la tarjeta → diálogo «Select the Project to Add the Asset to» | `nivel2-02`…`05` |
| Descarga + copia | «Add to Project» → toast «Files downloaded»; tarjeta pasa a «On disk (41.76 MB)». Log: manifiesto 00:45:45, 192 archivos copiados 00:45:47, `HandleTaskComplete AlertCode=[ok]` 00:45:48. **Unos 8 s** desde el clic para 43,8 MB | `nivel2-06`, log `LogFabViewModel` / `FCommunityPortalVaultCacheInstall` |
| Dónde cae el pack | `Content\AdvancedCelShader` (12 archivos, 0,3 MB) **más** `Content\StarterContent` (21 archivos que el pack trae consigo), `Content\__ExternalActors__\AdvancedCelShader`, `Content\__ExternalObjects__`. Total 192 archivos, 43,8 MB. No usa `Content\Fab` | listado de archivos con mtime posterior al clic |
| Copia en caché | `C:\ProgramData\Epic\EpicGamesLauncher\VaultCache\Advanceddffcefa302e4V2\data\Content\…` (manifiesto `5.6.0-37897518+++UE5+Dev-Marketplace-Windows`) y `VaultCache\FabLibrary\Advanced_Cel_Shader_Lite-ff0ac933\unreal-engine\manifest`. Esa copia permite el nivel 1 (migrar a otros proyectos sin GUI) sin volver a descargar | carpeta VaultCache |
| Verificar sin GUI | `UnrealEditor-Cmd … -ExecutePythonScript=verify_pack.py -NullRHI` con `NOMOS_ROOT=/Game/AdvancedCelShader`: 12/12 assets cargan (Material, MaterialFunction, MaterialInstanceConstant, Texture2D, World, HLODLayer), 0 errores, 0 dependencias faltantes, 1 externa (`__ExternalActors__` del mapa de ejemplo). 11,3 s | `verify-AdvancedCelShader.json`: `ok: true` |
| Indexar | `index.py` ahora lista `launcher_packs` (KratosFabTest · AdvancedCelShader) y `launcher_listings.downloads`; `launcher_listings.rows` pasó de 0 a 1 | `fab-index.json` |

Clics necesarios con un asset compatible: Fab (lateral) → My Library → «+» de la tarjeta → tesela del proyecto → Add to Project: **5 clics**. Con este asset hicieron falta 4 más (ver abajo).

## Qué no funciona o hay que tener en cuenta

1. **`listings_v1.db` no es el índice de la biblioteca.** Abrir Mi biblioteca y recorrerla entera (109 productos, hasta el final) no escribió nada: 0 filas y mtime del 16-10 hasta el momento de la descarga. Solo «Add to project» escribe, y escribe una fila por asset descargado: `local_listing` (uid, title, thumbnail; `description`, `category_*`, `listing_type`, `entitlement_uid`, `user_seller_name` vacíos; `is_ai_forbidden` = 0, `is_ai_generated` = 0), `listing_acquisition` (listing_uid, user_uid), `download_meta` (format `unreal-engine`, path a VaultCache, cache_size 43 787 459), `catalog` (id de catálogo + namespace, que es el AppId que usa el instalador). Es una caché de descargas, no un catálogo. Para saber qué tiene el usuario en Fab la única fuente sigue siendo la web embebida (o el frontend del plugin del editor).
2. **Compatibilidad por versión.** El asset está publicado para 4.20-5.4; el diálogo mostró «No compatible user projects found». Hubo que marcar «Show all projects», elegir `KratosFabTest`, abrir «Select Version» y elegir 5.4 (la más alta de la lista) para que «Add to Project» se activara. El contenido cargó bien en 5.8.3, pero Nomos debe tratar esto como aviso: materiales y mapas de versiones antiguas pueden necesitar resave, y un pack con C++ o plugins no pasaría. El rango de versiones solo se ve en ese desplegable o en la web, no en la base.
3. **El pack escribe fuera de su carpeta.** Trajo 21 archivos de `StarterContent` y los dejó en `Content\StarterContent`. En este proyecto no existían, así que no hubo sobrescritura; en un proyecto que ya tenga StarterContent el Launcher copia encima sin preguntar. Nomos debe fotografiar `Content` antes de pulsar y comparar después (lo que hizo este informe con mtimes), o añadir siempre a un proyecto intermedio vacío y migrar desde él (nivel 1).
4. **La carpeta de destino no es predecible desde fuera.** No es `Content\Fab\<Pack>` ni el título del listado: es lo que el vendedor empaquetó (`AdvancedCelShader` para «Advanced Cel Shader Lite»). Se puede leer antes de copiar en `VaultCache\<AppName>\data\Content\*` o en el manifiesto; `index.py` lo hace a partir de `download_meta.path`.
5. **El enlace `ue/fab` no basta para llegar a la tienda embebida.** Abre la portada con «Start exploring» (enlace externo al navegador). La tienda con Mi biblioteca es el elemento «Fab» del menú lateral (`GoToUrl('[fab]')`), que necesita un clic.
6. **«On disk» del Launcher solo refleja su propio VaultCache**: antes de esta prueba marcaba 0 productos aunque hubiera packs Fab en `Content\Fab` de otros proyectos (los importó el plugin del editor, no el Launcher).
7. Sin desafíos: no apareció inicio de sesión ni captcha de Cloudflare; la sesión del usuario ya estaba abierta en el Launcher.

## Lectura para Nomos (§5.6)

- Nivel 2 es viable con un agente de GUI: 5 clics, unos 10 s para un pack pequeño, confirmación por log del Launcher (`HandleTaskComplete AlertCode=[ok]`) y por `download_meta` en la base, sin capturas.
- El detector de «pack nuevo» debe vigilar `VaultCache\*\data\Content\*` y `listings_v1.db` (mtime), no `Content\Fab`.
- La verificación sin GUI y el indexador ya cubren packs del Launcher (`NOMOS_ROOT`, `launcher_packs`).
- Riesgo a cubrir en el hito 4: versión del motor fuera de rango y sobrescritura de carpetas compartidas (StarterContent) → política: añadir siempre a un proyecto cuarentena y migrar por nivel 1.
