import { describe, expect, it } from "vitest";

import { speakable, spokenRoad, startPrompt } from "../spokenText";

describe("directions as they're said", () => {
  it("never reads a slash or a road number before a road's name", () => {
    expect(speakable("Turn left onto A3/Clapham Road.")).toBe("Turn left onto Clapham Road.");
    expect(speakable("Turn right onto Bedford Road/B221.")).toBe("Turn right onto Bedford Road.");
    expect(speakable("Turn left onto A501/Penton Rise. Continue on A501.")).toBe("Turn left onto Penton Rise.");
  });

  it("says a bare road number as 'the A3'", () => {
    expect(speakable("Continue on A3.")).toBe("Continue on the A3.");
    expect(speakable("Take the exit onto A40(M).")).toBe("Take the exit onto the A40 motorway.");
  });

  it("says London names properly", () => {
    expect(speakable("Keep right towards Southwark Bridge Road.")).toBe("Keep right towards Suthuck Bridge Road.");
    expect(speakable("Turn left onto Marylebone Road.")).toBe("Turn left onto Marli-bun Road.");
  });

  it("starts with the road's name, not a compass point", () => {
    expect(startPrompt(["A3", "Clapham Road"], "Drive northeast on A3.")).toBe("Head along Clapham Road.");
    expect(startPrompt(["A3"], "Drive northeast on A3.", "Oval")).toBe("Head along the A3 towards Oval.");
    expect(startPrompt([], "Drive north.")).toBe("Drive north.");
    expect(spokenRoad(["A3/Clapham Road"])).toBe("Clapham Road");
  });
});
