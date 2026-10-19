"""Adds realistic travel speeds to an OpenStreetMap extract before the routing
tiles are built.

Valhalla times a road at its speed limit, so a 20 mph side street looks as
quick as a 20 mph main road. On a blue-light run it isn't: main roads are
wider, traffic can pull over, and bus lanes give a way past queues, while side
streets have parked cars, humps and tight junctions. This writes a
maxspeed:practical tag on each road, which Valhalla uses as the travel speed
while the signed limit (maxspeed) still shows in pursuit mode.

The speeds are a starting model, a share of the signed limit by type of road.
Learned speeds (from officers' opt-in, anonymised drives) override it road by
road, from a CSV of `way_id,mph`.

Usage: python practical_speeds.py <in.osm.pbf> <out.osm.pbf> [learned.csv]
"""

import csv
import re
import sys

import osmium

# Share of the signed limit a road is actually driven at, by OSM highway type.
SHARE_OF_LIMIT = {
    "motorway": 1.0,
    "motorway_link": 0.9,
    "trunk": 0.95,
    "trunk_link": 0.85,
    "primary": 0.9,
    "primary_link": 0.8,
    "secondary": 0.85,
    "secondary_link": 0.75,
    "tertiary": 0.8,
    "tertiary_link": 0.7,
    "unclassified": 0.7,
    "residential": 0.65,
    "living_street": 0.5,
    "service": 0.5,
}
# A bus lane is a way past queues on blue lights.
BUS_LANE_BONUS = 0.05
NEVER_ABOVE = 1.0  # never faster than the signed limit

MPH = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*mph\s*$")
KPH = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*(?:km/h|kmh|kph)?\s*$")


def limit_mph(maxspeed):
    """The signed limit in mph, or None for anything that isn't a plain number."""
    if not maxspeed:
        return None
    m = MPH.match(maxspeed)
    if m:
        return float(m.group(1))
    m = KPH.match(maxspeed)
    if m:
        return float(m.group(1)) / 1.609344
    return None


def has_bus_lane(tags):
    return (
        tags.get("busway") in ("lane", "opposite_lane")
        or tags.get("busway:left") in ("lane", "opposite_lane")
        or tags.get("busway:right") in ("lane", "opposite_lane")
        or tags.get("busway:both") == "lane"
        or "designated" in (tags.get("bus:lanes") or "")
        or "designated" in (tags.get("psv:lanes") or "")
        or "designated" in (tags.get("bus:lanes:forward") or "")
        or "designated" in (tags.get("bus:lanes:backward") or "")
    )


def practical_mph(tags):
    """The modelled travel speed for a way's tags, or None to leave it alone."""
    if "maxspeed:practical" in tags:
        return None  # someone has surveyed it: keep theirs
    share = SHARE_OF_LIMIT.get(tags.get("highway"))
    limit = limit_mph(tags.get("maxspeed"))
    if share is None or limit is None:
        return None
    if has_bus_lane(tags):
        share += BUS_LANE_BONUS
    return round(limit * min(share, NEVER_ABOVE))


def load_learned(path):
    learned = {}
    if not path:
        return learned
    with open(path, newline="") as f:
        for row in csv.reader(f):
            if len(row) >= 2 and row[0].strip().isdigit():
                learned[int(row[0])] = float(row[1])
    return learned


class Writer(osmium.SimpleHandler):
    def __init__(self, writer, learned):
        super().__init__()
        self.writer = writer
        self.learned = learned
        self.changed = 0

    def node(self, n):
        self.writer.add_node(n)

    def relation(self, r):
        self.writer.add_relation(r)

    def way(self, w):
        tags = {t.k: t.v for t in w.tags}
        mph = self.learned.get(w.id)
        if mph is None:
            mph = practical_mph(tags)
        if mph is None:
            self.writer.add_way(w)
            return
        tags["maxspeed:practical"] = f"{round(mph)} mph"
        self.writer.add_way(w.replace(tags=tags))
        self.changed += 1


def main(src, dst, learned_path=None):
    writer = osmium.SimpleWriter(dst, overwrite=True)
    handler = Writer(writer, load_learned(learned_path))
    handler.apply_file(src)
    writer.close()
    print(f"practical speeds on {handler.changed} roads")


if __name__ == "__main__":
    main(*sys.argv[1:4])
