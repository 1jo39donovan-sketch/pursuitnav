import { describe, expect, it } from "vitest";

import { serverDuration, timingsText } from "../timings";

describe("route timings", () => {
  it("reads the server's own time from its header", () => {
    expect(serverDuration("plan;dur=812.4")).toBe(812);
    expect(serverDuration(null)).toBeUndefined();
  });

  it("says each step in seconds", () => {
    expect(
      timingsText({ cardsMs: 1400, entranceMs: 300, standardMs: 900, standardServerMs: 600, goToCardMs: 150 }),
    ).toBe("Tap to route cards 1.4 s · way in 0.3 s · standard 0.9 s (server 0.6 s) · GO to turn card 0.1 s");
    expect(timingsText({})).toBeNull();
  });
});
