import gzip

import osmium
import pytest

import extract_lines
from extract_lines import line_of


def test_tube_line_named_and_coloured_from_osm():
    tags = {"type": "route", "route": "subway", "name": "Victoria line: Brixton → Walthamstow Central", "colour": "#0098D4"}
    assert line_of(tags) == ("Victoria line", "#0098d4", "subway")


def test_missing_or_bad_colour_falls_back_by_mode():
    assert line_of({"type": "route", "route": "light_rail", "name": "DLR"})[1] == "#00a3a6"
    assert line_of({"type": "route", "route": "tram", "name": "Tram", "colour": "green"})[1] == "#5ba829"


def test_only_tfl_trains():
    assert line_of({"type": "route", "route": "train", "name": "Mildmay line", "network": "London Overground"})
    assert line_of({"type": "route", "route": "train", "name": "Elizabeth line: Reading → Abbey Wood"})
    assert line_of({"type": "route", "route": "train", "name": "Southeastern: London Bridge → Dartford"}) is None
    assert line_of({"type": "route", "route": "bus", "name": "73"}) is None


@pytest.fixture()
def lines_file(tmp_path):
    pbf = tmp_path / "t.osm.pbf"
    w = osmium.SimpleWriter(str(pbf))
    w.add_node(osmium.osm.mutable.Node(id=1, location=(-0.12, 51.55), version=1))
    w.add_node(osmium.osm.mutable.Node(id=2, location=(-0.11, 51.56), version=1))
    w.add_node(osmium.osm.mutable.Node(id=3, location=(-0.10, 51.57), version=1))
    w.add_way(osmium.osm.mutable.Way(id=10, nodes=[1, 2], version=1, tags={"railway": "subway", "tunnel": "yes"}))
    w.add_way(osmium.osm.mutable.Way(id=11, nodes=[2, 3], version=1, tags={"railway": "subway"}))
    w.add_relation(osmium.osm.mutable.Relation(
        id=100, version=1, members=[("w", 10, ""), ("w", 11, ""), ("n", 2, "stop")],
        tags={"type": "route", "route": "subway", "name": "Victoria line: north", "colour": "#0098D4"},
    ))
    w.add_relation(osmium.osm.mutable.Relation(
        id=101, version=1, members=[("w", 10, "")],
        tags={"type": "route", "route": "subway", "name": "Victoria line: south", "colour": "#0098D4"},
    ))
    w.close()
    out = tmp_path / "lines.txt.gz"
    extract_lines.main(str(pbf), str(out))
    return gzip.open(out, "rt", encoding="utf-8").read().splitlines()


def test_writes_each_stretch_once_per_line(lines_file):
    assert lines_file[0].startswith("#blueroute-lines v1 ")
    rows = sorted(lines_file[1:])
    assert rows == [
        "Victoria line|#0098d4|subway|0|-11000,5156000 -10000,5157000",
        "Victoria line|#0098d4|subway|1|-12000,5155000 -11000,5156000",
    ]
