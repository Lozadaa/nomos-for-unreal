# Semilla · qué hay hecho

## Cómo se juega
- Espacio o clic: empezar. R: otra partida. Esc: salir.
- Modo demo: `SEMILLA_AUTO=1` y el juego se juega solo.

## Entrega
- Compila: `pwsh -File Scripts/compilar.ps1`.
- Test de reglas: `nomos ue test Semilla.Reglas`.
- Empaquetado: `pwsh -File Scripts/empaquetar.ps1` → `Empaquetado/Windows/Semilla.exe`.
- ACABADO: revisar_acabado 0 fallos, captura docs/empaquetado.png
