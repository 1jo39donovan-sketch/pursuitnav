import osmium

from practical_speeds import limit_mph, main, practical_mph


def test_reads_signed_limits():
    assert limit_mph("20 mph") == 20
    assert limit_mph("30mph") == 30
    assert round(limit_mph("48")) == 30  # plain numbers are km/h
    assert limit_mph("signals") is None
    assert limit_mph(None) is None


def test_main_roads_are_quicker_than_side_streets_at_the_same_limit():
    main_road = practical_mph({"highway": "primary", "maxspeed": "20 mph"})
    side_street = practical_mph({"highway": "residential", "maxspeed": "20 mph"})
    assert main_road > side_street


def test_a_bus_lane_helps():
    plain = practical_mph({"highway": "primary", "maxspeed": "30 mph"})
    with_lane = practical_mph({"highway": "primary", "maxspeed": "30 mph", "busway:left": "lane"})
    assert with_lane > plain


def test_never_above_the_limit():
    assert practical_mph({"highway": "motorway", "maxspeed": "70 mph", "busway": "lane"}) <= 70


def test_leaves_surveyed_or_unknown_roads_alone():
    assert practical_mph({"highway": "primary", "maxspeed": "20 mph", "maxspeed:practical": "15 mph"}) is None
    assert practical_mph({"highway": "primary"}) is None
    assert practical_mph({"highway": "footway", "maxspeed": "20 mph"}) is None


def _write(path, ways):
    w = osmium.SimpleWriter(str(path), overwrite=True)
    w.add_node(osmium.osm.mutable.Node(id=1, location=(0.0, 51.5), version=1))
    w.add_node(osmium.osm.mutable.Node(id=2, location=(0.001, 51.5), version=1))
    for wid, tags in ways:
        w.add_way(osmium.osm.mutable.Way(id=wid, nodes=[1, 2], tags=tags, version=1))
    w.close()


def _read(path):
    out = {}
    for w in osmium.FileProcessor(str(path)).with_filter(osmium.filter.EntityFilter(osmium.osm.WAY)):
        out[w.id] = {t.k: t.v for t in w.tags}
    return out


def test_writes_the_tag_and_learned_speeds_win(tmp_path):
    src, dst, learned = tmp_path / "in.osm.pbf", tmp_path / "out.osm.pbf", tmp_path / "learned.csv"
    _write(src, [(10, {"highway": "residential", "maxspeed": "20 mph"}), (11, {"highway": "primary", "maxspeed": "20 mph"})])
    learned.write_text("way_id,mph\n11,24\n")
    main(str(src), str(dst), str(learned))
    ways = _read(dst)
    assert ways[10]["maxspeed:practical"] == "13 mph"
    assert ways[10]["maxspeed"] == "20 mph"  # the signed limit is untouched
    assert ways[11]["maxspeed:practical"] == "24 mph"
