import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// The server address comes from the SERVER_DOMAIN variable at build time
// (android.yml, store.yml, web.yml), never from a value checked in here.
describe("eas.json", () => {
  it("names no server address", () => {
    const text = readFileSync(join(__dirname, "..", "..", "eas.json"), "utf8");
    expect(text).not.toContain("EXPO_PUBLIC_API_URL");
    expect(text).not.toMatch(/https?:\/\//);
  });
});
