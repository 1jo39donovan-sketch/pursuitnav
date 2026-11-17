import { describe, expect, it } from "vitest";

import { combinedFeed, HighwaysFeed, inForce, parseHighwaysClosures } from "../../src/highwaysClosures.js";

const REGION: [number, number, number, number] = [-0.8, 50.8, 1.6, 52.2];
const NOW = new Date("2026-11-17T22:00:00Z");

// The shape of a real record (Road and Lane Closures v2.0, 17 Nov 2026).
function record(over: {
  type?: string;
  status?: string;
  start?: string;
  end?: string;
  posList?: string;
  grouped?: boolean;
  id?: string;
}) {
  const linear = {
    gmlLineString: { locGmlLineString: { srsDimension: 2, srsName: "EPSG::4326", posList: over.posList ?? "51.3000 0.5000 51.3010 0.5030 51.3020 0.5060" } },
    supplementaryPositionalDescription: { locationDescription: "M20 eastbound between J5 and J6" },
  };
  return {
    sitRoadOrCarriagewayOrLaneManagement: {
      idG: over.id ?? "rec-1",
      roadOrCarriagewayOrLaneManagementType: { value: over.type ?? "carriagewayClosures" },
      validity: {
        validityStatus: over.status ?? "active",
        validityTimeSpecification: { overallStartTime: over.start ?? "2026-11-17T20:00:00.00Z", overallEndTime: over.end ?? "2026-11-18T06:00:00.00Z" },
      },
      locationReference: over.grouped
        ? { locLocationGroupByList: { locationContainedInGroup: [{ locLinearLocation: linear }, { locLinearLocation: linear }] } }
        : { locLinearLocation: linear, locSingleRoadLinearLocation: {} },
    },
  };
}
const feed = (...records: object[]) => ({ D2Payload: { version: "3.4", situation: [{ idG: "s1", situationRecord: records }] } });

describe("National Highways closures", () => {
  it("turns a carriageway closure in force into boxes, named by its location", () => {
    const [c] = parseHighwaysClosures(feed(record({})), REGION, NOW);
    expect(c?.street).toBe("M20 eastbound between J5 and J6");
    expect(c?.id).toBe("nh:rec-1");
    expect(c!.rings.length).toBeGreaterThan(0);
    // lat lng in the feed, [lng, lat] in the boxes.
    expect(c!.rings[0]![0]![0]).toBeCloseTo(0.5, 1);
    expect(c!.rings[0]![0]![1]).toBeCloseTo(51.3, 1);
  });

  it("leaves open roads open: lane closures and other works", () => {
    expect(parseHighwaysClosures(feed(record({ type: "laneClosures" }), record({ type: "other" })), REGION, NOW)).toEqual([]);
  });

  it("reads grouped locations too", () => {
    expect(parseHighwaysClosures(feed(record({ grouped: true })), REGION, NOW)).toHaveLength(1);
  });

  it("only what's in force now", () => {
    expect(inForce(record({ status: "suspended" }).sitRoadOrCarriagewayOrLaneManagement, NOW)).toBe(false);
    expect(inForce(record({ start: "2026-11-18T20:00:00Z", end: "2026-11-19T06:00:00Z" }).sitRoadOrCarriagewayOrLaneManagement, NOW)).toBe(false);
    expect(inForce(record({ end: "2026-11-17T21:00:00Z" }).sitRoadOrCarriagewayOrLaneManagement, NOW)).toBe(false);
    // Planned overnight: in force inside its window.
    expect(inForce(record({ status: "planned" }).sitRoadOrCarriagewayOrLaneManagement, NOW)).toBe(true);
    // Planned over months (nights only, the road open by day): not counted as closed.
    expect(inForce(record({ status: "planned", start: "2026-09-11T20:00:00Z", end: "2027-12-23T06:00:00Z" }).sitRoadOrCarriagewayOrLaneManagement, NOW)).toBe(false);
    // Active over months: it says it's closed now.
    expect(inForce(record({ status: "active", start: "2026-09-11T20:00:00Z", end: "2027-12-23T06:00:00Z" }).sitRoadOrCarriagewayOrLaneManagement, NOW)).toBe(true);
  });

  it("only inside the region (the feed is all England)", () => {
    expect(parseHighwaysClosures(feed(record({ posList: "53.434285 -1.427266 53.434661 -1.427976 53.43526 -1.429104" })), REGION, NOW)).toEqual([]);
  });

  it("is tolerant of a malformed feed", () => {
    expect(parseHighwaysClosures(null, REGION, NOW)).toEqual([]);
    expect(parseHighwaysClosures({ D2Payload: { situation: [{ situationRecord: [{}] }] } }, REGION, NOW)).toEqual([]);
  });

  it("follows pages, sends the key only in the header, and keeps the last good list on failure", async () => {
    const urls: string[] = [];
    const headers: Record<string, string>[] = [];
    let fail = false;
    const fake = (async (url: string, init?: RequestInit) => {
      urls.push(url);
      headers.push(init?.headers as Record<string, string>);
      if (fail) return new Response("", { status: 500 });
      const page2 = url.includes("PageCursor");
      return new Response(JSON.stringify(feed(record({ id: page2 ? "rec-2" : "rec-1" }))), {
        status: 200,
        headers: page2 || url.includes("unplanned") ? {} : { "x-next": `${url}&PageCursor=2` },
      });
    }) as unknown as typeof fetch;
    const nh = new HighwaysFeed("secret", REGION, undefined, fake);
    await nh.refresh(NOW);
    expect(nh.current(NOW).map((c) => c.id).sort()).toEqual(["nh:rec-1", "nh:rec-2"]);
    expect(urls.some((u) => u.includes("secret"))).toBe(false);
    expect(headers[0]!["Ocp-Apim-Subscription-Key"]).toBe("secret");
    fail = true;
    await nh.refresh(new Date(NOW.getTime() + 300_000));
    expect(nh.current(NOW)).toHaveLength(2);
    // An hour without a good read: none (they may have reopened).
    expect(nh.current(new Date(NOW.getTime() + 2 * 3600_000))).toEqual([]);
  });

  it("joins with TfL's closures for routing", () => {
    const tfl = { current: () => [{ id: "tfl:1", street: "Upper Street", rings: [] }], currentDelays: () => [], summary: () => ({ active: 1, updatedAt: "2026-11-17T21:59:00Z" }) };
    const nh = { current: () => [{ id: "nh:1", street: "M20", rings: [] }], summary: () => ({ active: 1, updatedAt: "2026-11-17T21:58:00Z" }) };
    const both = combinedFeed(tfl, nh);
    expect(both.current().map((c) => c.id)).toEqual(["tfl:1", "nh:1"]);
    expect(both.summary()).toEqual({ active: 2, updatedAt: "2026-11-17T21:58:00Z" });
    expect(combinedFeed(undefined, nh).current()).toHaveLength(1);
  });
});
