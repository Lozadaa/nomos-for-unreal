"""Revisa el acabado de un juego Unreal antes de darlo por terminado.
Uso: python revisar_acabado.py <carpeta del proyecto> [--archivos-de lista.txt] [--parcial]
- `--archivos-de`: solo revisa esos archivos de Source/ (una ruta relativa por línea; Nomos le pasa el diff de la tarea).
- `--parcial`: sin las reglas de juego entero (pantalla de carga, MapsToCook, fuente propia); Nomos las exige solo
  en la tarea que empaqueta. Sin opciones, revisa el juego entero, como al dar el FIN.

Falla (exit 1) si encuentra lo que dejó feo o roto un juego en las metras (2026-11-10):
- fuentes del motor (GEngine->GetLargeFont…): pixeladas y sin tildes en el HUD;
- HUD dibujado con Canvas (DrawText, DrawRect, FCanvasTextItem…) en vez de UMG con fuente importada;
- líneas o formas de depuración (DrawDebug*) y materiales del motor (/Engine/EngineMaterials) en lo que ve el jugador;
- assets de /Game cargados por ruta de texto sin que DefaultGame.ini obligue a cocinarlos: en el editor se ven,
  en el empaquetado salen con el material de cuadros;
- ninguna pantalla de carga que espere a las texturas.
Una línea que de verdad lo necesite (p. ej. depuración bajo #if !UE_BUILD_SHIPPING) lleva el comentario `acabado: ok`.

Oficio visual (2026-11-11, Trompo: el agente solo torneó su trompo; con Nomos salió de /Engine/BasicShapes):
- formas por defecto (/Engine/BasicShapes, /Engine/EngineMeshes, mallas de plantilla) solo con `forma-basica: <motivo>`
  en la línea, y nunca para Protagonista, Amenaza u Objetivo; más de cinco excepciones es aviso;
- el marcador `NOMOS_SIN_ASPECTO` de la semilla falla hasta que el juego ponga su aspecto;
- en el juego entero, `docs/direccion.md` lleva `## Plan de arte` con una fila por cosa visible y ninguna celda vacía.
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
FORMA = re.compile(r"/Engine/(BasicShapes|EngineMeshes)/|/Game/(StarterContent/Shapes|LevelPrototyping/Meshes)/")
MOTIVO = re.compile(r"forma-basica:\s*\S")
ROLES_VISTOSOS = re.compile(r"\b(Protagonista|Amenaza|Objetivo)\b")
MAX_EXCEPCIONES = 5
FILAS_PLAN = ("Protagonista", "Amenazas", "Objetivos", "Suelo", "Fondo", "Luz", "Cámara", "Efectos", "Sonido")
ARTE = "(arsenal-visual.md y el plan de arte de docs/direccion.md)"
CARGA = re.compile(r"\b(StreamAllResources|IsFullyStreamedIn|RequestAsyncLoad|LoadPackageAsync|MoviePlayer|PantallaCarga|LoadingScreen)\b")


def revisar(proyecto: Path, solo: list[str] | None = None, final: bool = True) -> tuple[list[str], list[str]]:
    fallos, avisos = [], []
    fuentes = [p for p in (proyecto / "Source").rglob("*") if p.suffix in (".cpp", ".h") and "Test" not in p.name]
    if solo is not None:
        elegidos = {Path(r.replace("\\", "/")).as_posix() for r in solo}
        fuentes = [p for p in fuentes if p.relative_to(proyecto).as_posix() in elegidos]
    rutas, hay_carga, excepciones = {}, False, 0
    for f in fuentes:
        for n, linea in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            donde = f"{f.relative_to(proyecto)}:{n}"
            if "NOMOS_SIN_ASPECTO" in linea:
                fallos.append(f"{donde}: aspecto de marcador de la semilla: haz el de tu juego {ARTE}")
            codigo = linea.split("//", 1)[0]
            if FORMA.search(codigo):
                if ROLES_VISTOSOS.search(linea):
                    fallos.append(f"{donde}: forma básica del motor, nunca para Protagonista, Amenaza u Objetivo: modélala {ARTE}")
                elif not MOTIVO.search(linea):
                    fallos.append(f"{donde}: forma básica del motor sin motivo: usa el arsenal o justifícala con `// forma-basica: <motivo>` {ARTE}")
                else:
                    excepciones += 1
            if "acabado: ok" in linea or linea.lstrip().startswith("//"):
                continue
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
    if excepciones:
        (avisos.append if excepciones > MAX_EXCEPCIONES else print)(
            f"formas básicas con motivo: {excepciones}" + (f" (más de {MAX_EXCEPCIONES}: ¿de verdad no hay otra herramienta?)" if excepciones > MAX_EXCEPCIONES else ""))
    if not final:
        return fallos, avisos
    fallos += plan_de_arte(proyecto / "docs" / "direccion.md")
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


def plan_de_arte(direccion: Path) -> list[str]:
    """`## Plan de arte` con una fila por cosa visible: qué, herramienta, por qué y detalle; ninguna celda vacía."""
    texto = direccion.read_text(encoding="utf-8", errors="replace") if direccion.exists() else ""
    m = re.search(r"^##\s*Plan de arte\s*$(.*?)(?=^##\s|\Z)", texto, re.M | re.S)
    if not m:
        return [f"docs/direccion.md: falta la sección `## Plan de arte` (qué ve el jugador, con qué herramienta, por qué y con qué detalle) {ARTE}"]
    filas = {}
    for linea in m.group(1).splitlines():
        celdas = [c.strip() for c in linea.strip().strip("|").split("|")] if linea.strip().startswith("|") else []
        if len(celdas) > 1 and not set(celdas[0]) <= set("-: ") and celdas[0].lower() != "qué":
            filas[celdas[0].lower()] = celdas
    vacia = lambda c: c.strip(" -—?").lower() in ("", "todo", "pendiente")
    out = []
    for nombre in FILAS_PLAN:
        celdas = next((v for k, v in filas.items() if k.startswith(nombre.lower()[:5])), None)
        if celdas is None:
            out.append(f"docs/direccion.md: Plan de arte sin la fila «{nombre}» (si no aplica, escribe por qué)")
        elif len(celdas) < 4 or any(vacia(c) for c in celdas[1:]):
            out.append(f"docs/direccion.md: Plan de arte: la fila «{nombre}» está vacía o incompleta")
    return out


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
        assert len(fallos) == 5, fallos  # fuente, Canvas, ruta sin cocinar, sin plan de arte, sin carga («acabado: ok» no cuenta)
        (p / "Source" / "J" / "Hud.cpp").write_text(
            'LoadObject<UMaterial>(nullptr, TEXT("/Game/Metras/M_Tierra.M_Tierra"));\n'
            'IStreamingManager::Get().StreamAllResources(5.f);\n', encoding="utf-8")
        (p / "Config" / "DefaultGame.ini").write_text(
            '[/Script/UnrealEd.ProjectPackagingSettings]\n+DirectoriesToAlwaysCook=(Path="/Game/Metras")\n'
            '+MapsToCook=(FilePath="/Game/Metras/L_Patio")\n', encoding="utf-8")
        (p / "docs").mkdir()
        (p / "docs" / "direccion.md").write_text("## Plan de arte\n| Qué | Herramienta | Por qué | Detalle |\n|---|---|---|---|\n"
            + "".join(f"| {n} | malla procedural | se ve | alto |\n" for n in FILAS_PLAN), encoding="utf-8")
        assert revisar(p)[0] == [], revisar(p)
        (p / "Source" / "J" / "Aspecto.cpp").write_text('M = TEXT("/Engine/BasicShapes/Cube.Cube");\n'
            'N = TEXT("/Engine/BasicShapes/Cube.Cube"); // forma-basica: colisión invisible\n'
            'if (Rol == TEXT("Amenaza")) M = TEXT("/Engine/BasicShapes/Cone.Cone"); // forma-basica: rápido\n', encoding="utf-8")
        assert [f.split(":")[1] for f in revisar(p)[0]] == ["1", "3"], revisar(p)
        (p / "Source" / "J" / "Aspecto.cpp").unlink()
        # parcial y solo el diff: otra pista sin pantalla de carga ni con la fuente del motor no bloquea a esta
        (p / "Source" / "J" / "Otra.cpp").write_text("UFont* F = GEngine->GetLargeFont();\n", encoding="utf-8")
        (p / "Source" / "J" / "Hud.cpp").write_text("int x = 0;\n", encoding="utf-8")
        assert revisar(p, ["Source/J/Hud.cpp"], final=False) == ([], []), revisar(p, ["Source/J/Hud.cpp"], final=False)
        assert len(revisar(p, ["Source\\J\\Otra.cpp"], final=False)[0]) == 1
    print("probar: ok")


if __name__ == "__main__":
    if sys.argv[1:] == ["--probar"]:
        probar()
        sys.exit(0)
    args = sys.argv[1:]
    parcial = "--parcial" in args
    args = [a for a in args if a != "--parcial"]
    solo = None
    if "--archivos-de" in args:
        i = args.index("--archivos-de")
        solo = [l.strip() for l in Path(args[i + 1]).read_text(encoding="utf-8").splitlines() if l.strip()]
        del args[i:i + 2]
    if len(args) != 1:
        sys.exit(__doc__)
    fallos, avisos = revisar(Path(args[0]), solo, final=not parcial)
    for a in avisos:
        print("AVISO", a)
    for f in fallos:
        print("FALLO", f)
    print(f"acabado: {len(fallos)} fallos, {len(avisos)} avisos")
    sys.exit(1 if fallos else 0)
