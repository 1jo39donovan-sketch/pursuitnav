import { describe, expect, it, vi } from "vitest";

import { enlarge } from "../textSize";

vi.mock("../session/SessionProvider", () => ({ useSession: () => ({ largeText: true }) }));

describe("larger text", () => {
  it("grows small text by a quarter and big text a little, with its line height", () => {
    const base = { body: { fontSize: 16, lineHeight: 24, color: "#fff" }, big: { fontSize: 52 }, box: { padding: 4 } };
    const big = enlarge(base);
    expect(big.body).toEqual({ fontSize: 20, lineHeight: 30, color: "#fff" });
    expect(big.big).toEqual({ fontSize: 57 });
    expect(big.box).toBe(base.box);
    // Made once per set of styles.
    expect(enlarge(base)).toBe(big);
  });
});
