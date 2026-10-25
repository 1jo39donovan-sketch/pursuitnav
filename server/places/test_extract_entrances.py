from extract_entrances import entrance_row


def test_keeps_doors_a_crew_can_use():
    row = entrance_row({"entrance": "main", "ref": "A", "addr:flats": "1-24", "addr:housenumber": "54"}, -0.117, 51.55)
    assert row == (5155000, -11700, "main", "A", "", "54", "", "1-24")


def test_leaves_out_fire_exits_garages_and_private_side_doors():
    assert entrance_row({"entrance": "emergency"}, -0.117, 51.55) is None
    assert entrance_row({"entrance": "exit"}, -0.117, 51.55) is None
    assert entrance_row({"entrance": "garage"}, -0.117, 51.55) is None
    assert entrance_row({"entrance": "service", "access": "private"}, -0.117, 51.55) is None
    # A private block's own front door is still the way in.
    assert entrance_row({"entrance": "main", "access": "private"}, -0.117, 51.55) is not None


def test_only_in_the_region():
    assert entrance_row({"entrance": "main"}, -3.19, 55.95) is None


def test_no_pipe_breaks_the_line():
    row = entrance_row({"entrance": "yes", "name": "Block A | B"}, -0.1, 51.5)
    assert row[4] == "Block A / B"
