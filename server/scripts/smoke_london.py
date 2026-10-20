"""London smoke test for a live Blue Route server. Run by smoke-london.sh.

Checks real London cases against the live API, over HTTPS:

1. One-way streets. Routes against the flow of the one-way sections of
   Stroud Green Road, and of the nearest other one-way streets (contraflow bus
   lanes first, the riskiest case). Neither route may travel any one-way
   street the wrong way. This is checked independently of the server: each
   route lists the OpenStreetMap ways it uses, and they're compared with the
   one-way tags in the same OpenStreetMap extract the server builds from.
2. A bus gate. Finds 24/7 bus gates in the extract and routes through one.
   The standard route must not use it; the blue-light route must, and must
   list it.
3. 54 Caledonian Road. Door-level address search finds it, and the route
   ends at that door, not somewhere along the road.

Every full route plan must also come back within 8 s, the app's timeout.
Prints PASS/FAIL per check; exits 1 if anything failed.

Usage: python smoke_london.py --api https://server --pbf london.osm.pbf
"""

import argparse
import json
import math
import sys
import time
import urllib.error
import urllib.request

import osmium

APP_TIMEOUT_S = 8.0
CAR_HIGHWAYS = {
    "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
    "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link", "living_street",
}
GATE_HIGHWAYS = (CAR_HIGHWAYS - {"motorway", "motorway_link", "trunk", "trunk_link"}) | {"busway"}

failures = []


