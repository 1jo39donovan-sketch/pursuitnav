"""Extracts every named road in London from an OpenStreetMap extract, for
the app's offline road search.

The app ships with a road list from OS Open Names, which misses many small
roads (mews, estate roads, named walkways: Mutton Place and Castle Mews in
Camden, for example). OpenStreetMap has them, and is refreshed weekly with
the routing map, so the app downloads this list and adds what it's missing.

Usage: python extract_roads.py <london.osm.pbf> <out.txt.gz>

Output, gzipped UTF-8, one road per line after a header line:
    name|borough index|lat*1e5|lng*1e5
One line per road per borough; a name used for two separate roads in the
same borough (more than ~1 km apart) gets a line each. The point is on the
road, near the middle. Borough indexes match app/src/search/boroughs.ts.
"""

import datetime
import gzip
import sys
from pathlib import Path

import osmium

from extract_places import BOUNDARIES, BoroughFinder, clean

# Ways that are roads (or walkways) an address can be on. Steps, platforms,
# corridors and roads that don't exist yet are left out.
ROAD_TYPES = {
    "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
    "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link",
    "living_street", "service", "pedestrian", "road", "busway", "track",
    "footway", "path", "cycleway", "bridleway",
}

SAME_ROAD_WITHIN_M = 1000


class RoadCollector(osmium.SimpleHandler):
    def __init__(self, boroughs: BoroughFinder):
        super().__init__()
        self.boroughs = boroughs
        # (name, borough) -> list of clusters, each a list of (lat, lng) way midpoints
        self.roads: dict[tuple[str, int], list[list[tuple[float, float]]]] = {}

    def way(self, w):
        if w.tags.get("highway") not in ROAD_TYPES:
            return
        name = clean(w.tags.get("name"))
        if not name:
            return
        try:
            nodes = [(n.lat, n.lon) for n in w.nodes if n.location.valid()]
        except osmium.InvalidLocationError:
            return
        if not nodes:
            return
        lat, lng = nodes[len(nodes) // 2]
        borough = self.boroughs.index_of(lng, lat)
        if borough is None:
            return
        clusters = self.roads.setdefault((name, borough), [])
        for c in clusters:
            if any(_metres(lat, lng, a, b) < SAME_ROAD_WITHIN_M for a, b in c):
                c.append((lat, lng))
                break
        else:
            clusters.append([(lat, lng)])


def _metres(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    return (((lat1 - lat2) * 111_320) ** 2 + ((lng1 - lng2) * 69_400) ** 2) ** 0.5


def representative(points: list[tuple[float, float]]) -> tuple[float, float]:
    """The way midpoint nearest the middle of them all: on the road, central."""
    mlat = sum(p[0] for p in points) / len(points)
    mlng = sum(p[1] for p in points) / len(points)
    return min(points, key=lambda p: _metres(p[0], p[1], mlat, mlng))


def main(pbf: str, out: str):
    collector = RoadCollector(BoroughFinder(BOUNDARIES))
    collector.apply_file(pbf, locations=True, idx="flex_mem")
    rows = []
    for (name, borough), clusters in sorted(collector.roads.items()):
        for c in clusters:
            lat, lng = representative(c)
            rows.append((name, borough, round(lat * 1e5), round(lng * 1e5)))
    tmp = Path(out + ".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8") as f:
        f.write(f"#blueroute-roads v1 {datetime.date.today().isoformat()} {len(rows)}\n")
        for r in rows:
            f.write("|".join(str(x) for x in r) + "\n")
    tmp.replace(out)  # never leave a half-written file where the API serves it
    print(f"{len(rows)} roads written to {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
