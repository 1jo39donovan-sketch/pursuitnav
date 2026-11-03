"""Extracts every named place in London from an OpenStreetMap extract.

Shops, cafés, schools, parks, stations, named blocks and estates, areas and
so on (see categories.py), each with its borough, a point to route to and an
address where OSM has one. The app downloads the result for offline search.

Usage: python extract_places.py <london.osm.pbf> <out.txt.gz>

Output, gzipped UTF-8, one place per line after a header line:
    name|other names|type|group|borough index|lat*1e5|lng*1e5|address
"other names" are ;-separated (alt_name, old_name, brand). The borough index
follows BOROUGHS below, which matches app/src/search/boroughs.ts. A place with
no addr:street gets the name of the road it fronts (the nearest named road
within 50 m), so "Costa Holloway Road" finds the Costa on Holloway Road.
"""

import datetime
import gzip
import json
import re
import sys
from pathlib import Path

import osmium
from shapely import STRtree
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, shape
from shapely.prepared import prep

from categories import classify

BOROUGHS = [
    "Barking and Dagenham", "Barnet", "Bexley", "Brent", "Bromley", "Camden", "City of London",
    "Croydon", "Ealing", "Enfield", "Greenwich", "Hackney", "Hammersmith and Fulham", "Haringey",
    "Harrow", "Havering", "Hillingdon", "Hounslow", "Islington", "Kensington and Chelsea",
    "Kingston upon Thames", "Lambeth", "Lewisham", "Merton", "Newham", "Redbridge",
    "Richmond upon Thames", "Southwark", "Sutton", "Tower Hamlets", "Waltham Forest",
    "Wandsworth", "Westminster",
]

BOUNDARIES = Path(__file__).with_name("london-boroughs.geojson")


class BoroughFinder:
    """Which London borough a point is in (None outside London)."""

    def __init__(self, geojson_path: Path):
        features = json.loads(geojson_path.read_text())["features"]
        self.names = []
        geoms = []
        for f in features:
            name = f["properties"]["name"]
            if name not in BOROUGHS:
                raise ValueError(f"Unexpected borough in boundaries: {name}")
            self.names.append(name)
            geoms.append(shape(f["geometry"]))
        self.prepared = [prep(g) for g in geoms]
        self.tree = STRtree(geoms)

    def index_of(self, lng: float, lat: float) -> int | None:
        p = Point(lng, lat)
        for i in self.tree.query(p):
            if self.prepared[i].contains(p):
                return BOROUGHS.index(self.names[i])
        return None


def clean(s: str | None) -> str:
    return " ".join((s or "").replace("|", "/").split())


def address_of(tags) -> str:
    street = clean(tags.get("addr:street"))
    number = clean(tags.get("addr:housenumber"))
    postcode = clean(tags.get("addr:postcode"))
    first = " ".join(p for p in (number, street) if p)
    return ", ".join(p for p in (first, postcode) if p)


def other_names(tags, name: str) -> str:
    seen = {name.lower()}
    out = []
    for key in ("alt_name", "old_name", "short_name", "brand", "official_name"):
        for v in clean(tags.get(key)).split(";"):
            v = v.strip()
            if v and v.lower() not in seen:
                seen.add(v.lower())
                out.append(v)
    return ";".join(out)


# Roads a shop or other place fronts onto (not footpaths or service roads).
FRONTING_ROADS = {
    "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
    "living_street", "pedestrian", "road",
}
FRONTS_WITHIN_M = 50
# Metres per degree in London (51.5° N): good to a few metres over a few km.
M_PER_DEG_LAT = 111_320
M_PER_DEG_LNG = 69_300


def metres(lng: float, lat: float) -> tuple[float, float]:
    return lng * M_PER_DEG_LNG, lat * M_PER_DEG_LAT


