import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { csvField, eventsCsv, gpx, tripsCsv } from "../exportFiles";
import { Recorder, type TripSink } from "../recorder";
import { MAX_TRIPS, storageState, type TripEvent, type TripRecord } from "../trip";

function fakeSink() {
  const trips = new Map<string, TripRecord>();
  const events = new Map<string, TripEvent[]>();
  const sink: TripSink & { trips: typeof trips; events: typeof events; count: number } = {
    trips,
    events,
    count: 0,
    saveTrip: (r) => void trips.set(r.header.id, r),
    addTripEvents: (id, es) => void events.set(id, [...(events.get(id) ?? []), ...es]),
    tripStorage: () => ({ trips: sink.count || trips.size, bytes: 0 }),
  };
  return sink;
}

const HEADER = {
  appVersion: "1.0.0",
  platform: "android",
  vehicle: "car",
  blueLight: true,
  demo: true,
  query: "54 Caledonian Road",
  destination: { title: "54 Caledonian Road, Islington", lat: 51.535, lng: -0.119 },
  gpsAccuracyM: 6,
};

describe("field-test recorder", () => {
  it("is off by default and records nothing when off", () => {
    const sink = fakeSink();
    const rec = new Recorder(sink);
    expect(rec.enabled).toBe(false);
    expect(rec.begin(HEADER)).toBeNull();
    rec.event({ type: "speech", text: "Turn left" });
    rec.flush();
    expect(sink.trips.size).toBe(0);
    expect(sink.events.size).toBe(0);
  });

  it("records a trip: plan → go → off route → re-route → arrive", () => {
    let now = 1_000_000;
    const sink = fakeSink();
    const rec = new Recorder(sink, () => now);
    rec.setEnabled(true);
    const id = rec.begin(HEADER)!;
    now += 900;
    rec.event({ type: "plan-standard", ms: rec.sinceStart(), standard: { etaS: 600, distanceM: 4000 } });
    now += 2100;
    rec.event({
      type: "plan-full",
      ms: rec.sinceStart(),
      standard: { etaS: 600, distanceM: 4000 },
      police: { etaS: 500, distanceM: 3900, restrictions: ["No right turn: Upper Street into Islington Green"] },
      fastest: "police",
    });
    now += 1000;
    rec.event({ type: "go", kind: "police", staleRefresh: false });
    for (let i = 0; i < 10; i++) {
      now += 500; // two fixes a second: one kept a second
      rec.event({ type: "fix", lat: 51.53 + i * 0.0001, lng: -0.12, speed: 8, heading: 0, accuracy: 5 });
      if (i === 0) rec.event({ type: "eta", etaS: 500 });
    }
    rec.event({ type: "speech", text: "In 200 metres, turn right onto Caledonian Road" });
    rec.event({ type: "off-route", offByM: 45, lat: 51.531, lng: -0.121 });
    rec.event({ type: "signal", state: "no-signal" });
    rec.event({ type: "signal", state: "no-signal" }); // repeated: once
    now += 10_000;
    rec.event({ type: "reroute", trigger: "auto", startedAt: now - 8000, ms: 8000, outcome: "no-signal", kindBefore: "police", kindAfter: "police" });
    rec.event({ type: "signal", state: "online" });
    rec.event({ type: "reroute", trigger: "signal-back", startedAt: now, ms: 1200, outcome: "ok", kindBefore: "police", kindAfter: "standard" });
    expect(rec.mark("good-call")).toBe(true);
    now += 400_000;
    rec.end("arrived");

    const trip = sink.trips.get(id)!;
    const s = trip.summary;
    expect(s.standardMs).toBe(900);
    expect(s.fullMs).toBe(3000);
    expect(s.police?.restrictions).toHaveLength(1);
    expect(s.fastest).toBe("police");
    expect(s.kind).toBe("standard");
    expect(s.fixes).toBe(5);
    expect(s.drivenM).toBeGreaterThan(40);
    expect(s.reroutes).toBe(2);
    expect(s.offRoutes).toBe(1);
    expect(s.marks).toBe(1);
    expect(s.noSignalS).toBe(10);
    expect(s.ended).toBe("arrived");
    expect(s.durationS).toBe(415);
    // First ETA 500 s, shown 0.5 s after Go; arrived 414.5 s later (rounded).
    expect(s.etaErrorS).toBe(-85);
    const types = sink.events.get(id)!.map((e) => e.type);
    expect(types.filter((t) => t === "signal")).toEqual(["signal", "signal"]);
    expect(types.at(-1)).toBe("end");
  });

  it("warns at 90% and stops at the limit, never deleting", () => {
    expect(storageState(MAX_TRIPS * 0.9, 0)).toBe("nearly-full");
    expect(storageState(MAX_TRIPS - 1, 49 * 1024 * 1024)).toBe("nearly-full");
    expect(storageState(MAX_TRIPS, 0)).toBe("full");
    const sink = fakeSink();
    sink.count = MAX_TRIPS;
    const rec = new Recorder(sink);
    rec.setEnabled(true);
    expect(rec.begin(HEADER)).toBeNull();
    expect(rec.full).toBe(true);
    expect(sink.trips.size).toBe(0);
  });

  it("picking another destination ends the trip before", () => {
    const sink = fakeSink();
    const rec = new Recorder(sink);
    rec.setEnabled(true);
    const first = rec.begin(HEADER)!;
    rec.begin({ ...HEADER, query: "N7 8LA" });
    expect(sink.trips.get(first)!.summary.ended).toBe("new-destination");
  });

  it("never touches the network: nothing in fieldtest imports the server code", () => {
    const dir = join(__dirname, "..");
    for (const name of readdirSync(dir).filter((f) => /\.tsx?$/.test(f))) {
      const code = readFileSync(join(dir, name), "utf8");
      expect(code, name).not.toMatch(/from\s+["'][./]*api\//);
      expect(code, name).not.toMatch(/\bfetch\(/);
    }
  });
});

describe("export files", () => {
  const record: TripRecord = {
    header: { ...HEADER, id: "t1", format: 1, startedAt: Date.UTC(2026, 9, 23, 12) },
    others: { googleApple: 12 },
    notes: { "1792756860000": 'Said "left", meant right' },
    summary: {
      kind: "police",
      standardMs: 900,
      fullMs: 3000,
      standard: { etaS: 600, distanceM: 4000 },
      police: { etaS: 500, distanceM: 3900, restrictions: ["No right turn: Upper Street, Islington Green"] },
      fastest: "police",
      staleRefresh: false,
      goAt: Date.UTC(2026, 9, 23, 12, 0, 5),
      endedAt: Date.UTC(2026, 9, 23, 12, 9),
      ended: "arrived",
      durationS: 535,
      drivenM: 4100,
      firstEtaS: 500,
      etaErrorS: 35,
      reroutes: 1,
      offRoutes: 1,
      marks: 1,
      tapsIgnored: 0,
      noSignalS: 0,
      noAnswerS: 0,
      fixes: 2,
    },
  };
  const events: TripEvent[] = [
    { t: Date.UTC(2026, 9, 23, 12, 0, 6), type: "fix", lat: 51.53, lng: -0.12, speed: 8, heading: 0, accuracy: 5 },
    { t: 1792756860000, type: "mark", tag: "wrong-instruction", lat: 51.531, lng: -0.121 },
    { t: Date.UTC(2026, 9, 23, 12, 1, 1), type: "fix", lat: 51.531, lng: -0.121, speed: 8, heading: 0, accuracy: 5 },
  ];

  it("quotes CSV fields with commas, quotes and line breaks (RFC 4180)", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("Flat 3, 54 Caledonian Road")).toBe('"Flat 3, 54 Caledonian Road"');
    expect(csvField('Said "left"')).toBe('"Said ""left"""');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField(null)).toBe("");
    const trips = tripsCsv([record]);
    const lines = trips.split("\r\n");
    expect(lines[0]).toMatch(/^trip_id,demo,started,/);
    expect(lines[1]).toContain('"54 Caledonian Road, Islington"');
    expect(lines[1]).toContain('"No right turn: Upper Street, Islington Green"');
    expect(lines[1]!.endsWith(",12")).toBe(true);
    const ev = eventsCsv([{ record, events }]);
    expect(ev.split("\r\n")[0]).toBe("trip_id,time,type,lat,lng,details");
    expect(ev).toContain('note=Said ""left"", meant right');
  });

  it("writes the track and marks as GPX 1.1", () => {
    const out = gpx([{ record, events }]);
    expect(out).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="BlueRoute" xmlns="http://www.topografix.com/GPX/1/1">',
        '  <wpt lat="51.531000" lon="-0.121000"><time>2026-10-23T12:01:00.000Z</time><name>Wrong instruction</name><desc>Said &quot;left&quot;, meant right</desc></wpt>',
        "  <trk><name>54 Caledonian Road, Islington (t1)</name>",
        "    <trkseg>",
        '      <trkpt lat="51.530000" lon="-0.120000"><time>2026-10-23T12:00:06.000Z</time></trkpt>',
        '      <trkpt lat="51.531000" lon="-0.121000"><time>2026-10-23T12:01:01.000Z</time></trkpt>',
        "    </trkseg>",
        "  </trk>",
        "</gpx>",
        "",
      ].join("\n"),
    );
  });
});
