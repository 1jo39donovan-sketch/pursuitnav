import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import type { ServerConfig } from "../../src/config.js";
import type { Router } from "../../src/valhalla.js";

const app = (contactEmail?: string) =>
  buildApp({ bounds: [-0.8, 51.2, 0.6, 51.8], contactEmail } as ServerConfig, {} as Router);

describe("privacy and support pages", () => {
  it("serves both as HTML", async () => {
    for (const url of ["/privacy", "/support", "/terms"]) {
      const res = await app().inject({ method: "GET", url });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
      expect(res.body).toContain("BlueRoute");
    }
  });

  it("shows the contact email when set, escaped", async () => {
    const res = await app("help@example.org").inject({ method: "GET", url: "/privacy" });
    expect(res.body).toContain('href="mailto:help@example.org"');
    const odd = await app('a"<b>@example.org').inject({ method: "GET", url: "/support" });
    expect(odd.body).not.toContain('a"<b>');
  });

  it("says where address searches go, and that they're only kept in memory", async () => {
    const res = await app().inject({ method: "GET", url: "/privacy" });
    expect(res.body).toContain("OS Names API");
    expect(res.body).toContain("only if the server is set up with it");
    expect(res.body).toContain("in memory for up to 24 hours");
    expect(res.body).toContain("never written to disk or logged");
    expect(res.body).toContain("House-number search runs");
  });

  it("says waitlist emails are only for telling people when the app is in the stores", async () => {
    const res = await app().inject({ method: "GET", url: "/privacy" });
    expect(res.body).toContain("only to\ntell you when BlueRoute is in the App Store and Google Play");
    expect(res.body).not.toContain("no tracking");
  });

  it("puts the responsibility for driving and for blue-light routes on the user", async () => {
    const res = await app().inject({ method: "GET", url: "/terms" });
    expect(res.body).toContain("solely responsible for how the vehicle is driven");
    expect(res.body).toContain("is your\n    decision alone");
    expect(res.body).toContain("“as is”");
    // What UK law doesn't let anyone exclude stays.
    expect(res.body).toContain("death or personal injury caused by negligence");
  });

  it("points at GitHub issues without one", async () => {
    const res = await app().inject({ method: "GET", url: "/support" });
    expect(res.body).toContain("github.com/1jo39donovan-sketch/pursuitnav/issues");
  });

  it("sends the root to the support page", async () => {
    const res = await app().inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/support");
  });
});
