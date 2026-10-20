"""Runs the road extractor on a tiny synthetic OSM file. pytest server/places"""

import gzip

import osmium
import pytest

import extract_roads

# Around Harmood Street, Camden (NW1).
LAT, LNG = 51.5444, -0.1473
D = 0.0004  # ~40 m


def write_fixture(path):
    w = osmium.SimpleWriter(str(path), overwrite=True)
    nid = iter(range(1, 1000))
    wid = iter(range(1, 1000))

    def way(points, **tags):
        ids = []
        for lat, lng in points:
            i = next(nid)
            w.add_node(osmium.osm.mutable.Node(id=i, location=(lng, lat), version=1))
            ids.append(i)
        w.add_way(osmium.osm.mutable.Way(id=next(wid), nodes=ids, version=1, tags=tags))

    way([(LAT, LNG), (LAT + D, LNG + D)], highway="service", name="Mutton Place")
    way([(LAT, LNG + 5 * D), (LAT + 3 * D, LNG + 5 * D)], highway="residential", name="Castle Mews")
    # One road drawn as two ways: one line.
    way([(LAT - 5 * D, LNG), (LAT - 5 * D, LNG + 3 * D)], highway="residential", name="Harmood Street")
    way([(LAT - 5 * D, LNG + 3 * D), (LAT - 5 * D, LNG + 6 * D)], highway="residential", name="Harmood Street")
    # The same name ~4 km away in the same borough: another road, another line.
    way([(LAT + 0.036, LNG), (LAT + 0.036, LNG + D)], highway="residential", name="Harmood Street")
    way([(LAT, LNG - 5 * D), (LAT, LNG - 4 * D)], highway="steps", name="Some Steps")  # left out
    way([(LAT, LNG - 3 * D), (LAT, LNG - 2 * D)], highway="residential")  # no name: left out
    way([(52.2, -0.5), (52.2, -0.49)], highway="residential", name="Far Away Road")  # outside London
    w.close()


@pytest.fixture(scope="module")
def rows(tmp_path_factory):
    d = tmp_path_factory.mktemp("osm")
    write_fixture(d / "fixture.osm.pbf")
    out = d / "roads.txt.gz"
    extract_roads.main(str(d / "fixture.osm.pbf"), str(out))
    with gzip.open(out, "rt", encoding="utf-8") as f:
        lines = f.read().splitlines()
    assert lines[0].startswith("#blueroute-roads v1 ")
    return [l.split("|") for l in lines[1:]]


def test_small_roads_are_in(rows):
    names = [r[0] for r in rows]
    assert "Mutton Place" in names
    assert "Castle Mews" in names


def test_borough_and_point(rows):
    mutton = next(r for r in rows if r[0] == "Mutton Place")
    assert mutton[1] == "5"  # Camden
    assert abs(int(mutton[2]) / 1e5 - LAT) < 0.001


def test_one_line_per_road_but_separate_roads_kept(rows):
    assert [r[0] for r in rows].count("Harmood Street") == 2


def test_leaves_out_steps_unnamed_and_outside_london(rows):
    names = [r[0] for r in rows]
    assert "Some Steps" not in names
    assert "Far Away Road" not in names
    assert len(rows) == 4
