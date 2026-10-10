"""Extracts every named place in London from an OpenStreetMap extract.

Shops, cafés, schools, parks, stations, named blocks and estates, areas and
so on (see categories.py), each with its borough, a point to route to and an
address where OSM has one. The app downloads the result for offline search.

Usage: python extract_places.py <london.osm.pbf> <out.txt.gz>

Output, gzipped UTF-8, one place per line after a header line:
    name|other names|type|group|borough index|lat*1e5|lng*1e5|address
"other names" are ;-separated (alt_name, old_name, brand). The borough index
follows BOROUGHS below, which matches app/src/search/boroughs.ts.
"""

import datetime
import gzip
import json
import sys
from pathlib import Path

import osmium
from shapely import STRtree
from shapely.geometry import MultiPolygon, Point, Polygon, shape
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


class PlaceCollector(osmium.SimpleHandler):
    def __init__(self, boroughs: BoroughFinder):
        super().__init__()
        self.boroughs = boroughs
        self.places = []

    def add(self, tags, lng: float, lat: float):
        name = clean(tags.get("name"))
        if not name:
            return
        kind = classify(tags)
        if not kind:
            return
        borough = self.boroughs.index_of(lng, lat)
        if borough is None:
            return
        self.places.append(
            (name, other_names(tags, name), kind[0], kind[1], borough, round(lat * 1e5), round(lng * 1e5), address_of(tags))
        )

    def node(self, n):
        if "name" in n.tags:
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
    places = dedupe(sorted(collector.places))
    tmp = Path(out + ".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8") as f:
        f.write(f"#blueroute-places v1 {datetime.date.today().isoformat()} {len(places)}\n")
        for p in places:
            f.write("|".join(str(x) for x in p) + "\n")
    tmp.replace(out)  # never leave a half-written file where the API serves it
    print(f"{len(places)} places written to {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
