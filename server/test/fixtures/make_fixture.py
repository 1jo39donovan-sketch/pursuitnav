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


# Cluster 6: a low bridge (2.0 m) and a weak bridge (3.5 t) on the direct
# routes. A car fits under and over both; a van must go round the low one
# and a fire appliance round the weak one, on the police route too.
# Coordinates can go to -1 here for the approach roads.
grid(6, skip={"row1", "col1"})
way(6, [(1, 0), (1, 1)], "Bridge Street", maxheight="2.0")
way(6, [(1, 1), (1, 2)], "Bridge Street")
way(6, [(0, 1), (1, 1)], "Weak Bridge Road", maxweight="3.5")
way(6, [(1, 1), (2, 1)], "Weak Bridge Road")
# Approach roads, so the bridges are mid-route rather than where it starts.
way(6, [(1, -1), (1, 0)], "West Approach")
way(6, [(-1, 1), (0, 1)], "North Approach")
point("bridge_west", 6, 1, -1)
point("bridge_east", 6, 1, 2)
point("weak_north", 6, -1, 1)
point("weak_south", 6, 2, 1)

# Cluster 7: a main road against a slightly shorter back street, both signed
# 20 mph. The main road is quicker in practice (wider, traffic can pull over,
# bus lanes), which the travel speeds places/practical_speeds.py adds before
# the real map is built say; here they're tagged directly.
way(7, [(1, 0), (1, 1), (1, 2), (1, 3)], "Back Street", maxspeed__practical="13 mph")
way(7, [(1, 0), (0.8, 0)], "Link West")
way(7, [(0.8, 0), (0.8, 1), (0.8, 2), (0.8, 3)], "High Road", highway="primary", maxspeed__practical="20 mph")
way(7, [(0.8, 3), (1, 3)], "Link East")
point("main_west", 7, 1, 0)
point("main_east", 7, 1, 3)
point("high_road_1", 7, 0.8, 1)  # a block of High Road, closed in the live-closure test
point("high_road_2", 7, 0.8, 2)

# House-numbered addresses, away from the street grids (the smoke test picks a
# door-level address from these). Not roads, so routing ignores them.
tagged_nodes = []  # (id, lat, lng, tags)
ADDR_LAT, ADDR_LNG = 51.40, 0.40


def address_node(number, street, dlat, **extra):
    nid_ = next_id["n"]
    next_id["n"] += 1
    tags = {"addr:housenumber": number, "addr:street": street, **{k.replace("__", ":"): v for k, v in extra.items()}}
    tagged_nodes.append((nid_, ADDR_LAT + dlat, ADDR_LNG, tags))
    return nid_


def address_building(number, street, dlat):
    """A small square building tagged with the address."""
    corners = []
    for dy, dx in ((0, 0), (0, 0.0001), (0.0001, 0.0001), (0.0001, 0)):
        nid_ = next_id["n"]
        next_id["n"] += 1
        tagged_nodes.append((nid_, ADDR_LAT + dlat + dy, ADDR_LNG + dx, {}))
        corners.append(nid_)
    wid = next_id["w"]
    next_id["w"] += 1
    ways.append((wid, corners + corners[:1], {"building": "yes", "addr:housenumber": number, "addr:street": street}))
    return wid


address_node("54-56", "Caledonian Road", 0.0000)  # a range: not one door
address_node("53", "Caledonian Road", 0.0005)
address_building("55", "Caledonian Road", 0.0010)
address_node("12A", "Caledonian Road", 0.0015)  # not a plain number
address_node("7", "Other Street", 0.0020)


def main(pbf_path, points_path):
    writer = osmium.SimpleWriter(pbf_path, overwrite=True)
    for node_id, lat, lng in sorted(nodes.values()):
        writer.add_node(osmium.osm.mutable.Node(id=node_id, location=(lng, lat), version=1))
    for node_id, lat, lng, tags in tagged_nodes:
        writer.add_node(osmium.osm.mutable.Node(id=node_id, location=(lng, lat), tags=tags, version=1))
    for way_id, refs, tags in ways:
        writer.add_way(osmium.osm.mutable.Way(id=way_id, nodes=refs, tags=tags, version=1))
    for rel_id, members, tags in relations:
        writer.add_relation(osmium.osm.mutable.Relation(id=rel_id, members=members, tags=tags, version=1))
    writer.close()
    with open(points_path, "w") as f:
        json.dump(points, f, indent=2)


if __name__ == "__main__":
    main(*sys.argv[1:3])
