| Quiero | Usa | No uses |
|---|---|---|
| Poner cosas en el nivel | Que su C++ las cree en `BeginPlay`, o `nomos ue receta` con la plantilla `escena` | Editar el `.umap` a mano; un script de Python por tarea |
| Un material o un efecto | `nomos fastvfx crear <receta.json> --preview` | Python nodo a nodo; en 5.9, Python sin renderer (no compila materiales) |
| HUD y menús | UMG construido en C++, con el `UFont` compuesto en C++ ([acabado](acabado.md)) | Canvas, `DrawText`, fuentes del motor, Blueprint de widget a mano |
| Un sonido | En 5.9, MetaSound Builder por Python; plan B, `SoundWave` sintetizado e importado ([ue59-juego](ue59-juego.md)) | Buscar o descargar audio |
| Compilar | `Build.bat` desde PowerShell, una vez por paso (50-80 s) | Bash; compilar tras cada línea |
| Probar reglas | Lógica en una clase C++ sin `UObject` y `nomos ue test` | Tests de física o de aspecto |
| Probar física y aspecto | Modo demo por variable de entorno y captura | Mirar solo el editor |
| Ver cómo quedó | Captura `-game` con su `.png.json`; del `.exe`, `captura_empaquetado.ps1` | Juzgar sin exposición manual; fiarse del editor para el empaquetado |
| Empaquetar | `RunUAT BuildCookRun` una vez al final, con `DirectoriesToAlwaysCook` ([acabado](acabado.md)) | Empaquetar en cada paso |
| Importar una malla | Receta `importar_malla`: mide y rechaza escalas ×100 ([importar](importar.md)) | Importar y colocar sin medir |
| Cámara | Receta `camara_tercera_persona`, o una sola cámara en el pawn desde C++ ([camara-pawn](camara-pawn.md)) | Dos cámaras activas |
| Luz de exterior | Receta `post_exterior` ([iluminacion](iluminacion.md)) | Tocar la exposición a ojo, captura tras captura |
| Repartir objetos | Receta `poblar_pcg` y contar instancias ([pcg](pcg.md)) | PCG a mano sin contar |
| Datos de juego | Receta `bp_datos`: Blueprint hijo y DataAsset | Valores escritos en el nivel |
| Algo nuevo del 5.9 | Probarlo 10 min, con su plan B escrito antes ([ue59-juego](ue59-juego.md)) | Insistir pasado ese tiempo |
| Unreal se cayó | `nomos ue crash` antes de relanzar ([diagnostico](diagnostico.md)) | Relanzar a ciegas |
| Lógica en Blueprint | C++ | Grafos de Blueprint escritos por un agente |
