import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import type { ServerConfig } from "../../src/config.js";
import { NoSuchTeamError, randomId, TeamStore } from "../../src/teams.js";

const T = "t".repeat(40);
const OTHER = "o".repeat(40);

describe("TeamStore", () => {
  it("keeps each member's sealed blob and only lets them change it", () => {
    const store = new TeamStore();
    const team = randomId();
    const me = randomId();
    store.put(team, me, T, "sealed-1", true);
    expect(() => store.put(team, me, OTHER, "forged")).toThrow();
    store.put(team, me, T, "sealed-2");
    expect(store.get(team).members.map((m) => m.blob)).toEqual(["sealed-2"]);
    expect(() => store.remove(team, me, OTHER)).toThrow();
    store.remove(team, me, T);
    expect(store.get(team).members).toEqual([]);
  });

  it("ends a team after a week and drops members who stopped sharing after a day", () => {
    let now = 0;
    const store = new TeamStore(() => now);
    const team = randomId();
    store.put(team, randomId(), T, "a", true);
    now = 25 * 3600_000;
    store.put(team, randomId(), T, "b");
    expect(store.get(team).members.map((m) => m.blob)).toEqual(["b"]);
    now = 8 * 24 * 3600_000;
    expect(() => store.get(team)).toThrow();
    // An ended team's code doesn't quietly start it again.
    expect(() => store.put(team, randomId(), T, "c")).toThrow(NoSuchTeamError);
  });

  it("only makes a team when asked: a mistyped code is refused", () => {
    const store = new TeamStore();
    const team = randomId();
    expect(() => store.put(team, randomId(), T, "joiner")).toThrow(NoSuchTeamError);
    expect(() => store.get(team)).toThrow(NoSuchTeamError);
    store.put(team, randomId(), T, "starter", true);
    store.put(team, randomId(), T, "joiner");
    expect(store.get(team).members).toHaveLength(2);
  });
});

describe("team API", () => {
  const config = { bounds: [-1, 51, 1, 52], placesFile: "/nonexistent" } as unknown as ServerConfig;
  const app = buildApp(config, { route: async () => ({}) as never, traceEdges: async () => [] });
  const team = randomId();
  const me = randomId();

  it("stores, lists and deletes", async () => {
    let res = await app.inject({ method: "GET", url: `/v1/teams/${team}` });
    expect(res.statusCode).toBe(404);
    // Joining a code nobody started: refused, and no team is made.
    res = await app.inject({ method: "PUT", url: `/v1/teams/${team}/members/${me}`, payload: { token: T, blob: "x" } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("no-team");
    res = await app.inject({ method: "GET", url: `/v1/teams/${team}` });
    expect(res.statusCode).toBe(404);
    res = await app.inject({
      method: "PUT",
      url: `/v1/teams/${team}/members/${me}`,
      payload: { token: T, blob: "x", create: true },
    });
    expect(res.statusCode).toBe(200);
    res = await app.inject({ method: "GET", url: `/v1/teams/${team}` });
    expect(res.json().members).toMatchObject([{ memberId: me, blob: "x" }]);
    res = await app.inject({ method: "PUT", url: `/v1/teams/${team}/members/${me}`, payload: { token: OTHER, blob: "y" } });
    expect(res.statusCode).toBe(403);
    res = await app.inject({ method: "DELETE", url: `/v1/teams/${team}/members/${me}`, payload: { token: T } });
    expect(res.statusCode).toBe(200);
  });

  it("refuses IDs that aren't the app's random ones", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/teams/1234" });
    expect(res.statusCode).toBe(400);
  });
});
