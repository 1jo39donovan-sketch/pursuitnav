import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { formatCode, newTeamCode, normaliseCode, open, seal, teamKeys } from "../crypto";

const random = (n: number) => new Uint8Array(randomBytes(n));

describe("team codes", () => {
  it("are 24 characters in groups of four", () => {
    expect(newTeamCode(random)).toMatch(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/);
  });

  it("forgive spaces, case and O for 0 when typed", () => {
    const code = normaliseCode(newTeamCode(random))!;
    const typed = formatCode(code).toLowerCase().replace(/-/g, " ").replace(/0/g, "o");
    expect(normaliseCode(typed)).toBe(code);
    expect(normaliseCode("ABCD")).toBeNull();
  });

  it("give the same team ID and key to everyone, and a different team to another code", () => {
    const code = newTeamCode(random);
    expect(teamKeys(code).teamId).toBe(teamKeys(code.toLowerCase()).teamId);
    expect(teamKeys(code).teamId).toMatch(/^[0-9a-f]{32}$/);
    expect(teamKeys(newTeamCode(random)).teamId).not.toBe(teamKeys(code).teamId);
  });
});

describe("sealing", () => {
  const { key } = teamKeys(newTeamCode(random));

  it("opens with the team key", () => {
    const value = { cs: "NI-31", p: [5154440, -14730] };
    expect(open(key, seal(key, value, random))).toEqual(value);
  });

  it("can't be opened with another team's key, or after tampering", () => {
    const blob = seal(key, { cs: "NI-31" }, random);
    expect(open(teamKeys(newTeamCode(random)).key, blob)).toBeNull();
    const flipped = blob.slice(0, 40) + (blob[40] === "A" ? "B" : "A") + blob.slice(41);
    expect(open(key, flipped)).toBeNull();
  });

  it("doesn't show the callsign in what the server holds", () => {
    expect(seal(key, { cs: "NI-31" }, random)).not.toContain("NI-31");
  });
});
