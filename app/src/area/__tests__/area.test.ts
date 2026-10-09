import { describe, expect, it } from "vitest";

import { boroughAt, cardinal, generallyTowards, projectAhead } from "../area";

describe("boroughAt", () => {
  it("names the borough at well-known spots", () => {
    expect(boroughAt(51.5466, -0.1035)).toBe("Islington"); // Highbury Corner
    expect(boroughAt(51.4613, -0.1156)).toBe("Lambeth"); // Brixton
    expect(boroughAt(51.5194, -0.0612)).toBe("Tower Hamlets"); // Whitechapel
    expect(boroughAt(51.5138, -0.0984)).toBe("City of London"); // St Paul's
  });

  it("returns null outside London", () => {
    expect(boroughAt(52.2, -0.5)).toBeNull();
  });
});

describe("cardinal", () => {
  it("rounds to the nearest of eight", () => {
    expect(cardinal(0)).toBe("N");
    expect(cardinal(44)).toBe("NE");
    expect(cardinal(181)).toBe("S");
    expect(cardinal(359)).toBe("N");
    expect(cardinal(-90)).toBe("W");
  });
});

describe("generallyTowards", () => {
  it("names the next borough when the car will cross into one", () => {
    // Highbury Corner, heading east: Hackney is about a kilometre away.
    expect(generallyTowards(51.5466, -0.1035, 90)).toBe("Hackney");
  });

  it("names an area ahead when staying in the same borough", () => {
    // Middle of Croydon heading north, with a made-up area 1.5 km ahead and one behind.
    const at = { lat: 51.372, lng: -0.1 };
    const ahead = projectAhead(at.lat, at.lng, 0, 1500);
    const behind = projectAhead(at.lat, at.lng, 180, 1500);
    expect(
      generallyTowards(at.lat, at.lng, 0, [
        { name: "Behind", ...behind },
        { name: "Ahead", ...ahead },
      ]),
    ).toBe("Ahead");
  });

  it("says so when there's nothing to name", () => {
    expect(generallyTowards(51.372, -0.1, 0, [])).toBeNull();
  });
});
