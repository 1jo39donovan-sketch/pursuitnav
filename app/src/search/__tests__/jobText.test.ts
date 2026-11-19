import { describe, expect, it } from "vitest";

import { jobSearches, looksLikeJob } from "../jobText";

describe("paste the job", () => {
  it("tells a pasted job from a typed address", () => {
    expect(looksLikeJob("54 Caledonian Road")).toBe(false);
    expect(looksLikeJob("Flat 3, Smith House, 54 Caledonian Rd, N7 8LA")).toBe(false);
    expect(looksLikeJob("Male acting aggressively outside Flat 3, Smith House, 54 Caledonian Road N7 8LA")).toBe(true);
    expect(looksLikeJob("RTC\nHolloway Road")).toBe(true);
  });

  it("pulls the whole address out of a job, best first", () => {
    const s = jobSearches(
      "Male acting aggressively outside Flat 3, Smith House, 54 Caledonian Road N7 8LA, caller is the neighbour",
    );
    expect(s[0]).toBe("Flat 3, Smith House, 54 Caledonian Road, N7 8LA");
    expect(s).toContain("54 Caledonian Road, N7 8LA");
    expect(s).toContain("54 Caledonian Road");
    expect(s).toContain("N7 8LA");
  });

  it("reads control-room capitals and abbreviations", () => {
    const s = jobSearches("RTC JUNCTION OF HOLLOWAY RD AND CAMDEN ROAD, 2 VEHICLES, NO INJURIES REPORTED");
    expect(s).toEqual(expect.arrayContaining(["Holloway Rd", "Camden Road"]));
  });

  it("finds an estate with no road named", () => {
    const s = jobSearches("Concern for welfare, elderly female, third floor flat on the Bemerton Estate near the Cally");
    expect(s[0]).toBe("Bemerton Estate");
  });

  it("doesn't take words before the name into it", () => {
    const s = jobSearches("Suspects seen running towards Upper Street from the station, wearing dark clothing and masks");
    expect(s[0]).toBe("Upper Street");
  });

  it("offers nothing when there's no address in it", () => {
    expect(jobSearches("Caller reports a loud argument, no further details, callback requested")).toEqual([]);
  });
});
