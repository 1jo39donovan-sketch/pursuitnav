"""The map officers keep on the phone, for when there's no signal: the
region's vector tiles (one PMTiles file, built by offline-map.sh) plus what
the app's map styles need to draw them with no network: the styles
themselves, their fonts (glyphs) and icons (sprites).

The styles are the app's own (OpenFreeMap's dark and liberty), rewritten to
read everything from the phone: the tiles from the PMTiles file, fonts and
icons from the files beside it. Places on the phone are written as
blueroute-pack://..., which the app swaps for wherever it kept the pack.

  python3 offline_styles.py <out dir> <bounds w,s,e,n> <min zoom> <max zoom> night=<url> day=<url>

Writes styles/, fonts/, sprites/ and manifest.json (every file, its size and
SHA-256) into <out dir>, which must already hold map.pmtiles.
"""

import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

PACK = "blueroute-pack://"
MAP_FILE = "map.pmtiles"
# Unicode blocks of 256 characters each, as MapLibre asks for them: Latin
# (with accents and Irish and Welsh letters), Latin Extended Additional, and
# punctuation and currency. A name using anything else draws without those
# characters offline; online it's unchanged.
GLYPH_RANGES = [0, 256, 512, 768, 7680, 7936, 8192, 8448]
USER_AGENT = "BlueRoute-map-build (+https://github.com/1jo39donovan-sketch/pursuitnav)"


def safe_font(name):
    """A font's name as a folder name: no spaces or commas for a URL to mangle."""
    return re.sub(r"[^A-Za-z0-9]", "", name)


def fonts_in(value, found, top=True):
    """Every font named in a text-font value: a list of names, or an expression
    whose font lists are ["literal", [...]]."""
    if isinstance(value, list) and value:
        if top and all(isinstance(v, str) for v in value):
            found.update(value)
        elif value[0] == "literal" and len(value) == 2 and isinstance(value[1], list):
            found.update(v for v in value[1] if isinstance(v, str))
        else:
            for v in value[1:]:
                fonts_in(v, found, top=False)
    return found


def rename_fonts(value, fonts):
    """text-font with each font swapped for its folder name; a list keeps only its first font."""
    if isinstance(value, list):
        if value and all(isinstance(v, str) for v in value) and value[0] in fonts:
            # A fallback list asks for one combined file per list; offline
            # there's only one file per font, so the first one is used.
            return [safe_font(value[0])]
        return [rename_fonts(v, fonts) for v in value]
    if isinstance(value, str) and value in fonts:
        return safe_font(value)
    return value


def sprite_urls(sprite):
    """[(id, url)] for a style's sprite, which is a URL or a list of {id, url}."""
    if not sprite:
        return []
    if isinstance(sprite, str):
        return [("default", sprite)]
    return [(s["id"], s["url"]) for s in sprite]


def offline_style(style, name):
    """The style reading everything from the pack. Returns (style, fonts used, sprites)."""
    style = json.loads(json.dumps(style))
    vector = [k for k, s in style["sources"].items() if s.get("type") == "vector"]
    if len(vector) != 1:
        raise ValueError(f"{name}: expected one vector source, found {vector}")
    source = vector[0]
    # Shading and other raster or online-only extras only draw zoomed out:
    # left out, with the layers that use them.
    others = [k for k in style["sources"] if k != source]
    for k in others:
        del style["sources"][k]
    style["layers"] = [layer for layer in style["layers"] if layer.get("source") in (None, source)]
    attribution = style["sources"][source].get("attribution")
    style["sources"][source] = {"type": "vector", "url": f"pmtiles://{PACK}{MAP_FILE}"}
    if attribution:
        style["sources"][source]["attribution"] = attribution

    fonts = set()
    for layer in style["layers"]:
        tf = layer.get("layout", {}).get("text-font")
        if tf is not None:
            fonts_in(tf, fonts)
    for layer in style["layers"]:
        layout = layer.get("layout", {})
        if "text-font" in layout:
            layout["text-font"] = rename_fonts(layout["text-font"], fonts)
    style["glyphs"] = PACK + "fonts/{fontstack}/{range}.pbf"

    sprites = sprite_urls(style.get("sprite"))
    if isinstance(style.get("sprite"), str):
        style["sprite"] = f"{PACK}sprites/{name}/default"
    elif sprites:
        style["sprite"] = [{"id": sid, "url": f"{PACK}sprites/{name}/{sid}"} for sid, _ in sprites]
    return style, fonts, sprites


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


def write(out, rel, data):
    path = os.path.join(out, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def file_list(out):
    files = []
    for root, _dirs, names in os.walk(out):
        for n in sorted(names):
            path = os.path.join(root, n)
            rel = os.path.relpath(path, out).replace(os.sep, "/")
            if rel == "manifest.json":
                continue
            h = hashlib.sha256()
            with open(path, "rb") as f:
                for chunk in iter(lambda: f.read(1 << 20), b""):
                    h.update(chunk)
            files.append({"path": rel, "bytes": os.path.getsize(path), "sha256": h.hexdigest()})
    # The big file first: it's the one a download is waiting on.
    files.sort(key=lambda f: (f["path"] != MAP_FILE, f["path"]))
    return files


def manifest(out, bounds, min_zoom, max_zoom, styles, built=None):
    files = file_list(out)
    return {
        "format": 1,
        "built": built or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "bounds": bounds,
        # Tiles go up to max zoom and are drawn closer in from that detail.
        "minZoom": min_zoom,
        "maxZoom": max_zoom,
        "styles": {name: f"styles/{name}.json" for name in styles},
        "bytes": sum(f["bytes"] for f in files),
        "files": files,
    }


def build(out, bounds, min_zoom, max_zoom, style_urls, get=fetch):
    if not os.path.exists(os.path.join(out, MAP_FILE)):
        raise SystemExit(f"{out}/{MAP_FILE} is missing: build the tiles first")
    all_fonts = set()
    for name, url in style_urls.items():
        style = json.loads(get(url))
        local, fonts, sprites = offline_style(style, name)
        all_fonts |= fonts
        write(out, f"styles/{name}.json", json.dumps(local, separators=(",", ":")).encode())
        for sid, base in sprites:
            for suffix in ("", "@2x"):
                for ext in ("json", "png"):
                    write(out, f"sprites/{name}/{sid}{suffix}.{ext}", get(f"{base}{suffix}.{ext}"))
        glyphs = style["glyphs"]
        for font in fonts:
            for start in GLYPH_RANGES:
                rng = f"{start}-{start + 255}"
                url = glyphs.replace("{fontstack}", urllib.parse.quote(font)).replace("{range}", rng)
                write(out, f"fonts/{safe_font(font)}/{rng}.pbf", get(url))
    m = manifest(out, bounds, min_zoom, max_zoom, list(style_urls))
    write(out, "manifest.json", json.dumps(m, indent=2).encode())
    return m


def main(argv):
    out, bounds, min_zoom, max_zoom, *styles = argv
    bounds = [float(v) for v in bounds.split(",")]
    if len(bounds) != 4:
        raise SystemExit("bounds must be west,south,east,north")
    style_urls = dict(s.split("=", 1) for s in styles)
    m = build(out, bounds, int(min_zoom), int(max_zoom), style_urls)
    print(f"offline map: {len(m['files'])} files, {m['bytes'] / 1e6:.0f} MB")


if __name__ == "__main__":
    main(sys.argv[1:])
