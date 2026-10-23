"""The offline map's styles read everything from the phone, and its manifest
lists every file. pytest server/scripts"""

import json

import offline_styles as ofs

STYLE = {
    "version": 8,
    "glyphs": "https://tiles.example/fonts/{fontstack}/{range}.pbf",
    "sprite": "https://tiles.example/sprites/ofm",
    "sources": {
        "openmaptiles": {"type": "vector", "url": "https://tiles.example/planet", "attribution": "© OSM"},
        "ne2_shaded": {"type": "raster", "url": "https://tiles.example/ne2"},
    },
    "layers": [
        {"id": "bg", "type": "background"},
        {"id": "shade", "type": "raster", "source": "ne2_shaded"},
        {
            "id": "roads",
            "type": "symbol",
            "source": "openmaptiles",
            "layout": {"text-font": ["Noto Sans Regular", "Noto Sans Bold"]},
        },
        {
            "id": "places",
            "type": "symbol",
            "source": "openmaptiles",
            "layout": {"text-font": ["step", ["zoom"], ["literal", ["Noto Sans Italic"]], 10, ["literal", ["Noto Sans Bold"]]]},
        },
    ],
}


def test_reads_everything_from_the_pack():
    style, fonts, sprites = ofs.offline_style(STYLE, "night")
    assert style["sources"] == {
        "openmaptiles": {"type": "vector", "url": "pmtiles://blueroute-pack://map.pmtiles", "attribution": "© OSM"}
    }
    assert [layer["id"] for layer in style["layers"]] == ["bg", "roads", "places"]
    assert style["glyphs"] == "blueroute-pack://fonts/{fontstack}/{range}.pbf"
    assert style["sprite"] == "blueroute-pack://sprites/night/default"
    assert fonts == {"Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"}
    assert sprites == [("default", "https://tiles.example/sprites/ofm")]
    # Folder names, one font per label.
    assert style["layers"][1]["layout"]["text-font"] == ["NotoSansRegular"]
    assert style["layers"][2]["layout"]["text-font"] == [
        "step",
        ["zoom"],
        ["literal", ["NotoSansItalic"]],
        10,
        ["literal", ["NotoSansBold"]],
    ]
    # Nothing online is left.
    assert "https://" not in json.dumps(style)


def test_builds_the_pack_and_lists_every_file(tmp_path):
    (tmp_path / "map.pmtiles").write_bytes(b"PMTiles" + b"\0" * 100)
    asked = []

    def get(url):
        asked.append(url)
        return json.dumps(STYLE).encode() if url.startswith("https://styles") else b"x"

    m = ofs.build(str(tmp_path), [-1, 50, 1, 52], 0, 14, {"night": "https://styles/dark"}, get=get)
    paths = [f["path"] for f in m["files"]]
    assert paths[0] == "map.pmtiles"
    assert "styles/night.json" in paths
    assert "sprites/night/default@2x.png" in paths
    assert "fonts/NotoSansBold/0-255.pbf" in paths
    assert "https://tiles.example/fonts/Noto%20Sans%20Bold/8192-8447.pbf" in asked
    assert m["bounds"] == [-1, 50, 1, 52] and (m["minZoom"], m["maxZoom"]) == (0, 14)
    assert m["styles"] == {"night": "styles/night.json"}
    assert m["bytes"] == sum(f["bytes"] for f in m["files"])
    assert json.loads((tmp_path / "manifest.json").read_text())["files"] == m["files"]
