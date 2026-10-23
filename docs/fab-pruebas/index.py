"""Indexador nivel 1 de Kratos (prototipo, solo stdlib): qué assets de Fab ya están en esta máquina.

Fuentes: Content/Fab de cada proyecto Unreal, caché del plugin Fab (%TEMP%/FabLibrary o la ruta
que fije FabSettings en el proyecto), Megascans Library de Quixel Bridge y los metadatos de la
biblioteca en el Launcher (VaultCache/FabLibrary/listings_v1.db, leído desde una copia).

Uso: python -I index.py <salida.json> [carpeta de proyectos]
"""
import configparser, json, os, re, shutil, sqlite3, sys, tempfile
from pathlib import Path

HOME = Path.home()
PROJECTS = Path(sys.argv[2]) if len(sys.argv) > 2 else HOME / "Documents" / "Unreal Projects"
LISTINGS_DB = Path(os.environ.get("ProgramData", r"C:\ProgramData")) / "Epic/EpicGamesLauncher/VaultCache/FabLibrary/listings_v1.db"
MEGASCANS = HOME / "Documents" / "Megascans Library" / "Downloaded" / "UAssets"
KIND_BY_FOLDER = {"StaticMeshes": "static_mesh", "SkeletalMeshes": "skeletal_mesh", "Materials": "material",
                  "Textures": "texture", "Animations": "animation"}


def engine_of(uproject: Path) -> str:
    try:
        return str(json.loads(uproject.read_text("utf-8-sig")).get("EngineAssociation", ""))
    except Exception:
        return ""


def fab_cache_dirs(project: Path) -> list[Path]:
    """Ruta de la caché del plugin: FabSettings.CacheDirectoryPath (EditorPerProjectUserSettings) o %TEMP%/FabLibrary."""
    dirs = [Path(tempfile.gettempdir()) / "FabLibrary"]
    ini = project / "Saved/Config/WindowsEditor/EditorPerProjectUserSettings.ini"
    if ini.is_file():
        cp = configparser.RawConfigParser(strict=False); cp.optionxform = str
        try:
            cp.read(ini, encoding="utf-8-sig")
            raw = cp.get("/Script/Fab.FabSettings", "CacheDirectoryPath", fallback="")
            m = re.search(r'Path="([^"]+)"', raw)
            if m: dirs.append(Path(m.group(1)))
        except Exception:
            pass
    return dirs


def index_projects() -> tuple[list, set]:
    packs, caches = [], set()
    for uproject in sorted(PROJECTS.glob("*/*.uproject")):
        project = uproject.parent
        caches.update(fab_cache_dirs(project))
        fab = project / "Content" / "Fab"
        if not fab.is_dir():
            continue
        for pack in sorted(p for p in fab.iterdir() if p.is_dir()):
            files = sorted(p for p in pack.rglob("*") if p.is_file())
            packs.append({
                "project": project.name, "engine": engine_of(uproject), "pack": pack.name,
                "content_path": f"/Game/Fab/{pack.name}", "disk_path": str(pack),
                "files": len(files), "bytes": sum(f.stat().st_size for f in files),
                "assets": [{"kind": KIND_BY_FOLDER.get(f.parent.name, "other"), "name": f.stem,
                            "rel": f.relative_to(pack).as_posix()} for f in files if f.suffix == ".uasset"],
                # ponytail: el pack se da por autocontenido; el editor sin GUI comprueba las dependencias reales
            })
    return packs, caches


def index_cache(dirs: set) -> list:
    out = []
    for d in sorted(dirs):
        zips = sorted(d.glob("*.zip")) if d.is_dir() else []
        out.append({"dir": str(d), "exists": d.is_dir(), "zips": [{"asset_id": z.stem, "bytes": z.stat().st_size} for z in zips]})
    return out


