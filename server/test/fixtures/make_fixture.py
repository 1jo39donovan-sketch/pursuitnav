"""Builds a tiny synthetic street network for routing tests.

Each scenario is its own 3x3 grid of streets, ~200 m apart, placed well away
from the others so routes can't wander between them. Rows run west to east
(row 0 is the northern row), columns run north to south.

Usage: python make_fixture.py <out.osm.pbf> <out-points.json>
"""

import json
import sys

import osmium

LAT0, LNG0 = 51.50, -0.10
DLAT, DLNG = -0.002, 0.003  # one block south, one block east (~220 m, ~210 m)
CLUSTER_GAP = 0.05  # degrees of longitude between scenarios

TAGS = {"highway": "residential", "maxspeed": "20 mph"}

nodes = {}  # (cluster, r, c) -> (id, lat, lng)
ways = []  # (id, [node ids], tags)
relations = []  # (id, members, tags)
points = {}  # name -> {lat, lng} for the tests
next_id = {"n": 1, "w": 1, "r": 1}


def nid(cluster, r, c):
    key = (cluster, r, c)
    if key not in nodes:
        lat = LAT0 + r * DLAT
        lng = LNG0 + cluster * CLUSTER_GAP + c * DLNG
        nodes[key] = (next_id["n"], lat, lng)
        next_id["n"] += 1
    return nodes[key][0]


def way(cluster, cells, name, **extra):
    wid = next_id["w"]
    next_id["w"] += 1
    tags = {**TAGS, "name": name, **{k.replace("__", ":"): v for k, v in extra.items()}}
    tags = {k: v for k, v in tags.items() if v is not None}  # maxspeed=None: no limit signed
    ways.append((wid, [nid(cluster, r, c) for r, c in cells], tags))
    return wid


def point(name, cluster, r, c, dlat=0.0, dlng=0.0):
    nid(cluster, r, c)
    _, lat, lng = nodes[(cluster, r, c)]
    points[name] = {"lat": lat + dlat, "lng": lng + dlng}


def grid(cluster, skip=()):
    """Plain two-way grid; `skip` names streets a scenario defines itself."""
    for r in range(3):
        if f"row{r}" not in skip:
            way(cluster, [(r, 0), (r, 1), (r, 2)], f"Row {r} Street")
    for c in range(3):
        if f"col{c}" not in skip:
            way(cluster, [(0, c), (1, c), (2, c)], f"Column {c} Road")


# Cluster 0: one-way eastbound street. Heading west along it is the shortest
# path, so any route that ignored the one-way would take it.
grid(0, skip={"row0"})
way(0, [(0, 0), (0, 1), (0, 2)], "Oneway Street", oneway="yes")
point("oneway_east_end", 0, 0, 2)
point("oneway_west_end", 0, 0, 0)

# Cluster 1: one-way eastbound for cars with a westbound contraflow bus lane.
# Buses may go west along it; the police route must not.
grid(1, skip={"row0"})
way(1, [(0, 0), (0, 1), (0, 2)], "Contraflow Street",
    oneway="yes", oneway__bus="no", oneway__psv="no", busway__left="opposite_lane")
point("contraflow_east_end", 1, 0, 2)
point("contraflow_west_end", 1, 0, 0)

# Cluster 2: the middle row is buses only (a bus gate). Cars detour round it.
grid(2, skip={"row1"})
way(2, [(1, 0), (1, 1), (1, 2)], "Gate Street", motor_vehicle="no", bus="yes", psv="yes")
point("gate_west_end", 2, 1, 0)
point("gate_east_end", 2, 1, 2)

# Cluster 3: no right turn from Turn Street (eastbound) into Column 1 Road
# (southbound). Some streets are left out so the legal detour is long.
way(3, [(0, 0), (0, 1), (0, 2)], "Row 0 Street")
turn_from = way(3, [(1, 0), (1, 1)], "Turn Street")
way(3, [(1, 1), (1, 2)], "Turn Street")
way(3, [(0, 1), (1, 1)], "Column 1 Road")
turn_to = way(3, [(1, 1), (2, 1)], "Column 1 Road")
way(3, [(0, 2), (1, 2), (2, 2)], "Column 2 Road")
way(3, [(2, 1), (2, 2)], "Row 2 Street")
relations.append((
    next_id["r"],
    [("w", turn_from, "from"), ("n", nid(3, 1, 1), "via"), ("w", turn_to, "to")],
    {"type": "restriction", "restriction": "no_right_turn"},
))
point("turn_start", 3, 1, 0)
point("turn_end", 3, 2, 1)

# Cluster 4: plain grid with no restrictions at all.
grid(4)
point("plain_start", 4, 0, 0)
point("plain_end", 4, 2, 2)


# Cluster 5: for pursuit mode. Unsigned Road runs east with no speed limit
# tagged, split into two ways at column 1 (not a junction), and is crossed
# by Cross Street (30 mph) at column 2.
way(5, [(1, 0), (1, 1)], "Unsigned Road", maxspeed=None, surface="asphalt")
way(5, [(1, 1), (1, 2), (1, 3)], "Unsigned Road", maxspeed=None)
way(5, [(0, 2), (1, 2), (2, 2)], "Cross Street", maxspeed="30 mph")
point("unsigned_west", 5, 1, 0)
point("unsigned_near_split", 5, 1, 0, dlng=0.0025)  # just before column 1
point("cross_south", 5, 2, 2)


def main(pbf_path, points_path):
    writer = osmium.SimpleWriter(pbf_path, overwrite=True)
    for node_id, lat, lng in sorted(nodes.values()):
        writer.add_node(osmium.osm.mutable.Node(id=node_id, location=(lng, lat), version=1))
    for way_id, refs, tags in ways:
        writer.add_way(osmium.osm.mutable.Way(id=way_id, nodes=refs, tags=tags, version=1))
    for rel_id, members, tags in relations:
        writer.add_relation(osmium.osm.mutable.Relation(id=rel_id, members=members, tags=tags, version=1))
    writer.close()
    with open(points_path, "w") as f:
        json.dump(points, f, indent=2)


if __name__ == "__main__":
    main(*sys.argv[1:3])
