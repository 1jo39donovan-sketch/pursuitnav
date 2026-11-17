"""Extracts the Underground, Overground, Elizabeth line, DLR and tram lines
from an OpenStreetMap extract, each with its name and colour, so the app can
draw them as officers know them (the Victoria line light blue, the Northern
black). The colours are OSM's own `colour` tags.

Usage: python extract_lines.py <region.osm.pbf> <out.txt.gz>

Output, gzipped UTF-8, one stretch of track (an OSM way) per line after a
header line:
    line name|#colour|mode|tunnel (1 or 0)|lng*1e5,lat*1e5 lng*1e5,lat*1e5 …
mode is subway, light_rail, tram or train (Overground and Elizabeth line
only: other rail is drawn from the map itself). A stretch shared by several
lines appears once for each.
"""

import datetime
import gzip
import re
import sys
from pathlib import Path

import osmium

MODES = {"subway", "light_rail", "tram", "monorail", "train"}
# Of the trains, only TfL's: the rest of the railway is drawn from the map.
TFL_TRAINS = re.compile(r"overground|elizabeth", re.I)
DEFAULT_COLOURS = {"subway": "#d2232a", "light_rail": "#00a3a6", "monorail": "#00a3a6", "tram": "#5ba829", "train": "#ee7c0e"}
HEX = re.compile(r"^#?[0-9a-fA-F]{6}$")
# Greater London, Kent and Essex with a margin, as the server's REGION_BOUNDS.
BOUNDS = (-0.8, 50.8, 1.6, 52.2)


def clean(s: str | None) -> str:
    return " ".join((s or "").replace("|", "/").split())


def line_of(tags) -> tuple[str, str, str] | None:
    """(line name, colour, mode) for a route relation, or None if it isn't one we draw."""
    if tags.get("type") != "route":
        return None
    mode = tags.get("route")
    if mode not in MODES:
        return None
    if mode == "train" and not any(TFL_TRAINS.search(tags.get(k) or "") for k in ("network", "operator", "name")):
        return None
    # "Victoria line: Brixton → Walthamstow Central" is the Victoria line.
    name = clean((tags.get("name") or tags.get("ref") or "").split(":")[0])
    if not name:
        return None
    colour = (tags.get("colour") or "").strip()
    colour = ("#" + colour.lstrip("#")).lower() if HEX.match(colour) else DEFAULT_COLOURS[mode]
    return name, colour, mode


class Routes(osmium.SimpleHandler):
    """First pass: the lines and the ways each one runs along."""

    def __init__(self):
        super().__init__()
        self.lines_of_way: dict[int, list[tuple[str, str, str]]] = {}

    def relation(self, r):
        line = line_of(r.tags)
        if not line:
            return
        for m in r.members:
            # Track, not stops and platforms.
            if m.type == "w" and m.role in ("", "forward", "backward"):
                ways = self.lines_of_way.setdefault(m.ref, [])
                if line not in ways:
                    ways.append(line)


class Track(osmium.SimpleHandler):
    """Second pass: where those ways run."""

    def __init__(self, lines_of_way):
        super().__init__()
        self.lines_of_way = lines_of_way
        self.rows = []

    def way(self, w):
        lines = self.lines_of_way.get(w.id)
        if not lines:
            return
        try:
            pts = [(n.lon, n.lat) for n in w.nodes if n.location.valid()]
        except osmium.InvalidLocationError:
            return
        west, south, east, north = BOUNDS
        if len(pts) < 2 or not any(west <= x <= east and south <= y <= north for x, y in pts):
            return
        tunnel = "1" if w.tags.get("tunnel") in ("yes", "building_passage") or w.tags.get("layer", "0").startswith("-") else "0"
        coords = " ".join(f"{round(x * 1e5)},{round(y * 1e5)}" for x, y in pts)
        for name, colour, mode in lines:
            self.rows.append((name, colour, mode, tunnel, coords))


def main(pbf: str, out: str):
    routes = Routes()
    routes.apply_file(pbf)
    track = Track(routes.lines_of_way)
    track.apply_file(pbf, locations=True)
    rows = sorted(set(track.rows))
    tmp = Path(out + ".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8") as f:
        f.write(f"#blueroute-lines v1 {datetime.date.today().isoformat()} {len(rows)}\n")
        for r in rows:
            f.write("|".join(r) + "\n")
    tmp.replace(out)  # never leave a half-written file where the API serves it
    print(f"{len(rows)} stretches of track written to {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
