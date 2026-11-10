| Quiero | Usa | No uses |
|---|---|---|
| Poner cosas en el nivel | Que su C++ las cree en `BeginPlay`, o `nomos ue receta` con la plantilla `escena` | Editar el `.umap` a mano; un script de Python por tarea |
| Un material o un efecto | `nomos fastvfx crear <receta.json> --preview` | Python nodo a nodo; en 5.9, Python sin renderer (no compila materiales) |
| HUD y menús | UMG construido en C++, con el `UFont` compuesto en C++ ([acabado](acabado.md)) | Canvas, `DrawText`, fuentes del motor, Blueprint de widget a mano |
| Música o un sonido | `nomos sonido buscar "<palabras en inglés>"` y `nomos sonido bajar <id> --juego .` (WeLoveIndies: deja `.wav`, licencia, receta y `CREDITOS.md`; [assets](../../nomos/references/assets.md)); sin sesión, plan B: sintetizado o MetaSound ([ue59-juego](ue59-juego.md)) | Audio de otras webs; un `.wav` sin su `.licencia.json`; descargar de más |
| Compilar | `Build.bat` desde PowerShell, una vez por paso (50-80 s) | Bash; compilar tras cada línea |
| Probar reglas | Lógica en una clase C++ sin `UObject` y `nomos ue test` | Tests de física o de aspecto |
| Probar física y aspecto | Modo demo por variable de entorno y captura | Mirar solo el editor |
| Ver cómo quedó | Captura `-game` con su `.png.json`; del `.exe`, `captura_empaquetado.ps1` | Juzgar sin exposición manual; fiarse del editor para el empaquetado |
| Empaquetar | `RunUAT BuildCookRun` una vez al final, con `DirectoriesToAlwaysCook` ([acabado](acabado.md)) | Empaquetar en cada paso |
| Versión web (navegador) | `Scripts/empaquetar-web.ps1` (emscripten 6.0.10, motor del Launcher, sin compilar el motor) y probar con `webrun.py` ([web](web.md)) | Abrir `index.html` desde disco; compilar el motor desde fuente; Lumen o Nanite en la versión web |
| Importar una malla | Receta `importar_malla`: mide y rechaza escalas ×100 ([importar](importar.md)) | Importar y colocar sin medir |
| Cámara | Receta `camara_tercera_persona`, o una sola cámara en el pawn desde C++ ([camara-pawn](camara-pawn.md)) | Dos cámaras activas |
| Encuadrar la escena | `EncuadrarEscena(caja)` del PlayerController de la semilla (etiqueta `Escena`; `Inclinacion` 55 desde arriba, 20-30 de lado): avisa si el protagonista mide < 3 % | Colocar la cámara a ojo y no mirar la captura |
| Dar aspecto a un actor | `<Juego>Aspecto::Vestir(actor, rol)`: malla, material, luz y efectos por rol en un solo archivo | Mallas y materiales repartidos por las clases de mecánica |
| Luz de exterior | Receta `post_exterior` ([iluminacion](iluminacion.md)) | Tocar la exposición a ojo, captura tras captura |
| Repartir objetos | Receta `poblar_pcg` y contar instancias ([pcg](pcg.md)) | PCG a mano sin contar |
| Datos de juego | Receta `bp_datos`: Blueprint hijo y DataAsset | Valores escritos en el nivel |
| Algo nuevo del 5.9 | Probarlo 10 min, con su plan B escrito antes ([ue59-juego](ue59-juego.md)) | Insistir pasado ese tiempo |
| Unreal se cayó | `nomos ue crash` antes de relanzar ([diagnostico](diagnostico.md)) | Relanzar a ciegas |
| Lógica en Blueprint | C++ | Grafos de Blueprint escritos por un agente |