def index_megascans() -> list:
    data = MEGASCANS / "uassetsData.json"
    if not data.is_file():
        return []
    items = json.loads(data.read_text("utf-8")).get("assets", [])
    return [{"id": a.get("id"), "name": a.get("name"), "type": a.get("assetType"),
             "dir": str(MEGASCANS / a.get("id", "")), "tiers": a.get("tiers")} for a in items]


def index_listings() -> dict:
    if not LISTINGS_DB.is_file():
        return {"db": str(LISTINGS_DB), "exists": False, "rows": 0, "sample": []}
    tmp = Path(tempfile.mkdtemp()) / "listings_v1.db"
    shutil.copy2(LISTINGS_DB, tmp)  # nunca abrir el original del Launcher
    con = sqlite3.connect(f"file:{tmp.as_posix()}?mode=ro", uri=True)
    rows = con.execute("select uid, title, category_name, listing_type, is_ai_forbidden, entitlement_uid from local_listing").fetchall()
    downloads = con.execute("select l.title, d.format, d.path, d.cache_size from download_meta d left join local_listing l on l.uid = d.listing_uid").fetchall()
    con.close()
    return {"db": str(LISTINGS_DB), "exists": True, "rows": len(rows),
            "sample": [dict(zip(("uid", "title", "category", "type", "ai_forbidden", "entitlement"), r)) for r in rows[:20]],
            # packs que el Launcher ya bajó a VaultCache (nivel 2); el nombre de carpeta en Content sale de data/Content/*
            "downloads": [{"title": t, "format": fmt, "vault": p, "bytes": size,
                           "content_dirs": sorted(c.name for c in (Path(p) / "data/Content").glob("*") if c.is_dir() and not c.name.startswith("__"))}
                          for t, fmt, p, size in downloads]}


def index_launcher_packs(listings: dict) -> list:
    """Carpetas Content/<Pack> de cada proyecto que coinciden con un pack bajado por el Launcher."""
    names = {n for dl in listings.get("downloads", []) for n in dl["content_dirs"] if n != "StarterContent"}
    out = []
    for uproject in sorted(PROJECTS.glob("*/*.uproject")):
        for name in sorted(names):
            pack = uproject.parent / "Content" / name
            if pack.is_dir():
                files = [p for p in pack.rglob("*") if p.is_file()]
                out.append({"project": uproject.parent.name, "pack": name, "content_path": f"/Game/{name}",
                            "disk_path": str(pack), "files": len(files), "bytes": sum(p.stat().st_size for p in files)})
    return out


def main():
    out = Path(sys.argv[1])
    packs, caches = index_projects()
    listings = index_listings()
    result = {"projects_dir": str(PROJECTS), "packs": packs, "launcher_packs": index_launcher_packs(listings),
              "plugin_cache": index_cache(caches), "megascans": index_megascans(), "launcher_listings": listings}
    out.write_text(json.dumps(result, indent=2, ensure_ascii=False), "utf-8")
    print(f"packs Fab en proyectos: {len(packs)} ({sum(p['bytes'] for p in packs)/1e6:.1f} MB)")
    for p in packs:
        print(f"  {p['project']:<14} {p['pack']:<28} {p['files']:>2} archivos  {p['bytes']/1e6:7.1f} MB  motor {p['engine'][:12]}")
    for c in result["plugin_cache"]:
        print(f"caché plugin {c['dir']}: {'existe, ' + str(len(c['zips'])) + ' zips' if c['exists'] else 'no existe'}")
    for p in result["launcher_packs"]:
        print(f"  (Launcher) {p['project']:<14} {p['pack']:<28} {p['files']:>2} archivos  {p['bytes']/1e6:7.1f} MB")
    print(f"megascans: {len(result['megascans'])} assets · listings Launcher: {result['launcher_listings']['rows']} filas, {len(result['launcher_listings']['downloads'])} descargas")
    assert all(p["files"] > 0 for p in packs), "un pack sin archivos indica un escaneo roto"


if __name__ == "__main__":
    main()
