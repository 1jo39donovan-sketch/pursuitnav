import { describe, expect, it } from "vitest";

import { count, hasPending, installId, pending, resetInstallId, sent, type SettingsStore } from "../events";

const memory = (): SettingsStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getSetting: (k) => data.get(k) ?? null, setSetting: (k, v) => void data.set(k, v) };
};
let n = 0;
const randomHex = () => (++n).toString(16).padStart(32, "0");

describe("install ID", () => {
  it("is made once and kept", () => {
    const store = memory();
    const id = installId(store, randomHex);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(installId(store, randomHex)).toBe(id);
  });

  it("can be reset to a new one", () => {
    const store = memory();
    const id = installId(store, randomHex);
    const fresh = resetInstallId(store, randomHex);
    expect(fresh).not.toBe(id);
    expect(installId(store, randomHex)).toBe(fresh);
  });
});

describe("event counts", () => {
  it("are kept until sent, and only what was sent is taken off", () => {
    const store = memory();
    count(store, "navigation");
    count(store, "navigation");
    count(store, "timeout");
    const report = pending(store);
    expect(report).toEqual({ navigation: 2, timeout: 1 });
    count(store, "pursuit"); // while the report was on its way
    sent(store, report);
    expect(pending(store)).toEqual({ pursuit: 1 });
    sent(store, { pursuit: 1 });
    expect(hasPending(pending(store))).toBe(false);
  });

  it("hold nothing but the three numbers", () => {
    const store = memory();
    count(store, "pursuit");
    expect([...store.data.keys()]).toEqual(["usagePending"]);
    expect(JSON.parse(store.data.get("usagePending")!)).toEqual({ pursuit: 1 });
  });

  it("are capped while there's no signal", () => {
    const store = memory();
    for (let i = 0; i < 1200; i++) count(store, "timeout");
    expect(pending(store).timeout).toBe(1000);
  });
});
