"""Revisa el acabado de un juego Unreal antes de darlo por terminado. Uso: python revisar_acabado.py <carpeta del proyecto>

Falla (exit 1) si encuentra lo que dejó feo o roto un juego en las metras (2026-11-10):
- fuentes del motor (GEngine->GetLargeFont…): pixeladas y sin tildes en el HUD;
- HUD dibujado con Canvas (DrawText, DrawRect, FCanvasTextItem…) en vez de UMG con fuente importada;
- líneas o formas de depuración (DrawDebug*) y materiales del motor (/Engine/EngineMaterials) en lo que ve el jugador;
- assets de /Game cargados por ruta de texto sin que DefaultGame.ini obligue a cocinarlos: en el editor se ven,
  en el empaquetado salen con el material de cuadros;
- ninguna pantalla de carga que espere a las texturas.
Una línea que de verdad lo necesite (p. ej. depuración bajo #if !UE_BUILD_SHIPPING) lleva el comentario `acabado: ok`.
"""
import re
import sys
from pathlib import Path

REGLAS = [
    (r"\bGet(Tiny|Small|Medium|Large|Subtitle)Font\s*\(", "fuente del motor: importa una TTF y usa UMG (acabado.md, UI)"),
    (r"\b(DrawText|DrawRect|DrawTexture|DrawMaterial|DrawLine)\s*\(|\bFCanvas(Text|Tile|Line|Box)Item\b|\bK2_Draw\w+\s*\(",
     "HUD o indicador dibujado con Canvas: UMG con la dirección de arte (acabado.md, UI)"),
    (r"\bDrawDebug\w+\s*\(", "forma de depuración visible: diseña el indicador (acabado.md, Indicadores)"),
    (r"/Engine/EngineMaterials/", "material del motor en el juego: crea el tuyo (acabado.md)"),
]
RUTA_GAME = re.compile(r"[\"'](/Game/[^\"'.]+)")
CARGA = re.compile(r"\b(StreamAllResources|IsFullyStreamedIn|RequestAsyncLoad|LoadPackageAsync|MoviePlayer|PantallaCarga|LoadingScreen)\b")


def revisar(proyecto: Path) -> tuple[list[str], list[str]]:
    fallos, avisos = [], []
    fuentes = [p for p in (proyecto / "Source").rglob("*") if p.suffix in (".cpp", ".h") and "Test" not in p.name]
    rutas, hay_carga = {}, False
    for f in fuentes:
        for n, linea in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if "acabado: ok" in linea or linea.lstrip().startswith("//"):
                continue
            donde = f"{f.relative_to(proyecto)}:{n}"
            for patron, motivo in REGLAS:
                if re.search(patron, linea):
                    fallos.append(f"{donde}: {motivo}")
            for r in RUTA_GAME.findall(linea):
                rutas.setdefault(r.rsplit("/", 1)[0], donde)
            hay_carga |= bool(CARGA.search(linea))
    ini = proyecto / "Config" / "DefaultGame.ini"
    texto = ini.read_text(encoding="utf-8", errors="replace") if ini.exists() else ""
    cocinadas = re.findall(r"DirectoriesToAlwaysCook=\(Path=\"([^\"]+)\"", texto)
    for carpeta, donde in sorted(rutas.items()):
        if not any(carpeta == c or carpeta.startswith(c.rstrip("/") + "/") for c in cocinadas):
            fallos.append(f"{donde}: {carpeta} se carga por ruta y no está en DirectoriesToAlwaysCook de DefaultGame.ini:"
                          " en el empaquetado saldrá sin material (acabado.md, Empaquetado)")
    if "MapsToCook" not in texto:
        avisos.append("DefaultGame.ini sin +MapsToCook: añade el mapa del juego (acabado.md, Empaquetado)")
    if fuentes and not hay_carga:
        fallos.append("Source/: no hay pantalla de carga que espere a las texturas (acabado.md, Pantalla de carga)")
    # solo Content/ y Fuentes/: el empaquetado (Saved/, Empaquetado/) trae fuentes del motor que no cuentan
    propias = [p for d in ("Content", "Fuentes", "Fonts") if (proyecto / d).exists() for p in (proyecto / d).rglob("*")
               if p.suffix.lower() in (".ttf", ".otf") or "Font" in p.name or "Fuente" in p.name]
    if not propias:
        avisos.append("no hay ninguna fuente propia (.ttf/.otf o asset *Font*): el HUD usará la del motor (acabado.md, UI)")
    return fallos, avisos


def probar() -> None:
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        p = Path(d)
        (p / "Source" / "J").mkdir(parents=True)
        (p / "Config").mkdir()
        (p / "Source" / "J" / "Hud.cpp").write_text(
            'UFont* F = GEngine->GetLargeFont();\nDrawRect(C, 0, 0, 1, 1);\n'
            'LoadObject<UMaterial>(nullptr, TEXT("/Game/Metras/M_Tierra.M_Tierra"));\n'
            'DrawDebugLine(W, A, B, C); // acabado: ok\n', encoding="utf-8")
        fallos, _ = revisar(p)
        assert len(fallos) == 4, fallos  # fuente, Canvas, ruta sin cocinar, sin carga (la línea con «acabado: ok» no cuenta)
        (p / "Source" / "J" / "Hud.cpp").write_text(
            'LoadObject<UMaterial>(nullptr, TEXT("/Game/Metras/M_Tierra.M_Tierra"));\n'
            'IStreamingManager::Get().StreamAllResources(5.f);\n', encoding="utf-8")
        (p / "Config" / "DefaultGame.ini").write_text(
            '[/Script/UnrealEd.ProjectPackagingSettings]\n+DirectoriesToAlwaysCook=(Path="/Game/Metras")\n'
            '+MapsToCook=(FilePath="/Game/Metras/L_Patio")\n', encoding="utf-8")
        assert revisar(p)[0] == [], revisar(p)
    print("probar: ok")


if __name__ == "__main__":
    if sys.argv[1:] == ["--probar"]:
        probar()
        sys.exit(0)
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    fallos, avisos = revisar(Path(sys.argv[1]))
    for a in avisos:
        print("AVISO", a)
    for f in fallos:
        print("FALLO", f)
    print(f"acabado: {len(fallos)} fallos, {len(avisos)} avisos")
    sys.exit(1 if fallos else 0)
