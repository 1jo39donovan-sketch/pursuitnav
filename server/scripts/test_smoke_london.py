"""The smoke test's own checks, on the synthetic test network. pytest server/scripts"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "test" / "fixtures"))
import make_fixture  # noqa: E402

import smoke_london  # noqa: E402


@pytest.fixture(scope="module")
def network(tmp_path_factory):
    d = tmp_path_factory.mktemp("net")
    make_fixture.main(str(d / "net.osm.pbf"), str(d / "points.json"))
    first = smoke_london.FirstPass()
    first.apply_file(str(d / "net.osm.pbf"), locations=True, idx="flex_mem")
    return first


def way_named(first, name):
    return next(i for i, v in first.oneways.items() if v[2] == name)


def route_along(first, name, backwards):
    """A route straight along the named one-way street, with the flow or against it."""
    coords = first.oneways[way_named(first, name)][1]
    shape = [list(p) for p in (coords[::-1] if backwards else coords)]
    return {"shape": shape, "ways": [{"wayId": way_named(first, name), "beginShapeIndex": 0, "endShapeIndex": len(shape) - 1}]}


def test_finds_one_way_streets_and_the_bus_gate(network):
    assert {v[2] for v in network.oneways.values()} == {"Oneway Street", "Contraflow Street"}
    assert network.oneways[way_named(network, "Contraflow Street")][3]  # contraflow bus lane
    assert [g[1] for g in network.gates] == ["Gate Street"]


def test_catches_a_wrong_way_drive(network):
    for name in ("Oneway Street", "Contraflow Street"):
        assert smoke_london.wrong_way(route_along(network, name, backwards=True), network.oneways)
        assert not smoke_london.wrong_way(route_along(network, name, backwards=False), network.oneways)


def test_ignores_two_way_streets(network):
    route = {"shape": [[-0.1, 51.5], [-0.097, 51.5]], "ways": [{"wayId": 999999, "beginShapeIndex": 0, "endShapeIndex": 1}]}
    assert smoke_london.wrong_way(route, network.oneways) == []


def test_one_way_tags():
    assert smoke_london.oneway_sign({"highway": "residential", "oneway": "yes"}) == 1
    assert smoke_london.oneway_sign({"highway": "residential", "oneway": "-1"}) == -1
    assert smoke_london.oneway_sign({"highway": "primary", "junction": "roundabout"}) == 1
    assert smoke_london.oneway_sign({"highway": "residential"}) == 0
    assert smoke_london.oneway_sign({"highway": "footway", "oneway": "yes"}) == 0


def test_bus_gates_are_all_day_only():
    gate = {"highway": "residential", "motor_vehicle": "no", "bus": "yes"}
    assert smoke_london.is_bus_gate(gate)
    assert smoke_london.is_bus_gate({"highway": "busway"})
    assert not smoke_london.is_bus_gate({**gate, "motor_vehicle:conditional": "yes @ (19:00-07:00)"})
    assert not smoke_london.is_bus_gate({"highway": "residential", "motor_vehicle": "no"})


def test_address_match_is_the_door_asked_for():
    q = "54 Caledonian Road"
    assert smoke_london.is_address(q, "54, CALEDONIAN ROAD, LONDON, N1 9DP")
    assert smoke_london.is_address(q, "54 CALEDONIAN ROAD, LONDON, N1 9DP")
    assert smoke_london.is_address(q, "SOME HOUSE, 54, CALEDONIAN ROAD, LONDON, N1 9DP")
    assert not smoke_london.is_address(q, "154, CALEDONIAN ROAD, LONDON, N1 9RD")
    assert not smoke_london.is_address(q, "FLAT 54, 2, CALEDONIAN ROAD, LONDON, N1 9DT")
    assert not smoke_london.is_address(q, "54, CALEDONIAN WHARF, LONDON, E14 3EN")


def test_a_gate_only_counts_when_driven_through():
    ways = lambda *ids: {"ways": [{"wayId": i, "beginShapeIndex": 0, "endShapeIndex": 1} for i in ids]}
    assert smoke_london.uses_way(ways(1, 7, 2), 7)
    assert not smoke_london.uses_way(ways(7, 1, 2), 7)  # started on it
    assert not smoke_london.uses_way(ways(1, 2, 7), 7)  # ended on it
