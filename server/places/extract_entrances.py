"""Extracts the way into buildings across London from an OpenStreetMap extract:
every entrance node (entrance=main, yes, staircase, home…) with what OSM says
about it, so a crew sent to a block of flats is routed to the door, not the
middle of the building.

Usage: python extract_entrances.py <london.osm.pbf> <out.txt.gz>

Output, gzipped UTF-8, one entrance per line after a header line:
    lat*1e5|lng*1e5|kind|ref|name|housenumber|street|flats
kind is OSM's entrance value (main, yes, staircase, home, service…). Fire
exits, exits only and garages are left out: nobody is sent in through them.
"""

import datetime
import gzip
import sys
from pathlib import Path

import osmium

# Entrances a crew can be sent to. "emergency" is a fire exit (often alarmed,
# no handle outside); "exit" is a way out only; garages and loading bays
# aren't a way to someone's door.
KINDS = {"main", "yes", "staircase", "home", "service", "secondary", "entrance"}
# Greater London with a margin, as the server's REGION_BOUNDS.
BOUNDS = (-0.8, 51.2, 0.6, 51.8)


def clean(s: str | None) -> str:
    return " ".join((s or "").replace("|", "/").split())


def entrance_row(tags, lng: float, lat: float):
    """The line for an entrance node, or None if it isn't one to send a crew to."""
    kind = clean(tags.get("entrance")).lower()
    if kind not in KINDS:
        return None
    if tags.get("access") in ("private", "no") and kind not in ("main", "home", "staircase"):
        return None
    west, south, east, north = BOUNDS
    if not (west <= lng <= east and south <= lat <= north):
        return None
    flats = clean(tags.get("addr:flats") or tags.get("addr:unit"))
    return (
        round(lat * 1e5),
        round(lng * 1e5),
        kind,
        clean(tags.get("ref") or tags.get("addr:door")),
        clean(tags.get("name") or tags.get("description")),
        clean(tags.get("addr:housenumber")),
        clean(tags.get("addr:street")),
        flats,
    )


class EntranceCollector(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.rows = []

    def node(self, n):
        if "entrance" in n.tags:
            row = entrance_row(n.tags, n.location.lon, n.location.lat)
            if row:
                self.rows.append(row)


def main(pbf: str, out: str):
    collector = EntranceCollector()
    collector.apply_file(pbf)
    rows = sorted(set(collector.rows))
    tmp = Path(out + ".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8") as f:
        f.write(f"#blueroute-entrances v1 {datetime.date.today().isoformat()} {len(rows)}\n")
        for r in rows:
            f.write("|".join(str(x) for x in r) + "\n")
    tmp.replace(out)  # never leave a half-written file where the API serves it
    print(f"{len(rows)} entrances written to {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