def report(ok, what, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {what}{': ' + detail if detail else ''}", flush=True)
    if not ok:
        failures.append(what)


# ---- geometry (lng, lat) ----

def metres(a, b):
    k = math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot((a[0] - b[0]) * 111_320 * k, (a[1] - b[1]) * 111_320)


def unit(a, b):
    k = math.cos(math.radians((a[1] + b[1]) / 2))
    dx, dy = (b[0] - a[0]) * k, b[1] - a[1]
    n = math.hypot(dx, dy)
    return (dx / n, dy / n) if n else (0.0, 0.0)


def nearest_segment(coords, p):
    """Index i of the segment coords[i] -> coords[i+1] nearest to p."""
    best, best_d = 0, float("inf")
    for i in range(len(coords) - 1):
        a, b = coords[i], coords[i + 1]
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        d = min(metres(p, a), metres(p, b), metres(p, mid))
        if d < best_d:
            best, best_d = i, d
    return best


def length(coords):
    return sum(metres(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def point_along(coords, m):
    """The point m metres along the line (clamped to its ends)."""
    for i in range(len(coords) - 1):
        d = metres(coords[i], coords[i + 1])
        if m <= d and d > 0:
            f = m / d
            a, b = coords[i], coords[i + 1]
            return (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)
        m -= d
    return coords[-1]


# ---- the map: one-way tags, bus gates ----

def oneway_sign(tags):
    """+1 one-way along the way's nodes, -1 against them, 0 two-way."""
    if tags.get("highway") not in CAR_HIGHWAYS:
        return 0
    ow = tags.get("oneway")
    if ow in ("yes", "true", "1"):
        return 1
    if ow in ("-1", "reverse"):
        return -1
    if ow == "no":
        return 0
    if tags.get("junction") in ("roundabout", "circular") or tags.get("highway") in ("motorway", "motorway_link"):
        return 1
    return 0


def is_bus_gate(tags):
    """Buses only, at all times (anything conditional is left out: it depends on the hour)."""
    if tags.get("highway") not in GATE_HIGHWAYS or tags.get("area") == "yes":
        return False
    if any(k.endswith(":conditional") for k in tags):
        return False
    if tags.get("highway") == "busway":
        return True
    no_cars = (tags.get("motor_vehicle") == "no" or tags.get("motorcar") == "no"
               or tags.get("access") == "no" or tags.get("vehicle") == "no")
    buses = tags.get("bus") in ("yes", "designated") or tags.get("psv") in ("yes", "designated")
    return no_cars and buses


def car_usable(tags):
    return (tags.get("highway") in CAR_HIGHWAYS and not is_bus_gate(tags)
            and tags.get("access") not in ("no", "private") and tags.get("motor_vehicle") not in ("no", "private"))


class FirstPass(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.oneways = {}  # way id -> (sign, coords, name, contraflow)
        self.gates = []  # (way id, name, coords, node ids, sign)

    def way(self, w):
        tags = {t.k: t.v for t in w.tags}
        sign = oneway_sign(tags)
        gate = is_bus_gate(tags)
        if not sign and not gate:
            return
        try:
            coords = [(n.lon, n.lat) for n in w.nodes]
        except osmium.InvalidLocationError:
            return
        if len(coords) < 2:
            return
        name = tags.get("name", "")
        if sign:
            contraflow = (tags.get("oneway:bus") == "no" or tags.get("oneway:psv") == "no"
                          or "opposite" in tags.get("busway", "") + tags.get("busway:left", "")
                          + tags.get("busway:right", ""))
            self.oneways[w.id] = (sign, coords, name, contraflow, tags.get("highway"))
        if gate:
            self.gates.append((w.id, name, coords, [n.ref for n in w.nodes], sign))


class SecondPass(osmium.SimpleHandler):
    """Car roads that meet the ends of the bus gates found."""

    def __init__(self, ends):
        super().__init__()
        self.ends = ends
        self.at = {}  # node id -> [(name, coords from that node outwards)]

    def way(self, w):
        refs = [n.ref for n in w.nodes]
        hit = [r for r in refs if r in self.ends]
        if not hit:
            return
        tags = {t.k: t.v for t in w.tags}
        if not car_usable(tags):
            return
        try:
            coords = [(n.lon, n.lat) for n in w.nodes]
        except osmium.InvalidLocationError:
            return
        for r in hit:
            i = refs.index(r)
            for part in (coords[i:], coords[: i + 1][::-1]):
                if len(part) >= 2:
                    self.at.setdefault(r, []).append((tags.get("name", ""), part))


# ---- the API ----

def call(api, path, body=None, timeout=30):
    req = urllib.request.Request(
        api + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"content-type": "application/json"} if body is not None else {},
        method="POST" if body is not None else "GET",
    )
    start = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, json.loads(res.read() or b"null"), time.monotonic() - start
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null"), time.monotonic() - start
    except (urllib.error.URLError, TimeoutError) as e:
        return 0, {"error": str(e)}, time.monotonic() - start


def plan(api, a, b):
    """Full plan from a to b ((lng, lat) points). Fails the check if it's slower than the app waits."""
    status, body, secs = call(api, "/v1/routes", {"from": {"lat": a[1], "lng": a[0]}, "to": {"lat": b[1], "lng": b[0]}})
    if secs > APP_TIMEOUT_S:
        report(False, "route answers within the app's 8 s", f"{secs:.1f} s from {fmt(a)} to {fmt(b)}")
    return status, body, secs


def fmt(p):
    return f"{p[1]:.5f},{p[0]:.5f}"


def wrong_way(route, oneways):
    """Places the route travels a one-way way against its flow: [(way name or id, point)]."""
    shape = route.get("shape") or []
    bad = []
    for w in route.get("ways") or []:
        info = oneways.get(w["wayId"])
        if not info:
            continue
        sign, coords = info[0], info[1]
        for i in range(w["beginShapeIndex"], min(w["endShapeIndex"], len(shape) - 1)):
            a, b = shape[i], shape[i + 1]
            if metres(a, b) < 3:
                continue
            j = nearest_segment(coords, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2))
            road = unit(coords[j], coords[j + 1])
            travel = unit(a, b)
            if (road[0] * travel[0] + road[1] * travel[1]) * sign < -0.5:
                bad.append((info[2] or f"way {w['wayId']}", a))
                break
    return bad


def check_routes_one_way(body, oneways, what):
    """Both routes in a plan keep to one-way streets. False if the plan can't be checked."""
    ok = True
    for kind in ("standard", "police"):
        route = body.get(kind)
        if not route:
            continue
        if "ways" not in route:
            report(False, f"{what}: {kind} route lists its ways", "server too old to check; update it")
            return False
        bad = wrong_way(route, oneways)
        if bad:
            ok = False
            report(False, f"{what}: {kind} route never goes the wrong way",
                   "; ".join(f"against {n} at {fmt(p)}" for n, p in bad[:3]))
    return ok


# ---- the checks ----

def check_one_ways(api, oneways, street, near_m, count):
    on_street = sorted((i for i, v in oneways.items() if v[2] == street), key=lambda i: -length(oneways[i][1]))
    if on_street:
        pts = [p for i in on_street for p in oneways[i][1]]
        centre = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
    else:
        print(f"NOTE  no one-way section of {street} in this map; testing the one-way streets nearest Finsbury Park")
        centre = (-0.1065, 51.5643)

    def mid(i):
        c = oneways[i][1]
        return point_along(c, length(c) / 2)

    nearby = [i for i, v in oneways.items()
              if v[2] != street and v[4] in CAR_HIGHWAYS and length(v[1]) >= 80 and metres(mid(i), centre) <= near_m]
    # Contraflow bus lanes first: buses may go the other way; the police route must not.
    nearby.sort(key=lambda i: (not oneways[i][3], metres(mid(i), centre)))
    cases = on_street[:3] + nearby[:count]
    if not cases:
        report(False, "one-way streets to test", f"none within {near_m} m")
        return
    tested = 0
    for i in cases:
        sign, coords, name, contraflow, _ = oneways[i]
        flow = coords if sign > 0 else coords[::-1]
        total = length(flow)
        # From near the far end to near the start: against the flow.
        a, b = point_along(flow, total * 0.85), point_along(flow, total * 0.15)
        what = f"{name or 'way ' + str(i)}{' (contraflow bus lane)' if contraflow else ''}, against the flow"
        status, body, secs = plan(api, a, b)
        if status != 200:
            report(False, f"{what}: routes found", f"HTTP {status} {body}")
            continue
        if check_routes_one_way(body, oneways, what):
            tested += 1
            report(True, f"{what}: neither route goes the wrong way",
                   f"{secs:.1f} s, blue light {'offered' if body.get('police') else 'not offered'}")
    if on_street:
        print(f"      ({len(on_street)} one-way section(s) of {street} in the map)")


def check_bus_gate(api, pbf, oneways, gates, offset_m, tries):
    ends = {refs[0] for _, _, _, refs, _ in gates} | {refs[-1] for _, _, _, refs, _ in gates}
    second = SecondPass(ends)
    second.apply_file(pbf, locations=True, idx="flex_mem")

    def approach(node, gate_name):
        """A point offset_m along a car road from the gate's end; the same street preferred."""
        options = sorted(second.at.get(node, []), key=lambda o: o[0] != gate_name)
        return point_along(options[0][1], offset_m) if options else None

    centre = (-0.1278, 51.5074)
    candidates = []
    for way_id, name, coords, refs, sign in gates:
        if not 15 <= length(coords) <= 600:
            continue
        a = approach(refs[0], name)
        b = approach(refs[-1], name)
        if a and b:
            if sign < 0:
                a, b = b, a
            candidates.append((metres(point_along(coords, length(coords) / 2), centre), way_id, name, coords, a, b))
    candidates.sort()
    if not candidates:
        report(False, "bus gates to test", "none found in the map")
        return
    reasons = []
    for _, way_id, name, coords, a, b in candidates[:tries]:
        label = f"{name or 'bus gate'} (way {way_id})"
        gate_mid = point_along(coords, length(coords) / 2)
        status, body, secs = plan(api, a, b)
        if status != 200:
            reasons.append(f"{label}: HTTP {status}")
            continue
        if not check_routes_one_way(body, oneways, f"bus gate {label}"):
            return
        standard, police = body.get("standard") or {}, body.get("police")
        if any(w["wayId"] == way_id for w in standard.get("ways") or []):
            report(False, f"standard route stays out of the bus gate {label}")
            return
        if not police:
            reasons.append(f"{label}: no blue-light route ({body.get('noPoliceReason')})")
            continue
        if not any(w["wayId"] == way_id for w in police.get("ways") or []):
            reasons.append(f"{label}: blue-light route went another way")
            continue
        listed = [r for r in police.get("restrictions") or []
                  if any(metres((p["lng"], p["lat"]), gate_mid) <= 150 for p in (r.get("locations") or [r["location"]]))]
        if not listed:
            report(False, f"blue-light route lists the bus gate it uses ({label})",
                   f"restrictions listed: {[r['description'] for r in police.get('restrictions') or []]}")
            return
        report(True, f"bus gate {label}: blue light uses and lists it, standard route doesn't",
               f"'{listed[0]['description']}', saves {police['savingS']:.0f} s, {secs:.1f} s to plan")
        return
    report(False, "a bus gate the blue-light route uses and lists", "; ".join(reasons[:6]))


def is_address(query, label):
    """'54 Caledonian Road' is OS's '54, CALEDONIAN ROAD, LONDON, N1 9DP' (or '54 CALEDONIAN ROAD, …',
    perhaps after a building name), not flat 54 or number 154."""
    number, street = query.upper().split(" ", 1)
    parts = [p.strip() for p in label.upper().split(",")]
    for i, part in enumerate(parts):
        if part == number and i + 1 < len(parts) and parts[i + 1].startswith(street):
            return True
        if part.startswith(f"{number} {street}"):
            return True
    return False


def check_address(api, query, origin):
    status, body, _ = call(api, "/v1/addresses", {"query": query})
    if status == 503 and (body or {}).get("error") == "addresses-not-configured":
        report(False, f"'{query}' found at door level", "OS Places isn't set up on the server (OS_PLACES_KEY)")
        return
    if status != 200:
        report(False, f"'{query}' found at door level", f"HTTP {status} {body}")
        return
    hits = [a for a in body.get("addresses") or [] if is_address(query, a["label"])]
    if not hits:
        report(False, f"'{query}' found at door level",
               f"got {[a['label'] for a in (body.get('addresses') or [])[:3]]}")
        return
    door = (hits[0]["lng"], hits[0]["lat"])
    report(True, f"'{query}' found at door level", hits[0]["label"])
    status, plan_body, secs = plan(api, origin, door)
    if status != 200:
        report(False, f"route to {query}", f"HTTP {status} {plan_body}")
        return
    for kind in ("standard", "police"):
        route = plan_body.get(kind)
        if not route:
            continue
        end = tuple(route["shape"][-1])
        d = metres(end, door)
        report(d <= 40, f"{kind} route ends at the door of {query}", f"{d:.0f} m from it, {secs:.1f} s to plan")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", required=True, help="the server, e.g. https://blueroute.example.org")
    ap.add_argument("--pbf", required=True, help="the OpenStreetMap extract the server is built from")
    ap.add_argument("--street", default="Stroud Green Road", help="one-way street to test")
    ap.add_argument("--near-m", type=float, default=1500, help="other one-way streets within this of it")
    ap.add_argument("--one-ways", type=int, default=6, help="how many other one-way streets")
    ap.add_argument("--gate-offset-m", type=float, default=80, help="start and end this far from the bus gate")
    ap.add_argument("--gate-tries", type=int, default=10)
    ap.add_argument("--address", default="54 Caledonian Road")
    ap.add_argument("--origin", default="-0.1037,51.5463", help="lng,lat to route to the address from (Highbury Corner)")
    ap.add_argument("--skip-address", action="store_true", help="for test maps without OS Places")
    args = ap.parse_args()
    api = args.api.rstrip("/")

    status, health, _ = call(api, "/health")
    healthy = status == 200 and (health or {}).get("routing") and (health or {}).get("places")
    report(bool(healthy), "server is up with routing and places", json.dumps(health))
    if not healthy:
        return 1

    first = FirstPass()
    first.apply_file(args.pbf, locations=True, idx="flex_mem")
    print(f"      map: {len(first.oneways)} one-way ways, {len(first.gates)} bus gates", flush=True)

    check_one_ways(api, first.oneways, args.street, args.near_m, args.one_ways)
    check_bus_gate(api, args.pbf, first.oneways, first.gates, args.gate_offset_m, args.gate_tries)
    if not args.skip_address:
        lng, lat = (float(x) for x in args.origin.split(","))
        check_address(api, args.address, (lng, lat))

    print(f"\n{len(failures)} check(s) failed" if failures else "\nAll London checks passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
