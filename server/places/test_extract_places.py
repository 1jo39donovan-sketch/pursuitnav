"""Runs the extractor on a tiny synthetic OSM file. pytest server/places"""

import gzip

import osmium
import pytest

import extract_places

# Around Highbury Corner, Islington.
LAT, LNG = 51.5466, -0.1035
D = 0.0004  # ~40 m


def write_fixture(path):
    w = osmium.SimpleWriter(str(path), overwrite=True)
    nid = iter(range(1, 1000))

    def node(lat, lng, **tags):
        i = next(nid)
        w.add_node(osmium.osm.mutable.Node(id=i, location=(lng, lat), version=1, tags=tags))
        return i

    def closed_way(wid, lat, lng, **tags):
        ids = [node(lat, lng), node(lat + D, lng), node(lat + D, lng + D), node(lat, lng + D)]
        w.add_way(osmium.osm.mutable.Way(id=wid, nodes=ids + ids[:1], version=1, tags=tags))
        return wid

    node(LAT, LNG, amenity="cafe", name="Coffee Corner", **{"addr:housenumber": "12", "addr:street": "Holloway Road", "addr:postcode": "N7 8LA"})
    node(LAT, LNG + D, shop="convenience", name="Nag's Head Food & Wine", brand="Costcutter")
    node(LAT, LNG + 2 * D, shop="convenience")  # no name: left out
    node(LAT, LNG + 3 * D, amenity="bench", name="Memorial bench")  # clutter: left out
    node(52.2, -0.5, amenity="cafe", name="Somewhere Else Cafe")  # outside London
    node(LAT, LNG + 4 * D, shop="tattoo", name="Ink|Well")
    # Two branches of a chain ~1 km apart: both stay.
    node(LAT - 10 * D, LNG, amenity="cafe", name="Costa")
    node(LAT - 32 * D, LNG, amenity="cafe", name="Costa")  # unlisted shop type, pipe in name
    closed_way(1, LAT + 2 * D, LNG, leisure="park", name="Highbury Fields")
    closed_way(2, LAT + 4 * D, LNG, building="apartments", name="Smith House")
    closed_way(3, LAT + 6 * D, LNG, building="yes", name="Unnamed-type Building")  # building=yes: left out
    # A station drawn twice: node and area. Keep one.
    node(LAT - 2 * D, LNG, railway="station", name="Highbury & Islington")
    closed_way(4, LAT - 2 * D, LNG, public_transport="station", name="Highbury & Islington")
    # School as a multipolygon relation.
    ids = [node(LAT + 8 * D, LNG), node(LAT + 9 * D, LNG), node(LAT + 9 * D, LNG + D), node(LAT + 8 * D, LNG + D)]
    w.add_way(osmium.osm.mutable.Way(id=5, nodes=ids + ids[:1], version=1, tags={}))
    w.add_relation(osmium.osm.mutable.Relation(
        id=1, members=[("w", 5, "outer")], version=1,
        tags={"type": "multipolygon", "amenity": "school", "name": "Highbury Grove School"},
    ))
    w.close()


@pytest.fixture(scope="module")
def rows(tmp_path_factory):
    d = tmp_path_factory.mktemp("osm")
    write_fixture(d / "fixture.osm.pbf")
    out = d / "places.txt.gz"
    extract_places.main(str(d / "fixture.osm.pbf"), str(out))
    with gzip.open(out, "rt", encoding="utf-8") as f:
        lines = f.read().splitlines()
    assert lines[0].startswith("#blueroute-places v1 ")
    return [l.split("|") for l in lines[1:]]


@pytest.fixture(scope="module")
def places(rows):
    return {r[0]: r for r in rows}


def test_named_places_with_types_and_groups(places):
    assert places["Coffee Corner"][2:4] == ["Coffee shop", "food"]
    assert places["Nag's Head Food & Wine"][2:4] == ["Corner shop", "shop"]
    assert places["Highbury Fields"][2:4] == ["Park", "leisure"]
    assert places["Smith House"][2:4] == ["Block of flats", "housing"]
    assert places["Highbury Grove School"][2:4] == ["School", "education"]


def test_borough_and_point(places):
    row = places["Coffee Corner"]
    assert extract_places.BOROUGHS[int(row[4])] == "Islington"
    assert int(row[5]) == round(LAT * 1e5) and int(row[6]) == round(LNG * 1e5)


def test_area_point_is_inside_the_area(places):
    lat, lng = int(places["Highbury Fields"][5]) / 1e5, int(places["Highbury Fields"][6]) / 1e5
    assert LAT + 2 * D <= lat <= LAT + 3 * D and LNG <= lng <= LNG + D


def test_address_and_other_names(places):
    assert places["Coffee Corner"][7] == "12 Holloway Road, N7 8LA"
    assert places["Nag's Head Food & Wine"][1] == "Costcutter"


def test_unlisted_types_are_named_from_the_tag(places):
    assert places["Ink/Well"][2:4] == ["Tattoo", "shop"]


def test_leaves_out_clutter_unnamed_and_outside_london(places):
    for name in ("Memorial bench", "Somewhere Else Cafe", "Unnamed-type Building"):
        assert name not in places
    assert "" not in places


def test_station_drawn_twice_appears_once(rows):
    assert sum(1 for r in rows if r[0] == "Highbury & Islington") == 1


def test_separate_branches_both_stay(rows):
    assert sum(1 for r in rows if r[0] == "Costa") == 2
