"""Nomos · ¿el juego se lee? Mide tres capturas del modo demo (inicio, mitad, final) y su JSON de escena.

Uso: python revisar_imagen.py <carpeta> [--ancho 1280]
Lee inicio.png, mitad.png y final.png y, si existe, <nombre>.png.json (formato de service/unreal/nomos_escena.py).
Imprime `FALLO <captura>: <texto>` o `AVISO <captura>: <texto>` por hallazgo. Salida: 0 sin fallos, 1 con alguno,
2 si falta una captura, 3 sin Pillow. Dice si se lee, no si es bonito: eso lo mira quien abre las capturas.
"""
import json, math, os, sys

try:
    from PIL import Image
except ImportError:
    print("Falta Pillow: pip install pillow")
    sys.exit(3)

CAPTURAS = ("inicio", "mitad", "final")


def luminancias(img):
    """Luminancia 0-1 de cada píxel (0,2126 R + 0,7152 G + 0,0722 B)."""
    rgb = img.convert("RGB")
    pixeles = rgb.get_flattened_data() if hasattr(rgb, "get_flattened_data") else rgb.getdata()
    return [(0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 for r, g, b in pixeles]


def media_caja(lum, ancho, alto, x0, y0, x1, y1, hueco=None):
    """Luminancia media de la caja [x0,x1)×[y0,y1) recortada a la imagen, sin la caja `hueco` si se da."""
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(ancho, x1), min(alto, y1)
    total = n = 0
    for y in range(y0, y1):
        fila = y * ancho
        for x in range(x0, x1):
            if hueco and hueco[0] <= x < hueco[2] and hueco[1] <= y < hueco[3]:
                continue
            total += lum[fila + x]
            n += 1
    return total / n if n else 0.0


def alto_proyectado(pawn, fov, ancho):
    """Alto en píxeles del mayor eje de `tam`. El FOV de Unreal es horizontal: px = tam / dist × (ancho/2) / tan(fov/2)."""
    tam, dist = max(pawn.get("tam") or [0]), pawn.get("dist") or 0
    if not tam or dist <= 0 or not fov:
        return None
    return tam / dist * (ancho / 2) / math.tan(math.radians(fov) / 2)


def revisar(carpeta, ancho_ref=1280):
    hallazgos, datos = [], {}
    for nombre in CAPTURAS:
        png = os.path.join(carpeta, nombre + ".png")
        if not os.path.exists(png):
            return [("FALLO", nombre, f"falta {png}: Scripts/capturar.ps1 -Demo la saca")], 2
        img = Image.open(png)
        ancho, alto = img.size
        lum = luminancias(img)
        n = len(lum)
        escena = None
        if os.path.exists(png + ".json"):
            with open(png + ".json", encoding="utf-8") as f:
                escena = json.load(f)
        datos[nombre] = (lum, escena)

        negro = sum(1 for v in lum if v < 0.02) / n
        brillo = sum(1 for v in lum if v > 0.6) / n
        media = sum(lum) / n
        if media < 0.04:
            hallazgos.append(("FALLO", nombre, f"pantalla casi vacía (luminancia media {media:.3f} < 0,04): carga en negro o sin luz"))
        if negro > 0.35:
            hallazgos.append(("FALLO", nombre, f"negro puro en el {negro:.0%} de la imagen (> 35 %): cierra el fondo o ilumina"))
        if brillo < 0.005:
            hallazgos.append(("FALLO", nombre, f"nada brilla: {brillo:.2%} de píxeles claros (< 0,5 %); una noche necesita un punto de luz"))
        if escena is None:
            continue

        pawn = escena.get("pawn")
        if not pawn or not pawn.get("px"):
            hallazgos.append(("AVISO", nombre, "sin pawn en el JSON: no se mide el protagonista"))
        else:
            px, py = pawn["px"]
            fov = (escena.get("camara") or {}).get("fov")
            h = alto_proyectado(pawn, fov, ancho)
            mx, my = 0.04 * ancho, 0.04 * alto
            if not (mx <= px <= ancho - mx and my <= py <= alto - my):
                hallazgos.append(("FALLO", nombre, f"el protagonista está en el borde o fuera ({px},{py})"))
            if h is None:
                hallazgos.append(("AVISO", nombre, "el pawn no trae tam o dist: no se mide su tamaño"))
            else:
                if h < 0.03 * alto:
                    hallazgos.append(("FALLO", nombre, f"el protagonista mide {h:.0f} px de alto (< 3 % = {0.03 * alto:.0f} px): acerca la cámara o síguelo"))
                lado = max(2, round(h))
                c = (round(px - lado / 2), round(py - lado / 2), round(px + lado / 2), round(py + lado / 2))
                dentro = media_caja(lum, ancho, alto, *c)
                anillo = media_caja(lum, ancho, alto, round(px - lado), round(py - lado), round(px + lado), round(py + lado), hueco=c)
                if abs(dentro - anillo) < 0.08:
                    hallazgos.append(("FALLO", nombre, f"el protagonista no se distingue del fondo (contraste {abs(dentro - anillo):.3f} < 0,08)"))

        delante = [a for a in escena.get("actores", []) if a.get("px") is not None]  # sin px: detrás de la cámara
        fuera = [a for a in delante if not (0 <= a["px"][0] <= ancho and 0 <= a["px"][1] <= alto)]
        if delante and len(fuera) / len(delante) > 0.25:
            hallazgos.append(("FALLO", nombre, f"{len(fuera)} de {len(delante)} actores fuera del cuadro (> 25 %): la escena no cabe"))

    (li, ei), (lf, ef) = datos["inicio"], datos["final"]
    if len(li) == len(lf):
        diferencia = sum(abs(a - b) for a, b in zip(li, lf)) / len(li)
        mismos = sorted(a.get("nombre", "") for a in (ei or {}).get("actores", [])) == sorted(a.get("nombre", "") for a in (ef or {}).get("actores", []))
        if diferencia < 0.02 and mismos:
            hallazgos.append(("FALLO", "final", f"nada cambia entre inicio y final (diferencia {diferencia:.3f}): ¿se quedó en el menú?"))
    return hallazgos, 1 if any(h[0] == "FALLO" for h in hallazgos) else 0


def main(argv):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = [a for a in argv if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 2
    ancho = int(argv[argv.index("--ancho") + 1]) if "--ancho" in argv else 1280
    hallazgos, codigo = revisar(args[0], ancho)
    for tipo, captura, texto in hallazgos:
        print(f"{tipo} {captura}: {texto}")
    if codigo == 0:
        print(f"revisar_imagen: 0 fallos ({sum(1 for h in hallazgos if h[0] == 'AVISO')} avisos)")
    return codigo


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
