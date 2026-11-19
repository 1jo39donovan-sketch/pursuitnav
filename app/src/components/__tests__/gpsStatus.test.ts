import { describe, expect, it, vi } from "vitest";

import { roughGpsText, webDeniedText, webDevice } from "../GpsStatus";

vi.mock("react-native", () => ({ Platform: { OS: "web" }, StyleSheet: { create: (s: unknown) => s }, Linking: {} }));
vi.mock("../../location/LocationProvider", () => ({}));
vi.mock("../../session/SessionProvider", () => ({}));
vi.mock("../../config", () => ({ DEMO_MODE: false }));

describe("blocked location in a browser", () => {
  it("tells each device where to allow it", () => {
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141 Safari/537.36";
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1";
    const android = "Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/141 Mobile Safari/537.36";
    expect(webDevice(mac)).toBe("desktop");
    expect(webDevice(iphone)).toBe("iphone");
    expect(webDevice(android)).toBe("android");
    expect(webDeniedText("desktop")).toMatch(/Site settings/);
    expect(webDeniedText("desktop")).not.toMatch(/iPhone|Safari/);
    expect(webDeniedText("iphone")).toMatch(/Safari Websites/);
  });

  it("says how to turn on Precise Location when the position is a rough guess", () => {
    expect(roughGpsText(13104, "iphone")).toMatch(/^GPS ±13 km/);
    expect(roughGpsText(13104, "iphone")).toMatch(/Precise Location/);
    expect(roughGpsText(2400, "android")).toMatch(/±2\.4 km.*precise location/);
    expect(roughGpsText(2400, "app")).toMatch(/Settings/);
  });
});