class PlaceCollector(osmium.SimpleHandler):
    def __init__(self, boroughs: BoroughFinder):
        super().__init__()
        self.boroughs = boroughs
        self.places = []
        # Named roads as lines in metres, for the street a place is on.
        self.road_lines: list[LineString] = []
        self.road_names: list[str] = []

    def way(self, w):
        if w.tags.get("highway") not in FRONTING_ROADS:
            return
        name = clean(w.tags.get("name"))
        if not name:
            return
        try:
            pts = [metres(n.lon, n.lat) for n in w.nodes if n.location.valid()]
        except osmium.InvalidLocationError:
            return
        if len(pts) >= 2:
            self.road_lines.append(LineString(pts))
            self.road_names.append(name)

    def add(self, tags, lng: float, lat: float):
        kind = classify(tags)
        if not kind:
            return
        # A&E entrances are rarely named in OSM, but crews need them most.
        name = clean(tags.get("name")) or (kind[0] if kind[0] == "A&E entrance" else "")
        if not name:
            return
        borough = self.boroughs.index_of(lng, lat)
        if borough is None:
            return
        self.places.append(
            (name, other_names(tags, name), kind[0], kind[1], borough, round(lat * 1e5), round(lng * 1e5), address_of(tags))
        )

    def node(self, n):
        if "name" in n.tags or n.tags.get("emergency") == "emergency_ward_entrance":
            self.add(n.tags, n.location.lon, n.location.lat)

    def area(self, a):
        if "name" not in a.tags:
            return
        try:
            polys = []
            for outer in a.outer_rings():
                shell = [(nd.lon, nd.lat) for nd in outer]
                holes = [[(nd.lon, nd.lat) for nd in inner] for inner in a.inner_rings(outer)]
                if len(shell) >= 4:
                    polys.append(Polygon(shell, holes))
            if not polys:
                return
            geom = polys[0] if len(polys) == 1 else MultiPolygon(polys)
            # A point guaranteed to be inside, unlike a centroid (think L-shaped blocks).
            p = geom.representative_point()
        except Exception:
            return  # broken geometry in OSM; skip rather than guess
        self.add(a.tags, p.x, p.y)


POSTCODE = re.compile(r"^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$", re.I)


def with_streets(places, road_lines: list[LineString], road_names: list[str]):
    """Each place without a street in its address gets the road it fronts:
    the nearest named road within 50 m. Kept as it is when there's none."""
    if not road_lines:
        return places
    tree = STRtree(road_lines)
    out = []
    for p in places:
        address = p[7]
        first = address.split(",")[0].strip()
        if first and not POSTCODE.match(first):
            out.append(p)
            continue
        here = Point(metres(p[6] / 1e5, p[5] / 1e5))
        i = tree.nearest(here)
        if i is None or road_lines[i].distance(here) > FRONTS_WITHIN_M:
            out.append(p)
            continue
        street = road_names[i]
        out.append(p[:7] + (", ".join(x for x in (street, address) if x),))
    return out


DUPLICATE_WITHIN_M = 300


def dedupe(places):
    """Same name and type within 300 m (a station's node and its area): keep one.
    Far enough apart and it's another branch, which stays."""
    kept: dict[tuple, list[tuple[int, int]]] = {}
    out = []
    for p in places:
        key = (p[0].lower(), p[2], p[4])
        lat, lng = p[5], p[6]
        # 1e-5 degrees is ~1.1 m north-south and ~0.7 m east-west in London.
        near = any(((lat - a) * 1.11) ** 2 + ((lng - b) * 0.69) ** 2 < DUPLICATE_WITHIN_M**2 for a, b in kept.get(key, []))
        if near:
            continue
        kept.setdefault(key, []).append((lat, lng))
        out.append(p)
    return out


def main(pbf: str, out: str):
    collector = PlaceCollector(BoroughFinder(BOUNDARIES))
    collector.apply_file(pbf, locations=True, idx="flex_mem")
    places = with_streets(dedupe(sorted(collector.places)), collector.road_lines, collector.road_names)
    tmp = Path(out + ".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8") as f:
        f.write(f"#blueroute-places v1 {datetime.date.today().isoformat()} {len(places)}\n")
        for p in places:
            f.write("|".join(str(x) for x in p) + "\n")
    tmp.replace(out)  # never leave a half-written file where the API serves it
    print(f"{len(places)} places written to {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
